# Oura Ring Scraper

A personal data scraper for the Oura Ring API. Fetches all available health
and activity data, saves it locally as CSV files, and serves a local
Oura-app-style dashboard for browsing it.

## What this project does

- A Python package (`oura/`) with one CLI, `oura`: `login`, `sync`, `dashboard`, `serve`, `glance`, `status`
- Packaged as a flake: `packages.default` and a Home Manager module
  (`homeManagerModules.default` → `services.oura`: sync timer + socket-activated dashboard)
- Consumed by the user's dotfiles (`~/.dotfiles`, flake input `ouraring-scraper`),
  whose Quickshell bar reads `glance.json` for its readiness module/card
  (`~/.dotfiles/quickshell/bar/Oura*.qml`). Changing glance.json's shape means
  updating `OuraService.qml`/`OuraCard.qml` there too.
- **This repo is public on GitHub.** Never commit credentials, tokens, data or
  screenshots of health data (`app_screenshots/` is gitignored).

## Key files

- `oura/cli.py` — entry point (`python -m oura` / `oura`)
- `oura/paths.py` — config / data / state locations (env overrides `OURA_CONFIG_DIR`, `OURA_DATA_DIR`)
- `oura/auth.py` — OAuth2; `login()` is the only interactive path, `get_access_token()` never opens a browser
- `oura/scraper.py` — `ENDPOINTS` table drives everything; `sync()` takes a file lock, then writes glance.json
- `oura/store.py` — `DataStore`: reads CSVs, builds daily metric table (`METRICS`) and per-day detail
- `oura/glance.py` — the bar summary (schema documented at the top)
- `oura/server.py` — JSON API (`/api/summary`, `/api/day?d=`, `/api/meta`, `POST /api/sync`); supports systemd socket activation + idle exit
- `oura/web/` — dashboard: `index.html`, `app.css` (Rosé Pine tokens), `charts.js` (SVG chart kit), `app.js` (pages + routing)
- `nix/package.nix`, `nix/hm-module.nix`, `flake.nix`

## Docs (keep in step with the code)

- `README.md` — overview, quick start, commands, paths
- `docs/usage.md` — user guide (setup, sync, dashboard pages, services, options, troubleshooting)
- `docs/data.md` — every file/column, encodings, `glance.json` schema
- `docs/development.md` — architecture, API quirks, server API, how to add endpoints/metrics, releasing
- `docs/oura-openapi.json` — Oura's spec (v1.41)

When behaviour, options, files or columns change, update the matching doc in
the same change. Setup steps for the user's machines also live in
`~/.dotfiles/BOOTSTRAP.md` (Oura section).

## Where things live (not in the repo)

- `~/.config/oura/credentials.json`, `tokens.json` — secrets, mode 600
- `~/.local/share/oura/` — CSVs, `personal_info.json`, `.state.json`, `.sync.lock`
- `~/.local/state/oura/glance.json`

## Running

```bash
oura dashboard               # dev shell: runs the working tree
oura sync [--reset]
oura login                   # one-time per machine
nix build                    # packaged app
```

Testing changes in the dotfiles without pushing:
`nix build "git+file://$HOME/.dotfiles#homeConfigurations.tom.activationPackage" --override-input ouraring-scraper "git+file://$PWD" --no-write-lock-file`
(use `git+file:`, never `path:` — `path:` would copy untracked secrets into the Nix store).
Deploying: push here, then `nix flake update ouraring-scraper` in `~/.dotfiles` and rebuild.

## API notes

- Base URL: `https://api.ouraring.com/v2/usercollection/`
- Current spec: `https://cloud.ouraring.com/v2/static/json/openapi-<ver>.json`
  (version linked from `https://cloud.ouraring.com/v2/docs`; was 1.41 in Oct 2026)
- OAuth2 app registration: `https://cloud.ouraring.com/oauth/applications`
- Redirect URI: `http://localhost:8080/callback`
- Granted scopes come back prefixed `extapi:` in `tokens.json["scope"]`
- Several scopes are undocumented in the OpenAPI spec:
  - `spo2` (old spec listed `spo2Daily`)
  - `stress` — required for `daily_resilience`
  - `heart_health` — required for `daily_cardiovascular_age` and `vO2_max`
  - `ring_configuration` — required for `ring_configuration` and `ring_battery_level`
- Undocumented endpoints found by probing (401 = exists, needs scope):
  `symptom_radar` (`health_radar`), `meal` (`meals`), `temperature` and
  `interbeat_interval` (`research`), `pregnancy` (`pregnancy`, not scraped).
  Tested 2026-10-11: Oura's consent screen silently drops `health_radar`,
  `meals` and `research` for this personal app (only `email` was added), so
  these endpoints are skipped. auth.py still requests them in case that changes;
  `--reauth` would pick them up.
- No API endpoint exists (404) for app features: nighttime BP, sleep debt,
  body clock/chronotype, cumulative stress, nighttime breathing, sleep regularity
  (regularity is only a readiness contributor).
- `heartrate` and `ring_battery_level` use `start_datetime`/`end_datetime`; most others use `start_date`/`end_date`
- `end_date` is exclusive for `daily_activity` and `workout` (inclusive elsewhere); the scraper sends end+1 day
- Time-series endpoints are fetched in chunks (`chunk_days`) to avoid 400s on large ranges
- `heartrate` has no `sleep` source; overnight HR/HRV come from `sleep.csv` sample arrays

## Data format

- CSV per endpoint, flattened with dot-notation keys for nested fields
- Array fields (e.g. HRV samples) stored as JSON strings within the cell
- Upsert by record ID (timestamp for time series): re-fetched records replace
  stored ones; new columns are appended to the header; file rewritten atomically
- `personal_info` saved as JSON (single object, not time-series)

## Dashboard design

- Palette: Rosé Pine UI chrome (matches the desktop bar/Hyprland), Oura app layout
- Chart colours validated with the dataviz palette validator against `--surface`:
  sleep stages and activity intensity are one-hue ordinal ramps; multi-series
  charts use `--cat-1..3`. No dual-axis charts — Trends uses small multiples.
