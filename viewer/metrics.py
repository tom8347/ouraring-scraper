from dataclasses import dataclass, field
from typing import Optional, Callable


@dataclass
class Metric:
    key: str
    label: str
    file_stem: str
    date_column: str
    value_column: str
    unit: str
    group: str
    plot_type: str = "line"
    color: Optional[str] = None
    value_transform: Optional[Callable] = None
    scale_group: str = ""
    row_filter: Optional[Callable] = None


def _seconds_to_hours(v):
    return v / 3600


def _long_sleep(row):
    return row.get("type") == "long_sleep"


METRICS = [
    # Sleep
    Metric("sleep_score", "Sleep Score", "daily_sleep", "day", "score",
           "", "Sleep", color="#6a5acd", scale_group="score_0_100"),
    Metric("sleep_deep", "Deep Sleep Contrib", "daily_sleep", "day", "contributors.deep_sleep",
           "", "Sleep", color="#483d8b", scale_group="score_0_100"),
    Metric("sleep_efficiency", "Efficiency Contrib", "daily_sleep", "day", "contributors.efficiency",
           "", "Sleep", color="#7b68ee", scale_group="score_0_100"),
    Metric("sleep_rem", "REM Contrib", "daily_sleep", "day", "contributors.rem_sleep",
           "", "Sleep", color="#9370db", scale_group="score_0_100"),
    Metric("sleep_restfulness", "Restfulness Contrib", "daily_sleep", "day", "contributors.restfulness",
           "", "Sleep", color="#8b7fc7", scale_group="score_0_100"),
    Metric("sleep_total_duration", "Total Sleep (h)", "sleep", "day", "total_sleep_duration",
           "h", "Sleep", color="#4169e1", scale_group="hours",
           value_transform=_seconds_to_hours, row_filter=_long_sleep),
    Metric("sleep_deep_duration", "Deep Sleep (h)", "sleep", "day", "deep_sleep_duration",
           "h", "Sleep", color="#191970", scale_group="hours",
           value_transform=_seconds_to_hours, row_filter=_long_sleep),
    Metric("sleep_rem_duration", "REM Sleep (h)", "sleep", "day", "rem_sleep_duration",
           "h", "Sleep", color="#6959cd", scale_group="hours",
           value_transform=_seconds_to_hours, row_filter=_long_sleep),
    Metric("sleep_latency", "Sleep Latency (min)", "sleep", "day", "latency",
           "min", "Sleep", color="#5b4fa0", scale_group="seconds",
           value_transform=lambda v: v / 60, row_filter=_long_sleep),
    Metric("sleep_avg_hr", "Sleep Avg HR", "sleep", "day", "average_heart_rate",
           "bpm", "Sleep", color="#cd5c5c", scale_group="bpm", row_filter=_long_sleep),
    Metric("sleep_avg_hrv", "Sleep Avg HRV", "sleep", "day", "average_hrv",
           "ms", "Sleep", color="#20b2aa", scale_group="hrv_ms", row_filter=_long_sleep),
    Metric("sleep_lowest_hr", "Sleep Lowest HR", "sleep", "day", "lowest_heart_rate",
           "bpm", "Sleep", color="#b22222", scale_group="bpm", row_filter=_long_sleep),
    Metric("sleep_efficiency_pct", "Sleep Efficiency %", "sleep", "day", "efficiency",
           "%", "Sleep", color="#4682b4", scale_group="percent", row_filter=_long_sleep),

    # Activity
    Metric("activity_score", "Activity Score", "daily_activity", "day", "score",
           "", "Activity", color="#2e8b57", scale_group="score_0_100"),
    Metric("activity_steps", "Steps", "daily_activity", "day", "steps",
           "", "Activity", plot_type="bar", color="#3cb371", scale_group="steps"),
    Metric("activity_calories", "Active Calories", "daily_activity", "day", "active_calories",
           "kcal", "Activity", color="#66cdaa", scale_group="calories"),
    Metric("activity_total_calories", "Total Calories", "daily_activity", "day", "total_calories",
           "kcal", "Activity", color="#8fbc8f", scale_group="calories"),
    Metric("activity_distance", "Walking Distance (m)", "daily_activity", "day", "equivalent_walking_distance",
           "m", "Activity", color="#228b22", scale_group="meters"),

    # Readiness
    Metric("readiness_score", "Readiness Score", "daily_readiness", "day", "score",
           "", "Readiness", color="#ff8c00", scale_group="score_0_100"),
    Metric("readiness_hrv", "HRV Balance", "daily_readiness", "day", "contributors.hrv_balance",
           "", "Readiness", color="#ffa500", scale_group="score_0_100"),
    Metric("readiness_rhr", "Resting HR Contrib", "daily_readiness", "day", "contributors.resting_heart_rate",
           "", "Readiness", color="#ff7f50", scale_group="score_0_100"),
    Metric("readiness_temp", "Temp Deviation", "daily_readiness", "day", "temperature_deviation",
           "°C", "Readiness", color="#ff6347", scale_group="temp"),

    # Resilience
    Metric("resilience_sleep", "Sleep Recovery", "daily_resilience", "day", "contributors.sleep_recovery",
           "", "Resilience", color="#da70d6", scale_group="score_0_100"),
    Metric("resilience_daytime", "Daytime Recovery", "daily_resilience", "day", "contributors.daytime_recovery",
           "", "Resilience", color="#ba55d3", scale_group="score_0_100"),
    Metric("resilience_stress", "Stress Contrib", "daily_resilience", "day", "contributors.stress",
           "", "Resilience", color="#9932cc", scale_group="score_0_100"),

    # Stress
    Metric("stress_high", "Stress High (s)", "daily_stress", "day", "stress_high",
           "s", "Stress", color="#dc143c", scale_group="seconds"),
    Metric("recovery_high", "Recovery High (s)", "daily_stress", "day", "recovery_high",
           "s", "Stress", color="#00ced1", scale_group="seconds"),

    # Body
    Metric("spo2", "SpO2 %", "daily_spo2", "day", "spo2_percentage.average",
           "%", "Body", color="#4169e1", scale_group="spo2"),
    Metric("cardiovascular_age", "Cardiovascular Age", "daily_cardiovascular_age", "day", "vascular_age",
           "yrs", "Body", plot_type="scatter", color="#ff4500", scale_group="age"),

    # Heart Rate
    Metric("heartrate_daily", "Heart Rate (daily avg)", "heartrate", "timestamp", "bpm",
           "bpm", "Heart Rate", color="#e74c3c", scale_group="bpm"),
]


def metric_groups():
    groups = {}
    for m in METRICS:
        groups.setdefault(m.group, []).append(m)
    return groups


def get_metric(key):
    for m in METRICS:
        if m.key == key:
            return m
    return None
