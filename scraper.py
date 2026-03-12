#!/usr/bin/env python3
"""
Oura Ring data scraper.

Fetches data from the Oura API and saves it as CSV files in ./data/.
Tracks last-scraped dates in .state.json so only new data is fetched
on subsequent runs.

Usage:
    python scraper.py           # scrape all endpoints
    python scraper.py --reset   # clear state and re-fetch everything
    python scraper.py --reauth  # delete saved tokens and re-authorize (fixes 401s)
"""

import argparse
import csv
import json
import os
import sys
import time
from datetime import date, datetime, timedelta

import requests

from auth import get_access_token

BASE_URL = "https://api.ouraring.com"
DATA_DIR = "data"
STATE_FILE = ".state.json"
CONFIG_FILE = "config.json"

# (endpoint_path, uses_datetime_params, file_stem)
# Most use start_date/end_date; heartrate uses start_datetime/end_datetime.
ENDPOINTS = [
    ("daily_activity",          False, "daily_activity"),
    ("daily_sleep",             False, "daily_sleep"),
    ("sleep",                   False, "sleep"),
    ("sleep_time",              False, "sleep_time"),
    ("daily_readiness",         False, "daily_readiness"),
    ("daily_stress",            False, "daily_stress"),
    ("daily_resilience",        False, "daily_resilience"),
    ("daily_spo2",              False, "daily_spo2"),
    ("daily_cardiovascular_age",False, "daily_cardiovascular_age"),
    ("vO2_max",                 False, "vo2_max"),
    ("heartrate",               True,  "heartrate"),
    ("workout",                 False, "workout"),
    ("tag",                     False, "tag"),
    ("enhanced_tag",            False, "enhanced_tag"),
    ("session",                 False, "session"),
    ("rest_mode_period",        False, "rest_mode_period"),
    ("ring_configuration",      False, "ring_configuration"),
]

# How far back to fetch on first run (days)
DEFAULT_LOOKBACK_DAYS = 730


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_config():
    if not os.path.exists(CONFIG_FILE):
        example = {"client_id": "YOUR_CLIENT_ID", "client_secret": "YOUR_CLIENT_SECRET"}
        print(f"ERROR: '{CONFIG_FILE}' not found.")
        print("Create it with your Oura OAuth2 app credentials:")
        print(json.dumps(example, indent=2))
        print("\nRegister your app at: https://cloud.ouraring.com/oauth/applications")
        print("Set the redirect URI to: http://localhost:8080/callback")
        sys.exit(1)
    with open(CONFIG_FILE) as f:
        return json.load(f)


def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            return json.load(f)
    return {}


def save_state(state):
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


def api_get(session, path, params=None):
    url = f"{BASE_URL}{path}"
    resp = session.get(url, params=params)
    if resp.status_code == 429:
        retry_after = int(resp.headers.get("Retry-After", 60))
        print(f"\n  Rate limited. Waiting {retry_after}s...", end="", flush=True)
        time.sleep(retry_after)
        resp = session.get(url, params=params)
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


