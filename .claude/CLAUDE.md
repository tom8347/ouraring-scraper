# Oura Ring Scraper

A personal data scraper for the Oura Ring API. Fetches all available health
and activity data and saves it locally as CSV files for visualisation and
analysis.

## What this project does

- Authenticates with the Oura API via OAuth2 (tokens auto-managed)
- Scrapes all available endpoints: sleep, activity, readiness, heart rate,
  stress, resilience, SpO2, cardiovascular age, VO2 max, workouts, and more
- Saves data to `data/` as CSV files — one per endpoint
- Tracks last-scraped dates so only new data is fetched on each run
- Analysis scripts live in `analysis/`

## Key files

- `scraper.py` — main entry point
- `auth.py` — OAuth2 flow and token refresh
- `config.json` — OAuth2 client credentials (gitignored, see `config.json.example`)
- `tokens.json` — OAuth2 tokens, auto-managed (gitignored)
- `.state.json` — last-scraped date per endpoint (gitignored)
- `data/` — CSV output, one file per endpoint (gitignored)
- `analysis/` — scripts for visualising and analysing the data

## Running

```bash
python scraper.py            # fetch new data since last run
python scraper.py --reset    # re-fetch all data from scratch
python scraper.py --reauth   # re-run OAuth flow (e.g. to add new scopes)
```

## API notes

- Base URL: `https://api.ouraring.com/v2/usercollection/`
- OAuth2 app registration: `https://cloud.ouraring.com/oauth/applications`
- Redirect URI: `http://localhost:8080/callback`
- Several scopes are undocumented in the OpenAPI spec:
  - `spo2` (spec incorrectly lists `spo2Daily`)
  - `stress` — required for `daily_resilience`
  - `heart_health` — required for `daily_cardiovascular_age` and `vO2_max`
  - `ring_configuration` — required for `ring_configuration`
- `heartrate` uses `start_datetime`/`end_datetime`; all others use `start_date`/`end_date`
- `heartrate` is fetched in 30-day chunks to avoid 400 errors on large ranges

## Data format

- CSV per endpoint, flattened with dot-notation keys for nested fields
- Array fields (e.g. HRV samples) stored as JSON strings within the cell
- Deduplication by record ID on each run (timestamp for heartrate)
- `personal_info` saved as JSON (single object, not time-series)
