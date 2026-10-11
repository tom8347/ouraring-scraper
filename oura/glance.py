"""
glance.json: a small, self-contained summary of the last week for status bars
and other at-a-glance views (the Quickshell bar applet reads it). Rewritten
after every sync; readers can watch the file instead of polling anything.

    {
      "version": 1,
      "generated": <epoch ms>,          # when this file was written
      "synced": <epoch ms> | null,      # last successful sync
      "error": null | "not logged in" | ...,
      "age": 27,
      "latest": "2026-10-11",           # most recent day with a readiness score
      "days": [ { "day": "2026-10-05", ... }, ... ]   # last 7 days, oldest first
    }

Scores are 0-100; durations in seconds; times are epoch ms; sleep `phases` is
one character per 5 minutes (1 deep, 2 light, 3 REM, 4 awake).
"""

import json
import time
from datetime import date, timedelta

from . import paths
from .store import RESILIENCE_LEVELS, DataStore, epoch_ms, num

DAYS = 7

READINESS_CONTRIBUTORS = {
    "resting_heart_rate": "Resting heart rate", "hrv_balance": "HRV balance",
    "body_temperature": "Body temperature", "recovery_index": "Recovery index",
    "previous_night": "Sleep", "sleep_balance": "Sleep balance",
    "sleep_regularity": "Sleep regularity", "previous_day_activity": "Previous day activity",
    "activity_balance": "Activity balance",
}


def _day(store, day):
    m = store.daily.get(day, {})
    contributors = {label: m.get(f"rc_{k}") for k, label in READINESS_CONTRIBUTORS.items()
                    if m.get(f"rc_{k}") is not None}
    ranked = sorted(contributors.items(), key=lambda kv: kv[1])

    s = store.main_sleep(day)
    sleep = None
    if s:
        sleep = {
            "start": epoch_ms(s.get("bedtime_start")),
            "end": epoch_ms(s.get("bedtime_end")),
            "total": num(s.get("total_sleep_duration")),
            "in_bed": num(s.get("time_in_bed")),
            "deep": num(s.get("deep_sleep_duration")),
            "rem": num(s.get("rem_sleep_duration")),
            "light": num(s.get("light_sleep_duration")),
            "awake": num(s.get("awake_time")),
            "efficiency": num(s.get("efficiency")),
            "phases": s.get("app_sleep_phase_5_min") or s.get("sleep_phase_5_min") or "",
        }

    level = m.get("resilience_level")
    secs = lambda v: v * 60 if v is not None else None
    return {
        "day": day,
        "readiness": m.get("readiness_score"),
        "sleep_score": m.get("sleep_score"),
        "activity": m.get("activity_score"),
        "contributors": contributors,
        "weakest": ranked[0][0] if ranked else None,
        "strongest": ranked[-1][0] if ranked else None,
        "rhr": m.get("rhr"),
        "hrv": m.get("hrv"),
        "temp": m.get("readiness_temp"),
        "breath": m.get("sleep_breath"),
        "spo2": m.get("spo2"),
        "steps": m.get("steps"),
        "active_calories": m.get("active_calories"),
        "target_calories": m.get("target_calories"),
        "stressed": secs(m.get("stress_high")),
        "restored": secs(m.get("recovery_high")),
        "stress_summary": store.stress.get(day, {}).get("day_summary") or None,
        "resilience": RESILIENCE_LEVELS[int(level) - 1] if level else None,
        "vascular_age": m.get("vascular_age"),
        "sleep": sleep,
    }


def _tidy(obj):
    """Whole numbers as ints (85, not 85.0), so scripts and widgets print them cleanly."""
    if isinstance(obj, float) and obj.is_integer():
        return int(obj)
    if isinstance(obj, dict):
        return {k: _tidy(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_tidy(v) for v in obj]
    return obj


def build(store=None):
    store = store or DataStore(heartrate=False)
    today = date.today()
    days = [(today - timedelta(days=i)).isoformat() for i in range(DAYS - 1, -1, -1)]
    with_readiness = [d for d in store.days if store.daily[d].get("readiness_score") is not None]
    profile = store._read_json("personal_info.json") or {}
    return {
        "latest": with_readiness[-1] if with_readiness else None,
        "age": profile.get("age"),
        "days": [_tidy(_day(store, d)) for d in days],
    }


def write(error=None):
    """Rebuild glance.json from the data on disk; `error` records why a sync failed."""
    path = paths.glance_file()
    previous = {}
    if path.exists():
        try:
            previous = json.loads(path.read_text())
        except ValueError:
            pass
    now = int(time.time() * 1000)
    try:
        body = build()
    except Exception as e:  # no data yet, or unreadable: keep what we had
        body = {k: previous.get(k) for k in ("latest", "age", "days")}
        error = error or f"summary failed: {e}"
    out = {
        "version": 1,
        "generated": now,
        "synced": previous.get("synced") if error else now,
        "error": error,
        **body,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(out, separators=(",", ":")))
    tmp.replace(path)  # atomic, so a watching reader never sees half a file
    return out
