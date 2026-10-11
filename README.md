# ouraring-scraper

Scrape everything your Oura Ring makes available through the Oura API into
plain CSV files, and browse it in a local dashboard styled after the Oura app.

- **`oura sync`** fetches sleep, readiness, activity, heart rate, stress,
  resilience, SpO2, cardiovascular age, VO2 max, workouts, ring battery and
  more, one CSV per endpoint. Each run only asks for what's new.
- **`oura dashboard`** opens a local web dashboard (stdlib Python server,
  vanilla JS/SVG): day views for sleep, readiness, activity, heart and stress,
  trends with correlation, and a data page.
- **`glance.json`** — a small summary of the last week, rewritten after every
  sync, for status bars and widgets to read.

No data leaves your machine except the API calls to Oura.

## Install

### Nix (Home Manager)

```nix
# flake.nix
inputs.ouraring-scraper = {
  url = "github:tom8347/ouraring-scraper";
  inputs.nixpkgs.follows = "nixpkgs";
};

# home.nix
imports = [ inputs.ouraring-scraper.homeManagerModules.default ];
services.oura.enable = true;
```

This installs the `oura` command and two systemd user units:

| unit | what it does |
|---|---|
| `oura-sync.timer` | runs `oura sync` every 30 minutes (catches up after sleep) |
| `oura-dashboard.socket` | serves the dashboard on `127.0.0.1:8787`; the server starts on the first visit and exits after 30 idle minutes |

Options: `dataDir`, `syncInterval` (systemd `OnCalendar`), `dashboard.port`,
`dashboard.idleExit`. See `nix/hm-module.nix`.

### Nix (no Home Manager)

```sh
nix run github:tom8347/ouraring-scraper -- login
nix run github:tom8347/ouraring-scraper -- dashboard
```

## First run: `oura login`

1. Register an app at <https://cloud.ouraring.com/oauth/applications> with the
   redirect URI `http://localhost:8080/callback`.
2. Run `oura login` and paste the client ID and secret when asked. Your browser
   opens Oura's consent page; afterwards the first sync fetches up to two years
   of history.

Credentials and tokens are stored in `~/.config/oura/` (mode 600) and are never
part of any configuration. Only `oura login` ever opens a browser; background
syncs fail quietly (and say so in `glance.json`) if the login lapses.

## Commands

```
oura login               store app credentials and authorize (opens a browser)
oura sync [--reset]      fetch anything new (--reset: re-fetch everything)
oura dashboard           open the dashboard, starting the server if needed
oura serve               run the dashboard server in the foreground
oura glance              rewrite glance.json from the data on disk
oura status              show paths, login state and granted scopes
```

Dashboard keys: ← / → change day, T jumps to today, 1–8 switch pages.

## Where things live

| path | contents |
|---|---|
| `~/.config/oura/` | `credentials.json`, `tokens.json` — secrets, mode 600 (`$OURA_CONFIG_DIR`) |
| `~/.local/share/oura/` | one CSV per endpoint, `personal_info.json`, `.state.json` (`$OURA_DATA_DIR`) |
| `~/.local/state/oura/glance.json` | the last 7 days in brief, for bars and widgets |

The data directory holds no credentials, so it's safe to sync or back up.
Everything in it can be fetched again from Oura (`oura sync --reset`).

## Data format

- One CSV per endpoint, sorted by date. Nested fields are flattened with dots:
  `contributors.hrv_balance`.
- Sample arrays are JSON strings in one cell, with sibling columns giving the
  spacing and start: `heart_rate.items`, `heart_rate.interval` (seconds),
  `heart_rate.timestamp`.
- Sleep stage strings (`sleep_phase_5_min`): 1 deep, 2 light, 3 REM, 4 awake.
- Activity class strings (`class_5_min`, from 4 am): 0 non-wear, 1 rest,
  2 inactive, 3 low, 4 medium, 5 high.
- Re-fetched records replace stored ones (matched by `id`, or `timestamp` for
  time series), so partial days stay current. New API fields become new columns.

```python
import csv, json
from oura.paths import data_dir

rows = list(csv.DictReader(open(data_dir() / "sleep.csv")))
night = [r for r in rows if r["type"] == "long_sleep"][-1]
hr = json.loads(night["heart_rate.items"])   # one value per 5 minutes
```

### Endpoints

`daily_activity`, `daily_sleep`, `sleep`, `sleep_time`, `daily_readiness`,
`daily_stress`, `daily_resilience`, `daily_spo2`, `daily_cardiovascular_age`,
`vo2_max`, `heartrate`, `ring_battery_level`, `workout`, `tag`, `enhanced_tag`,
`session`, `rest_mode_period`, `ring_configuration`, plus `personal_info.json`.

The API also has undocumented `symptom_radar`, `meal`, `temperature` and
`interbeat_interval` endpoints behind scopes Oura doesn't currently grant to
personal apps; they're requested and skipped if refused. Newer app features
(nighttime blood pressure, sleep debt, body clock, cumulative stress) aren't
in the API.

## Development

```sh
direnv allow          # or: nix develop
oura dashboard        # in the dev shell, `oura` runs the working tree
nix build             # the packaged app
```

`analysis/` has a couple of ad-hoc matplotlib scripts that read the data dir.
