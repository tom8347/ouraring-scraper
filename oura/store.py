"""
Loads the scraper's CSV files and shapes them for the dashboard.

Everything is plain stdlib: rows are read with csv.DictReader, numbers are
parsed on demand, and per-day views are assembled from the raw records.
"""

import bisect
import csv
import json
import os
import time
from array import array
from datetime import datetime, timedelta

from . import paths

RESILIENCE_LEVELS = ["limited", "adequate", "solid", "strong", "exceptional"]
MAIN_SLEEP = "long_sleep"


def num(v):
    """Parse a CSV cell to float, or None."""
    if v is None or v == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def arr(v):
    """Parse a JSON-encoded array cell (empty -> [])."""
    return json.loads(v) if v else []


def ts(v):
    """Parse an ISO timestamp (with offset or Z) to an aware datetime."""
    return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None


def epoch_ms(v):
    d = ts(v)
    return int(d.timestamp() * 1000) if d else None


# ---------------------------------------------------------------------------
# Metric catalogue: every daily value the dashboard can chart.
# (key, label, unit, group, decimals)
# ---------------------------------------------------------------------------

METRICS = [
    ("readiness_score", "Readiness score", "", "Readiness", 0),
    ("readiness_temp", "Temperature deviation", "°C", "Readiness", 2),
    ("readiness_temp_trend", "Temperature trend", "°C", "Readiness", 2),
    ("rc_activity_balance", "Activity balance", "", "Readiness", 0),
    ("rc_body_temperature", "Body temperature", "", "Readiness", 0),
    ("rc_hrv_balance", "HRV balance", "", "Readiness", 0),
    ("rc_previous_day_activity", "Previous day activity", "", "Readiness", 0),
    ("rc_previous_night", "Previous night", "", "Readiness", 0),
    ("rc_recovery_index", "Recovery index", "", "Readiness", 0),
    ("rc_resting_heart_rate", "Resting heart rate (score)", "", "Readiness", 0),
    ("rc_sleep_balance", "Sleep balance", "", "Readiness", 0),
    ("rc_sleep_regularity", "Sleep regularity", "", "Readiness", 0),

    ("sleep_score", "Sleep score", "", "Sleep", 0),
    ("sleep_total", "Total sleep", "h", "Sleep", 2),
    ("sleep_in_bed", "Time in bed", "h", "Sleep", 2),
    ("sleep_deep", "Deep sleep", "h", "Sleep", 2),
    ("sleep_rem", "REM sleep", "h", "Sleep", 2),
    ("sleep_light", "Light sleep", "h", "Sleep", 2),
    ("sleep_awake", "Awake time", "h", "Sleep", 2),
    ("sleep_efficiency", "Sleep efficiency", "%", "Sleep", 0),
    ("sleep_latency", "Sleep latency", "min", "Sleep", 0),
    ("sleep_bedtime", "Bedtime", "clock", "Sleep", 2),
    ("sleep_waketime", "Wake time", "clock", "Sleep", 2),
    ("sleep_restless", "Restless periods", "", "Sleep", 0),
    ("sleep_breath", "Respiratory rate", "/min", "Sleep", 1),
    ("sc_deep_sleep", "Deep sleep (score)", "", "Sleep", 0),
    ("sc_efficiency", "Efficiency (score)", "", "Sleep", 0),
    ("sc_latency", "Latency (score)", "", "Sleep", 0),
    ("sc_rem_sleep", "REM sleep (score)", "", "Sleep", 0),
    ("sc_restfulness", "Restfulness", "", "Sleep", 0),
    ("sc_timing", "Timing", "", "Sleep", 0),
    ("sc_total_sleep", "Total sleep (score)", "", "Sleep", 0),

    ("activity_score", "Activity score", "", "Activity", 0),
    ("steps", "Steps", "", "Activity", 0),
    ("active_calories", "Active calories", "kcal", "Activity", 0),
    ("total_calories", "Total burn", "kcal", "Activity", 0),
    ("target_calories", "Activity goal", "kcal", "Activity", 0),
    ("walking_distance", "Walking distance", "km", "Activity", 2),
    ("high_activity", "High activity", "min", "Activity", 0),
    ("medium_activity", "Medium activity", "min", "Activity", 0),
    ("low_activity", "Low activity", "min", "Activity", 0),
    ("sedentary_time", "Sedentary time", "h", "Activity", 1),
    ("inactivity_alerts", "Inactivity alerts", "", "Activity", 0),
    ("workout_minutes", "Workout time", "min", "Activity", 0),
    ("workout_calories", "Workout calories", "kcal", "Activity", 0),
    ("ac_meet_daily_targets", "Meet daily goals", "", "Activity", 0),
    ("ac_move_every_hour", "Move every hour", "", "Activity", 0),
    ("ac_recovery_time", "Recovery time", "", "Activity", 0),
    ("ac_stay_active", "Stay active", "", "Activity", 0),
    ("ac_training_frequency", "Training frequency", "", "Activity", 0),
    ("ac_training_volume", "Training volume", "", "Activity", 0),

    ("rhr", "Lowest heart rate", "bpm", "Heart", 0),
    ("sleep_avg_hr", "Average sleeping HR", "bpm", "Heart", 1),
    ("hrv", "Average HRV", "ms", "Heart", 0),
    ("day_hr_avg", "Daytime average HR", "bpm", "Heart", 0),
    ("day_hr_min", "Daytime lowest HR", "bpm", "Heart", 0),
    ("day_hr_max", "Daytime highest HR", "bpm", "Heart", 0),
    ("vascular_age", "Cardiovascular age", "yrs", "Heart", 0),
    ("pwv", "Pulse wave velocity", "m/s", "Heart", 2),
    ("vo2_max", "VO2 max", "ml/kg/min", "Heart", 1),

    ("stress_high", "Stressed", "min", "Stress", 0),
    ("recovery_high", "Restored", "min", "Stress", 0),
    ("resilience_level", "Resilience level", "level", "Stress", 0),
    ("res_sleep_recovery", "Nighttime recovery", "", "Stress", 1),
    ("res_daytime_recovery", "Daytime recovery", "", "Stress", 1),
    ("res_stress", "Daytime stress load", "", "Stress", 1),

    ("spo2", "Blood oxygen (SpO2)", "%", "Body", 1),
    ("bdi", "Breathing disturbance index", "", "Body", 0),
]


