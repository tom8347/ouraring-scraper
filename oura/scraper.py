"""
Fetches data from the Oura API into one CSV per endpoint.

Tracks the last-scraped date per endpoint in the data dir's .state.json, so
each run only asks for what's new (with a 2-day overlap for late syncs).
Re-fetched records replace the stored version, so partial days (e.g. today's
steps) are kept up to date. After a sync the bar summary (glance.json) is
rewritten.
"""

import csv
import fcntl
import json
import os
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import requests

from . import paths
from .auth import get_access_token, granted_scopes

BASE_URL = "https://api.ouraring.com"

# How far back to fetch on first run (days)
DEFAULT_LOOKBACK_DAYS = 730


@dataclass
class Endpoint:
    path: str                  # URL path under /v2/usercollection/
    file_stem: str             # <data dir>/<file_stem>.csv
    scope: str                 # OAuth scope the endpoint needs
    params: str = "date"       # "date" (start_date/end_date) or "datetime"
    key: str = "id"            # unique record key used for de-duplication
    chunk_days: int = 0        # split the range into chunks (large time-series)


ENDPOINTS = [
    Endpoint("daily_activity",           "daily_activity",           "daily"),
    Endpoint("daily_sleep",              "daily_sleep",              "daily"),
    Endpoint("sleep",                    "sleep",                    "daily"),
    Endpoint("sleep_time",               "sleep_time",               "daily"),
    Endpoint("daily_readiness",          "daily_readiness",          "daily"),
    Endpoint("daily_stress",             "daily_stress",             "stress"),
    Endpoint("daily_resilience",         "daily_resilience",         "stress"),
    Endpoint("daily_spo2",               "daily_spo2",               "spo2"),
    Endpoint("daily_cardiovascular_age", "daily_cardiovascular_age", "heart_health"),
    Endpoint("vO2_max",                  "vo2_max",                  "heart_health"),
    Endpoint("heartrate",                "heartrate",                "heartrate",
             params="datetime", key="timestamp", chunk_days=30),
    Endpoint("ring_battery_level",       "ring_battery_level",       "ring_configuration",
             params="datetime", key="timestamp", chunk_days=30),
    Endpoint("workout",                  "workout",                  "workout"),
    Endpoint("tag",                      "tag",                      "tag"),
    Endpoint("enhanced_tag",             "enhanced_tag",             "tag"),
    Endpoint("session",                  "session",                  "session"),
    Endpoint("rest_mode_period",         "rest_mode_period",         "daily"),
    Endpoint("ring_configuration",       "ring_configuration",       "ring_configuration"),
    # Undocumented endpoints (found by probing the API). They need scopes Oura
    # doesn't currently grant to personal apps; skipped with a note if so.
    Endpoint("symptom_radar",            "symptom_radar",            "health_radar"),
    Endpoint("meal",                     "meal",                     "meals"),
    Endpoint("temperature",              "temperature",              "research",
             params="datetime", key="timestamp", chunk_days=7),
    Endpoint("interbeat_interval",       "interbeat_interval",       "research",
             params="datetime", key="timestamp", chunk_days=7),
]

# Column used to sort rows in the saved CSV (first one present wins)
SORT_COLUMNS = ("timestamp", "day", "start_datetime", "start_day", "set_up_at")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_state():
    path = paths.sync_state_file()
    return json.loads(path.read_text()) if path.exists() else {}


def save_state(state):
    paths.sync_state_file().write_text(json.dumps(state, indent=2))


def api_get(session, path, params=None):
    url = f"{BASE_URL}{path}"
    for _ in range(3):
        resp = session.get(url, params=params, timeout=60)
        if resp.status_code != 429:
            break
        retry_after = int(resp.headers.get("Retry-After", 60))
        print(f"\n  Rate limited. Waiting {retry_after}s...", end="", flush=True)
        time.sleep(retry_after)
    resp.raise_for_status()
    return resp.json()


def flatten(obj, prefix=""):
    """Recursively flatten a nested dict. Arrays become JSON strings."""
    result = {}
    if not isinstance(obj, dict):
        return {prefix.rstrip("."): obj}
    for k, v in obj.items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            result.update(flatten(v, key + "."))
        elif isinstance(v, list):
            # Store sample arrays as compact JSON; they can be parsed later
            result[key] = json.dumps(v) if v else ""
        else:
            result[key] = v
    return result