def load_existing_ids(filepath):
    """Return set of 'id' values already saved in a CSV."""
    ids = set()
    if not os.path.exists(filepath):
        return ids
    with open(filepath, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames and "id" in reader.fieldnames:
            for row in reader:
                if row.get("id"):
                    ids.add(row["id"])
    return ids


def load_existing_timestamps(filepath):
    """Return set of 'timestamp' values already saved (for id-less endpoints)."""
    ts = set()
    if not os.path.exists(filepath):
        return ts
    with open(filepath, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames and "timestamp" in reader.fieldnames:
            for row in reader:
                if row.get("timestamp"):
                    ts.add(row["timestamp"])
    return ts


def append_to_csv(records, filepath):
    """
    Append flattened records to a CSV file.
    Creates the file with headers if it doesn't exist.
    Returns the number of records written.
    """
    if not records:
        return 0

    flat = [flatten(r) for r in records]

    if os.path.exists(filepath):
        # Use existing fieldnames; silently drop any newly-appeared fields
        with open(filepath, newline="", encoding="utf-8") as f:
            fieldnames = csv.DictReader(f).fieldnames or []
        # Add any new fields at the end so nothing is lost
        existing_set = set(fieldnames)
        for rec in flat:
            for k in rec:
                if k not in existing_set:
                    fieldnames.append(k)
                    existing_set.add(k)
        mode = "a"
        write_header = False
    else:
        # Collect all field names preserving insertion order
        seen = set()
        fieldnames = []
        for rec in flat:
            for k in rec:
                if k not in seen:
                    fieldnames.append(k)
                    seen.add(k)
        mode = "w"
        write_header = True

    with open(filepath, mode, newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        if write_header:
            writer.writeheader()
        writer.writerows(flat)

    return len(flat)


# ---------------------------------------------------------------------------
# Fetching
# ---------------------------------------------------------------------------

def fetch_all_pages(session, endpoint, start_date, end_date, uses_datetime):
    """Fetch all pages for a date-ranged endpoint, returning list of records."""
    path = f"/v2/usercollection/{endpoint}"

    if not uses_datetime:
        # Single request with date range + pagination
        records = []
        params = {"start_date": start_date, "end_date": end_date}
        while True:
            data = api_get(session, path, params)
            records.extend(data.get("data", []))
            next_token = data.get("next_token")
            if not next_token:
                break
            params = {"next_token": next_token}
        return records

    # Heartrate (and any future datetime endpoints): chunk into 30-day windows
    # to stay within API limits for high-frequency time-series data.
    CHUNK_DAYS = 30
    records = []
    chunk_start = datetime.strptime(start_date, "%Y-%m-%d")
    chunk_end_bound = datetime.strptime(end_date, "%Y-%m-%d")

    while chunk_start <= chunk_end_bound:
        chunk_end = min(chunk_start + timedelta(days=CHUNK_DAYS - 1), chunk_end_bound)
        params = {
            "start_datetime": chunk_start.strftime("%Y-%m-%dT00:00:00Z"),
            "end_datetime": chunk_end.strftime("%Y-%m-%dT23:59:59Z"),
        }
        while True:
            data = api_get(session, path, params)
            records.extend(data.get("data", []))
            next_token = data.get("next_token")
            if not next_token:
                break
            params = {"next_token": next_token}
        chunk_start = chunk_end + timedelta(days=1)

    return records


def scrape_endpoint(session, endpoint, uses_datetime, file_stem, state, today):
    filepath = os.path.join(DATA_DIR, f"{file_stem}.csv")

    last = state.get(endpoint)
    if last:
        # Overlap by 2 days to catch data that syncs late
        start = (datetime.strptime(last, "%Y-%m-%d") - timedelta(days=2)).strftime("%Y-%m-%d")
    else:
        start = (datetime.today() - timedelta(days=DEFAULT_LOOKBACK_DAYS)).strftime("%Y-%m-%d")

    print(f"  {endpoint:<30} {start} → {today} ... ", end="", flush=True)

    try:
        records = fetch_all_pages(session, endpoint, start, today, uses_datetime)
    except requests.HTTPError as e:
        status = e.response.status_code if e.response is not None else "?"
        if status == 401:
            print(f"SKIP (401 - token lacks scope for this endpoint; try --reauth)")
        elif status == 403:
            print(f"SKIP (403 - permission denied or subscription required)")
        elif status == 404:
            print(f"SKIP (404 - not available for your ring generation)")
        else:
            print(f"ERROR {status}: {e}")
        return
    except Exception as e:
        print(f"ERROR: {e}")
        return

    if not records:
        print("no data")
        state[endpoint] = today
        return

    # Deduplicate against what's already saved
    has_ids = any(r.get("id") for r in records)
    if has_ids:
        existing = load_existing_ids(filepath)
        new_records = [r for r in records if r.get("id") not in existing]
    else:
        existing = load_existing_timestamps(filepath)
        new_records = [r for r in records if r.get("timestamp") not in existing]

    count = append_to_csv(new_records, filepath)
    print(f"{count} new  (fetched {len(records)})")
    state[endpoint] = today


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Scrape Oura Ring data to CSV files.")
    parser.add_argument("--reset", action="store_true", help="Clear saved state and re-fetch all data")
    parser.add_argument("--reauth", action="store_true", help="Delete saved tokens and re-authorize (fixes 401 scope errors)")
    args = parser.parse_args()

    if args.reauth and os.path.exists("tokens.json"):
        os.remove("tokens.json")
        print("Deleted tokens.json - will re-authorize.")

    os.makedirs(DATA_DIR, exist_ok=True)
    config = load_config()
    state = {} if args.reset else load_state()
    today = date.today().strftime("%Y-%m-%d")

    print(f"Oura Scraper  [{today}]")
    print("=" * 50)

    access_token = get_access_token(config["client_id"], config["client_secret"])

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {access_token}"

    # Personal info: always refresh, saved as JSON (not CSV - it's a single object)
    print(f"  {'personal_info':<30} ... ", end="", flush=True)
    try:
        info = api_get(session, "/v2/usercollection/personal_info")
        out = os.path.join(DATA_DIR, "personal_info.json")
        with open(out, "w") as f:
            json.dump(info, f, indent=2)
        print("saved")
    except Exception as e:
        print(f"ERROR: {e}")

    for endpoint, uses_datetime, file_stem in ENDPOINTS:
        scrape_endpoint(session, endpoint, uses_datetime, file_stem, state, today)

    save_state(state)
    print("\nDone. Data saved to ./data/")


if __name__ == "__main__":
    main()
