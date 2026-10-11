# Data reference

Everything lives in the data directory, `~/.local/share/oura` by default
(`$OURA_DATA_DIR`). Run `oura status` to see where yours is.

- [Conventions](#conventions)
- [Files](#files): one section per CSV
- [Encoded strings](#encoded-strings): sleep stages, movement, activity classes
- [Sample arrays](#sample-arrays): turning `*.items` into timestamped series
- [glance.json](#glancejson): the summary for bars and widgets
- [Loading examples](#loading-examples)

## Conventions

- **One CSV per endpoint**, UTF-8, with a header row, sorted by date (or
  timestamp). Files only appear once that endpoint has returned data.
- **Nested objects are flattened with dots:** `contributors.hrv_balance`,
  `spo2_percentage.average`, `readiness.score`.
- **Arrays are JSON strings in a single cell.** An empty array is an empty
  cell. Sample arrays come with sibling `.interval` and `.timestamp` columns,
  see [Sample arrays](#sample-arrays).
- **Missing values are empty cells.** A column a record doesn't have stays
  empty for that row.
- **Units:** durations are in **seconds**, distances in **metres**, energy in
  **kcal**, temperatures in **°C deviation from your baseline**, and scores are
  **0–100**.
- **Days and times.** `day` is a local calendar date (`YYYY-MM-DD`). For
  sleep and readiness it's the day you **woke up**. Activity days run from
  **4 am to 4 am** local time. Timestamps are ISO 8601. Most carry your local
  UTC offset (`2026-10-11T05:42:27.000+01:00`); `heartrate` and
  `ring_battery_level` are in UTC (`…Z`).
- **Keys.** Records are identified by `id` (`timestamp` for `heartrate` and
  `ring_battery_level`). A re-fetched record replaces the stored row with the
  same key, so recent days stay up to date.
- **New fields.** When Oura adds a field, it becomes a new column at the end.
  Older rows have it empty.

## Files

### `daily_readiness.csv`: one row per day

| column | meaning |
|---|---|
| `day`, `id`, `timestamp` | Date, record ID, when computed. |
| `score` | Readiness score, 0–100. 85+ optimal, 70–84 good, 60–69 fair, under 60 pay attention. |
| `temperature_deviation` | Body temperature vs your baseline, °C. |
| `temperature_trend_deviation` | Weighted 3-day temperature trend vs baseline, °C. |
| `contributors.*` | 0–100 each: `activity_balance`, `body_temperature`, `hrv_balance`, `previous_day_activity`, `previous_night` (sleep), `recovery_index`, `resting_heart_rate`, `sleep_balance`, `sleep_regularity`. |

### `daily_sleep.csv`: one row per day

| column | meaning |
|---|---|
| `day`, `id`, `timestamp` | |
| `score` | Sleep score, 0–100. |
| `contributors.*` | 0–100 each: `deep_sleep`, `efficiency`, `latency`, `rem_sleep`, `restfulness`, `timing`, `total_sleep`. |

### `sleep.csv`: one row per sleep period (nights, naps, rests)

| column | meaning |
|---|---|
| `id`, `day` | `day` is the day the period ends. |
| `type` | `long_sleep` (main sleep), `sleep`, `late_nap`, `rest` or `deleted`. A day can have several. The dashboard uses the longest `long_sleep`. |
| `bedtime_start`, `bedtime_end` | In and out of bed (local offset). |
| `total_sleep_duration`, `time_in_bed`, `deep_sleep_duration`, `light_sleep_duration`, `rem_sleep_duration`, `awake_time`, `latency` | Seconds. |
| `efficiency` | Percent of time in bed spent asleep. |
| `average_heart_rate`, `lowest_heart_rate` | bpm. `lowest_heart_rate` is what Oura calls resting heart rate. |
| `average_hrv` | ms (RMSSD). |
| `average_breath` | Breaths per minute. |
| `restless_periods` | Count. |
| `heart_rate.items/.interval/.timestamp` | Overnight heart rate, one value per 300 s (nulls where unmeasured). |
| `hrv.items/.interval/.timestamp` | Overnight HRV, one value per 300 s. |
| `sleep_phase_5_min`, `app_sleep_phase_5_min` | Stage per 5 minutes. The `app_` version matches the Oura app. See [Encoded strings](#encoded-strings). |
| `sleep_phase_30_sec` | Stage per 30 seconds. |
| `movement_30_sec` | Movement per 30 seconds. See [Encoded strings](#encoded-strings). |
| `readiness.*` | The readiness computed from this period: `score`, `temperature_deviation`, `temperature_trend_deviation`, `contributors.*`. |
| `readiness_score_delta`, `sleep_score_delta` | How much this period (e.g. a nap) moved the day's scores. |
| `period`, `low_battery_alert`, `sleep_algorithm_version`, `sleep_analysis_reason`, `ring_id` | Housekeeping. |
| `heart_rate`, `hrv` | Empty legacy columns (the samples are in the dotted columns). |

### `sleep_time.csv`: bedtime guidance, one row per day

| column | meaning |
|---|---|
| `recommendation` | `improve_efficiency`, `earlier_bedtime`, `later_bedtime`, `earlier_wake_up_time`, `later_wake_up_time` or `follow_optimal_bedtime`. |
| `status` | `optimal_found`, `only_recommended_found`, `not_enough_nights`, `not_enough_recent_nights` or `bad_sleep_quality`. |
| `optimal_bedtime.start_offset`, `.end_offset` | The suggested bedtime window, in seconds from midnight (negative = the evening before). Empty unless `status` is `optimal_found`. |
| `optimal_bedtime.day_tz` | That day's time zone offset from GMT, seconds. |

### `daily_activity.csv`: one row per day

| column | meaning |
|---|---|
| `day`, `id`, `timestamp` | `timestamp` is the start of the activity day (4 am local). |
| `score` | Activity score, 0–100. |
| `steps` | Steps. |
| `active_calories`, `total_calories`, `target_calories` | kcal. The target is your daily activity goal. |
| `equivalent_walking_distance`, `target_meters`, `meters_to_target` | Metres. |
| `high_activity_time`, `medium_activity_time`, `low_activity_time`, `sedentary_time`, `resting_time`, `non_wear_time` | Seconds. |
| `high_/medium_/low_/sedentary_activity_met_minutes`, `average_met_minutes` | MET-minutes. |
| `inactivity_alerts` | Count of "time to move" alerts. |
| `class_5_min` | Activity class per 5 minutes from 4 am. See [Encoded strings](#encoded-strings). |
| `met.items/.interval/.timestamp` | MET per 60 s through the day. |
| `contributors.*` | 0–100 each: `meet_daily_targets`, `move_every_hour`, `recovery_time`, `stay_active`, `training_frequency`, `training_volume`. |

### `heartrate.csv`: time series (usually the largest file)

| column | meaning |
|---|---|
| `timestamp` | UTC. Spacing varies: about 5 minutes at rest, about 5 seconds during workouts. |
| `bpm` | Heart rate. |
| `source` | `awake`, `rest`, `workout`, `live`, `session` or `sleep`. In practice overnight heart rate comes as `sleep.csv`'s `heart_rate.*` samples rather than here. |
| `producer_timestamp` | When the ring recorded it, epoch ms. |

### `daily_stress.csv`: one row per day

| column | meaning |
|---|---|
| `stress_high` | Seconds in high stress during the day. |
| `recovery_high` | Seconds in high recovery ("restored"). |
| `day_summary` | `restored`, `normal`, `stressful`, or empty. |

### `daily_resilience.csv`: one row per day

| column | meaning |
|---|---|
| `level` | `limited`, `adequate`, `solid`, `strong` or `exceptional`. |
| `contributors.sleep_recovery`, `.daytime_recovery`, `.stress` | 0–100, over the past 14 days. |

### `daily_spo2.csv`: one row per night

| column | meaning |
|---|---|
| `spo2_percentage.average` | Average blood oxygen while asleep, %. **0 means not measured.** |
| `breathing_disturbance_index` | Breathing regularity disruptions per hour (lower is better). |

### `daily_cardiovascular_age.csv`

| column | meaning |
|---|---|
| `vascular_age` | Estimated cardiovascular age, years. |
| `pulse_wave_velocity` | m/s. Lower generally means more elastic arteries. |

### `vo2_max.csv`

`day`, `timestamp`, `vo2_max` (ml/kg/min). Only appears once you've taken the
walking test in the Oura app.

### `workout.csv`: one row per workout

| column | meaning |
|---|---|
| `activity` | e.g. `walking`, `running`, `cycling`, `yoga`, `golf`, `other`. |
| `start_datetime`, `end_datetime` | Local offset. |
| `calories` | kcal. |
| `distance` | Metres (empty when not applicable). |
| `intensity` | `easy`, `moderate` or `hard`. |
| `label` | Your own label, if any. |
| `source` | `manual`, `autodetected`, `confirmed`, `workout_heart_rate`, `live_oura_heart_rate` or `live_third_party_heart_rate`. |

### `ring_battery_level.csv`: time series

`timestamp` (UTC), `level` (%), `charging`, `in_charger` (`True`/`False`),
`producer_timestamp` (epoch ms).

### `ring_configuration.csv`

`hardware_type` (`gen1`, `gen2`, `gen2m`, `gen3`, `gen4`, `or5`), `design`
(e.g. `heritage`, `horizon`), `color` (e.g. `glossy_black`), `size`,
`firmware_version`, `set_up_at`.

### Present when you have such records

| file | contents |
|---|---|
| `session.csv` | Guided and unguided sessions: `type` (breathing, meditation, nap, relaxation, rest, body_status), `start_datetime`, `end_datetime`, `mood` (bad, worse, same, good, great), and `heart_rate.*`, `heart_rate_variability.*`, `motion_count.*` samples. |
| `enhanced_tag.csv` | Tags: `tag_type_code` or `custom_name`, `start_time`, `end_time`, `start_day`, `end_day`, `comment`. |
| `tag.csv` | Oura's older tag format: `day`, `timestamp`, `text`, `tags` (JSON). |
| `rest_mode_period.csv` | Rest mode: `start_day`, `end_day`, `start_time`, `end_time`, `episodes` (JSON). |

### Other files

| file | contents |
|---|---|
| `personal_info.json` | `age`, `weight` (kg), `height` (m), `biological_sex`, `email`, `id`. Rewritten on every sync. |
| `.state.json` | `{endpoint: last day fetched}`. Delete it (or use `oura sync --reset`) to re-fetch everything. |
| `.sync.lock` | Lock file so only one sync runs at a time. |

## Encoded strings

**Sleep stages** (`sleep_phase_5_min`, `app_sleep_phase_5_min`: one character
per 5 minutes from `bedtime_start`; `sleep_phase_30_sec`: per 30 seconds):

| `1` | `2` | `3` | `4` |
|---|---|---|---|
| deep | light | REM | awake |

**Movement** (`movement_30_sec`, per 30 seconds):

| `1` | `2` | `3` | `4` |
|---|---|---|---|
| no motion | restless | tossing and turning | active |

**Activity class** (`class_5_min`, per 5 minutes from the day's 4 am
`timestamp`):

| `0` | `1` | `2` | `3` | `4` | `5` |
|---|---|---|---|---|---|
| non-wear | rest | inactive | low | medium | high |

## Sample arrays

A sample series is three columns: `<name>.items` (a JSON list, `null` for gaps),
`<name>.interval` (seconds between samples) and `<name>.timestamp` (time of the
first sample).

```python
import json
from datetime import datetime, timedelta

def series(row, name):
    """[(datetime, value), ...] from a flattened sample series."""
    if not row.get(f"{name}.items"):
        return []
    start = datetime.fromisoformat(row[f"{name}.timestamp"])
    step = timedelta(seconds=float(row[f"{name}.interval"]))
    return [(start + i * step, v) for i, v in enumerate(json.loads(row[f"{name}.items"]))]
```

## glance.json

`~/.local/state/oura/glance.json` (under `$XDG_STATE_HOME`) is rewritten
atomically after every sync, and by `oura glance`. It's meant to be watched
rather than polled.

```jsonc
{
  "version": 1,
  "generated": 1791697711791,   // epoch ms: when this file was written
  "synced": 1791697711791,      // epoch ms: last successful sync (null if never)
  "error": null,                // why the last sync failed: "not logged in", a network error, "some endpoints failed"
  "age": 27,                    // from personal_info, for "x years younger"
  "latest": "2026-10-11",       // most recent day that has a readiness score
  "days": [                     // the last 7 calendar days, oldest first, today last
    {
      "day": "2026-10-11",
      "readiness": 85,          // 0–100 or null (same for the next two)
      "sleep_score": 81,
      "activity": null,         // today's activity score arrives during the day
      "contributors": { "Recovery index": 100, "HRV balance": 83, … },  // readiness contributors by label
      "strongest": "Recovery index",
      "weakest": "Activity balance",
      "rhr": 47,                // lowest overnight heart rate, bpm
      "hrv": 75,                // average overnight HRV, ms
      "temp": -0.24,            // temperature deviation, °C
      "breath": 12.625,         // breaths per minute
      "spo2": 96.555,           // %
      "steps": 6847,
      "active_calories": 330,
      "target_calories": 500,
      "stressed": 900,          // seconds
      "restored": 0,            // seconds
      "stress_summary": null,   // "restored" | "normal" | "stressful" | null
      "resilience": "solid",    // "limited" … "exceptional" | null
      "vascular_age": 24,
      "sleep": {                // the main sleep ending that day, or null
        "start": 1791661619000, "end": 1791693747000,   // epoch ms
        "total": 29310, "in_bed": 32128,                 // seconds
        "deep": 8790, "rem": 9090, "light": 11430, "awake": 2818,
        "efficiency": 91,
        "phases": "4222111…"    // one character per 5 minutes (1 deep, 2 light, 3 REM, 4 awake)
      }
    }
  ]
}
```

Any value can be `null` when Oura has no data for it. Whole numbers are written
as integers. Fields are only ever added within `version: 1`.

## Loading examples

Standard library only:

```python
import csv
from oura.paths import data_dir     # or: Path.home() / ".local/share/oura"

readiness = {r["day"]: int(r["score"]) for r in csv.DictReader(open(data_dir() / "daily_readiness.csv")) if r["score"]}
nights = [r for r in csv.DictReader(open(data_dir() / "sleep.csv")) if r["type"] == "long_sleep"]
last = nights[-1]
print(last["day"], int(last["total_sleep_duration"]) / 3600, "hours")
print("stages:", last["app_sleep_phase_5_min"])
```

pandas:

```python
import pandas as pd
d = data_dir()
sleep = pd.read_csv(d / "sleep.csv", parse_dates=["bedtime_start", "bedtime_end"])
main = sleep[sleep.type == "long_sleep"].set_index("day")
hr = pd.read_csv(d / "heartrate.csv", parse_dates=["timestamp"]).set_index("timestamp")
daily = pd.read_csv(d / "daily_readiness.csv", index_col="day")
daily[["score", "contributors.hrv_balance"]].plot()
```

The ready-made scripts in `analysis/` (`python analysis/heartrate.py` from the
dev shell) are further examples.