def merge_into_csv(records, filepath, key):
    """
    Upsert flattened records into a CSV, keyed by `key`.

    New records replace stored ones with the same key (so updated days are
    refreshed), new columns are added to the header, and the file is rewritten
    sorted by date. Returns (added, updated).
    """
    rows, fieldnames = {}, []
    if os.path.exists(filepath):
        with open(filepath, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            for row in reader:
                rows[row.get(key, "")] = row

    added = updated = 0
    seen = set(fieldnames)
    for rec in map(flatten, records):
        for k in rec:
            if k not in seen:
                fieldnames.append(k)
                seen.add(k)
        k = str(rec.get(key, ""))
        if k in rows:
            updated += 1
        else:
            added += 1
        rows[k] = rec

    sort_col = next((c for c in SORT_COLUMNS if c in seen), key)
    ordered = sorted(rows.values(), key=lambda r: str(r.get(sort_col) or ""))

    tmp = filepath + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(ordered)
    os.replace(tmp, filepath)
    return added, updated


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def _range_params(style, start, end):
    if style == "datetime":
        return {"start_datetime": f"{start}T00:00:00Z", "end_datetime": f"{end}T23:59:59Z"}
    return {"start_date": start, "end_date": end}


def _fetch_pages(session, path, params):
    records = []
    while True:
        data = api_get(session, path, params)
        records.extend(data.get("data", []))
        next_token = data.get("next_token")
        if not next_token:
            return records
        params = {"next_token": next_token}


def fetch_range(session, ep, start_date, end_date):
    """Fetch all records for an endpoint over a date range (chunked if needed)."""
    path = f"/v2/usercollection/{ep.path}"
    if not ep.chunk_days:
        return _fetch_pages(session, path, _range_params(ep.params, start_date, end_date))

    records = []
    chunk_start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    while chunk_start <= end:
        chunk_end = min(chunk_start + timedelta(days=ep.chunk_days - 1), end)
        params = _range_params(ep.params, f"{chunk_start:%Y-%m-%d}", f"{chunk_end:%Y-%m-%d}")
        records.extend(_fetch_pages(session, path, params))
        chunk_start = chunk_end + timedelta(days=1)
    return records


def scrape_endpoint(session, ep, state, today, scopes):
    filepath = str(paths.data_dir() / f"{ep.file_stem}.csv")

    last = state.get(ep.path)
    if last:
        # Overlap by 2 days to catch data that syncs late
        start = (datetime.strptime(last, "%Y-%m-%d") - timedelta(days=2)).strftime("%Y-%m-%d")
    else:
        start = (datetime.today() - timedelta(days=DEFAULT_LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    print(f"  {ep.path:<26} {start} → {today} ... ", end="", flush=True)

    if scopes and ep.scope not in scopes:
        print(f"SKIP (scope '{ep.scope}' not granted)")
        return True

    try:
        records = fetch_range(session, ep, start, today)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 401:
            print(f"SKIP (401 - token lacks '{ep.scope}' scope; try `oura login`)")
        elif status == 403:
            print("SKIP (403 - permission denied or subscription required)")
        elif status == 404:
            print("SKIP (404 - not available for your account/ring)")
        else:
            print(f"ERROR {status}: {e.response.text[:120] if e.response is not None else e}")
            return False
        return True
    except requests.RequestException as e:
        print(f"ERROR: {e}")
        return False

    state[ep.path] = today
    if not records:
        print("no data")
        return True

    added, updated = merge_into_csv(records, filepath, ep.key)
    print(f"{added} new, {updated} refreshed")
    return True


# ---------------------------------------------------------------------------
# Sync
# ---------------------------------------------------------------------------

def sync(reset=False):
    """Fetch everything new, then refresh glance.json. Returns True if all went well."""
    from . import glance

    data = paths.data_dir()
    data.mkdir(parents=True, exist_ok=True)

    # One sync at a time (the timer, the dashboard's Sync button, a terminal)
    with open(data / ".sync.lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)

        today = date.today().strftime("%Y-%m-%d")
        print(f"Oura sync  [{today}]  →  {data}")
        print("=" * 50)
        try:
            access_token = get_access_token()
        except Exception as e:
            glance.write(error=str(e))
            raise

        scopes = granted_scopes()
        state = {} if reset else load_state()
        session = requests.Session()
        session.headers["Authorization"] = f"Bearer {access_token}"

        ok = True
        # Personal info: always refreshed, saved as JSON (a single object)
        print(f"  {'personal_info':<26} ... ", end="", flush=True)
        try:
            info = api_get(session, "/v2/usercollection/personal_info")
            (data / "personal_info.json").write_text(json.dumps(info, indent=2))
            print("saved")
        except requests.RequestException as e:
            print(f"ERROR: {e}")
            ok = False

        for ep in ENDPOINTS:
            ok = scrape_endpoint(session, ep, state, today, scopes) and ok
            save_state(state)

        glance.write(error=None if ok else "some endpoints failed")
        print("\nDone.")
        return ok