HR_SOURCES = ["awake", "rest", "workout", "live", "sleep", "session"]


class DataStore:
    def __init__(self, data_dir=None, heartrate=True):
        self.data_dir = str(data_dir or paths.data_dir())
        self.with_heartrate = heartrate
        self.reload()

    # -- loading ---------------------------------------------------------

    def _read(self, stem):
        path = os.path.join(self.data_dir, f"{stem}.csv")
        if not os.path.exists(path):
            return []
        with open(path, newline="", encoding="utf-8") as f:
            return list(csv.DictReader(f))

    def _by_day(self, stem, key="day"):
        return {r[key]: r for r in self._read(stem) if r.get(key)}

    def reload(self):
        self.readiness = self._by_day("daily_readiness")
        self.daily_sleep = self._by_day("daily_sleep")
        self.activity = self._by_day("daily_activity")
        self.stress = self._by_day("daily_stress")
        self.resilience = self._by_day("daily_resilience")
        self.spo2 = self._by_day("daily_spo2")
        self.cva = self._by_day("daily_cardiovascular_age")
        self.vo2 = self._by_day("vo2_max")
        self.sleep_time = self._by_day("sleep_time")

        self.sleeps = {}
        for r in self._read("sleep"):
            self.sleeps.setdefault(r["day"], []).append(r)

        self.workouts = {}
        for r in self._read("workout"):
            self.workouts.setdefault(r["day"], []).append(r)

        self.sessions = {}
        for r in self._read("session"):
            self.sessions.setdefault(r.get("day", ""), []).append(r)
        self.tags = {}
        for stem in ("enhanced_tag", "tag"):
            for r in self._read(stem):
                day = r.get("start_day") or r.get("day", "")
                self.tags.setdefault(day, []).append(r)

        if self.with_heartrate:
            self._load_heartrate()
        else:
            self.hr_t, self.hr_bpm, self.hr_src, self.hr_daily = array("q"), array("H"), array("B"), {}
        self.battery = sorted(
            (epoch_ms(r["timestamp"]), num(r["level"]), r.get("charging") == "True")
            for r in self._read("ring_battery_level")
        )
        self._build_daily()

    def _load_heartrate(self):
        """
        Heart rate as compact parallel arrays (epoch ms, bpm, source index),
        sorted by time, plus per-local-day [sum, count, min, max] excluding
        workouts (keeps daytime stats free of exercise spikes).
        """
        self.hr_t, self.hr_bpm, self.hr_src = array("q"), array("H"), array("B")
        self.hr_daily = {}
        path = os.path.join(self.data_dir, "heartrate.csv")
        if not os.path.exists(path):
            return
        with open(path, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            it, ib, isrc = header.index("timestamp"), header.index("bpm"), header.index("source")
            for row in reader:  # the scraper writes this file sorted by timestamp
                t = ts(row[it]).timestamp()
                bpm = int(float(row[ib]))
                src = row[isrc]
                if src not in HR_SOURCES:
                    HR_SOURCES.append(src)
                self.hr_t.append(int(t * 1000))
                self.hr_bpm.append(bpm)
                self.hr_src.append(HR_SOURCES.index(src))
                if src == "workout":
                    continue
                agg = self.hr_daily.setdefault(time.strftime("%Y-%m-%d", time.localtime(t)), [0, 0, 999, 0])
                agg[0] += bpm
                agg[1] += 1
                agg[2] = min(agg[2], bpm)
                agg[3] = max(agg[3], bpm)

    # -- per-day derived values -------------------------------------------

    def main_sleep(self, day):
        """The main (long) sleep for a day; falls back to the longest period."""
        periods = self.sleeps.get(day, [])
        if not periods:
            return None
        longs = [p for p in periods if p.get("type") == MAIN_SLEEP] or periods
        return max(longs, key=lambda p: num(p.get("total_sleep_duration")) or 0)

    def _build_daily(self):
        days = set()
        for src in (self.readiness, self.daily_sleep, self.activity, self.stress,
                    self.resilience, self.spo2, self.cva, self.sleeps, self.hr_daily):
            days.update(src)
        self.days = sorted(d for d in days if d)
        self.daily = {d: self._metrics_for(d) for d in self.days}

    def _metrics_for(self, day):
        m = {}
        rd = self.readiness.get(day, {})
        m["readiness_score"] = num(rd.get("score"))
        m["readiness_temp"] = num(rd.get("temperature_deviation"))
        m["readiness_temp_trend"] = num(rd.get("temperature_trend_deviation"))
        for k, v in rd.items():
            if k.startswith("contributors."):
                m["rc_" + k.split(".", 1)[1]] = num(v)

        ds = self.daily_sleep.get(day, {})
        m["sleep_score"] = num(ds.get("score"))
        for k, v in ds.items():
            if k.startswith("contributors."):
                m["sc_" + k.split(".", 1)[1]] = num(v)

        s = self.main_sleep(day)
        if s:
            hours = lambda k: (num(s.get(k)) or 0) / 3600 if s.get(k) else None
            m["sleep_total"] = hours("total_sleep_duration")
            m["sleep_in_bed"] = hours("time_in_bed")
            m["sleep_deep"] = hours("deep_sleep_duration")
            m["sleep_rem"] = hours("rem_sleep_duration")
            m["sleep_light"] = hours("light_sleep_duration")
            m["sleep_awake"] = hours("awake_time")
            m["sleep_efficiency"] = num(s.get("efficiency"))
            lat = num(s.get("latency"))
            m["sleep_latency"] = lat / 60 if lat is not None else None
            m["sleep_restless"] = num(s.get("restless_periods"))
            m["sleep_breath"] = num(s.get("average_breath"))
            m["rhr"] = num(s.get("lowest_heart_rate"))
            m["sleep_avg_hr"] = num(s.get("average_heart_rate"))
            m["hrv"] = num(s.get("average_hrv"))
            m["sleep_bedtime"] = _clock_hours(s.get("bedtime_start"), evening=True)
            m["sleep_waketime"] = _clock_hours(s.get("bedtime_end"))

        a = self.activity.get(day, {})
        if a:
            m["activity_score"] = num(a.get("score"))
            m["steps"] = num(a.get("steps"))
            m["active_calories"] = num(a.get("active_calories"))
            m["total_calories"] = num(a.get("total_calories"))
            m["target_calories"] = num(a.get("target_calories"))
            dist = num(a.get("equivalent_walking_distance"))
            m["walking_distance"] = dist / 1000 if dist is not None else None
            for k in ("high", "medium", "low"):
                v = num(a.get(f"{k}_activity_time"))
                m[f"{k}_activity"] = v / 60 if v is not None else None
            sed = num(a.get("sedentary_time"))
            m["sedentary_time"] = sed / 3600 if sed is not None else None
            m["inactivity_alerts"] = num(a.get("inactivity_alerts"))
            for k, v in a.items():
                if k.startswith("contributors."):
                    m["ac_" + k.split(".", 1)[1]] = num(v)

        wos = self.workouts.get(day, [])
        if wos:
            m["workout_minutes"] = sum(
                (ts(w["end_datetime"]) - ts(w["start_datetime"])).total_seconds() / 60 for w in wos)
            m["workout_calories"] = sum(num(w.get("calories")) or 0 for w in wos)

        hr = self.hr_daily.get(day)
        if hr:
            m["day_hr_avg"] = hr[0] / hr[1]
            m["day_hr_min"] = hr[2]
            m["day_hr_max"] = hr[3]

        c = self.cva.get(day, {})
        m["vascular_age"] = num(c.get("vascular_age"))
        m["pwv"] = num(c.get("pulse_wave_velocity"))
        m["vo2_max"] = num(self.vo2.get(day, {}).get("vo2_max"))

        st = self.stress.get(day, {})
        for k in ("stress_high", "recovery_high"):
            v = num(st.get(k))
            m[k] = v / 60 if v is not None else None

        res = self.resilience.get(day, {})
        lvl = res.get("level")
        m["resilience_level"] = RESILIENCE_LEVELS.index(lvl) + 1 if lvl in RESILIENCE_LEVELS else None
        m["res_sleep_recovery"] = num(res.get("contributors.sleep_recovery"))
        m["res_daytime_recovery"] = num(res.get("contributors.daytime_recovery"))
        m["res_stress"] = num(res.get("contributors.stress"))

        sp = self.spo2.get(day, {})
        spo2 = num(sp.get("spo2_percentage.average"))
        m["spo2"] = spo2 if spo2 else None  # 0 means "not measured"
        m["bdi"] = num(sp.get("breathing_disturbance_index"))
        return {k: v for k, v in m.items() if v is not None}

    # -- API payloads -------------------------------------------------------

    def summary(self):
        """All daily metrics as column arrays aligned to `days`."""
        keys = [k for k, *_ in METRICS]
        values = {k: [self.daily[d].get(k) for d in self.days] for k in keys}
        metrics = [
            {"key": k, "label": lbl, "unit": u, "group": g, "decimals": dec}
            for k, lbl, u, g, dec in METRICS
            if any(v is not None for v in values[k])
        ]
        labels = {
            "stress_summary": {d: self.stress[d].get("day_summary") for d in self.stress},
            "resilience": {d: self.resilience[d].get("level") for d in self.resilience},
        }
        return {
            "days": self.days,
            "metrics": metrics,
            "values": {m["key"]: _round(values[m["key"]]) for m in metrics},
            "labels": labels,
            "profile": self._read_json("personal_info.json"),
        }

    def day(self, day):
        """Everything needed to render one day's detail views."""
        s = self.main_sleep(day)
        sleep = None
        if s:
            sleep = {
                "start": epoch_ms(s.get("bedtime_start")),
                "end": epoch_ms(s.get("bedtime_end")),
                "phases": s.get("app_sleep_phase_5_min") or s.get("sleep_phase_5_min") or "",
                "movement": s.get("movement_30_sec") or "",
                "hr": _samples(s, "heart_rate"),
                "hrv": _samples(s, "hrv"),
                "durations": {k: num(s.get(f"{k}_sleep_duration")) for k in ("deep", "rem", "light")}
                | {"awake": num(s.get("awake_time")), "total": num(s.get("total_sleep_duration")),
                   "in_bed": num(s.get("time_in_bed"))},
            }
        naps = [
            {"type": p.get("type"), "start": epoch_ms(p.get("bedtime_start")),
             "end": epoch_ms(p.get("bedtime_end")), "total": num(p.get("total_sleep_duration"))}
            for p in self.sleeps.get(day, []) if p is not s
        ]

        a = self.activity.get(day)
        activity = None
        if a:
            activity = {
                "start": epoch_ms(a.get("timestamp")),
                "class_5_min": a.get("class_5_min") or "",
                "met": _samples(a, "met"),
            }

        # Local-day window for heart rate and battery samples
        start = datetime.fromisoformat(day).astimezone()
        lo, hi = int(start.timestamp() * 1000), int((start + timedelta(days=1)).timestamp() * 1000)
        i, j = bisect.bisect_left(self.hr_t, lo), bisect.bisect_left(self.hr_t, hi)
        heartrate = [[self.hr_t[k], self.hr_bpm[k], HR_SOURCES[self.hr_src[k]]] for k in range(i, j)]
        battery = [[t, lvl, ch] for t, lvl, ch in self.battery if lo - 86400000 <= t < hi]

        st = self.sleep_time.get(day, {})
        return {
            "day": day,
            "metrics": self.daily.get(day, {}),
            "sleep": sleep,
            "naps": naps,
            "activity": activity,
            "heartrate": heartrate,
            "battery": battery,
            "workouts": [
                {"activity": w.get("activity"), "label": w.get("label"), "intensity": w.get("intensity"),
                 "start": epoch_ms(w.get("start_datetime")), "end": epoch_ms(w.get("end_datetime")),
                 "calories": num(w.get("calories")), "distance": num(w.get("distance")),
                 "source": w.get("source")}
                for w in self.workouts.get(day, [])
            ],
            "sessions": [
                {"type": x.get("type"), "start": epoch_ms(x.get("start_datetime")),
                 "end": epoch_ms(x.get("end_datetime")), "mood": x.get("mood")}
                for x in self.sessions.get(day, [])
            ],
            "tags": [
                {"name": t.get("custom_name") or t.get("tag_type_code") or t.get("text") or "tag",
                 "comment": t.get("comment") or ""}
                for t in self.tags.get(day, [])
            ],
            "stress_summary": self.stress.get(day, {}).get("day_summary"),
            "resilience": self.resilience.get(day, {}).get("level"),
            "bedtime": {"recommendation": st.get("recommendation"), "status": st.get("status"),
                        "start": num(st.get("optimal_bedtime.start_offset")),
                        "end": num(st.get("optimal_bedtime.end_offset"))} if st else None,
        }

    def meta(self):
        """Files on disk, sync state, scopes and ring details for the Data page."""
        files = []
        for name in sorted(os.listdir(self.data_dir)):
            path = os.path.join(self.data_dir, name)
            if not os.path.isfile(path) or name.startswith(".") or name.endswith(".tmp"):
                continue
            info = {"name": name, "size": os.path.getsize(path),
                    "modified": int(os.path.getmtime(path) * 1000)}
            if name.endswith(".csv"):
                with open(path, newline="", encoding="utf-8") as f:
                    reader = csv.reader(f)
                    header = next(reader, [])
                    first = last = None
                    rows = 0
                    for row in reader:
                        rows += 1
                        first = first or row
                        last = row
                col = next((header.index(c) for c in ("day", "timestamp", "start_day") if c in header), None)
                info |= {"rows": rows, "columns": header,
                         "from": first[col][:10] if col is not None and first else None,
                         "to": last[col][:10] if col is not None and last else None}
            files.append(info)

        tokens = json.loads(paths.tokens_file().read_text()) if paths.tokens_file().exists() else {}
        state_file = paths.sync_state_file()
        state = json.loads(state_file.read_text()) if state_file.exists() else {}
        ring = self._read("ring_configuration")
        return {
            "files": files,
            "state": state,
            "scopes": sorted(s.split(":", 1)[-1] for s in tokens.get("scope", "").split()),
            "ring": ring[-1] if ring else None,
            "profile": self._read_json("personal_info.json"),
            "battery": [[t, lvl, ch] for t, lvl, ch in self.battery[-2000:]],
            "data_dir": self.data_dir,
        }

    def _read_json(self, name):
        path = os.path.join(self.data_dir, name)
        if not os.path.exists(path):
            return None
        with open(path) as f:
            return json.load(f)


def _samples(row, prefix):
    """Rebuild a {start, interval, items} sample series from flattened columns."""
    items = arr(row.get(f"{prefix}.items"))
    if not items:
        return None
    return {"start": epoch_ms(row.get(f"{prefix}.timestamp")),
            "interval": num(row.get(f"{prefix}.interval")), "items": items}


def _clock_hours(v, evening=False):
    """Local clock time as hours; evening times map past midnight to >24."""
    d = ts(v)
    if not d:
        return None
    h = d.hour + d.minute / 60
    if evening and h < 15:
        h += 24
    return h


def _round(values):
    return [round(v, 3) if isinstance(v, float) else v for v in values]
