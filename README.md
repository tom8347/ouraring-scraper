# ouraring-scraper

Pull everything your Oura Ring makes available through the Oura API into plain,
code-friendly CSV files, and browse it in a local dashboard styled after the
Oura app.

- **Everything the API offers.** Sleep (with 5-minute stages and overnight
  HR/HRV), readiness, activity (with MET and intensity timelines), daytime heart
  rate, stress, resilience, SpO2 and breathing disturbance, cardiovascular age
  and pulse wave velocity, VO2 max, workouts, sessions, tags, rest mode, ring
  battery and ring details.
- **Plain files.** One CSV per endpoint, sorted by date, nested fields flattened
  with dots. Each sync only asks for what's new and refreshes recent days.
- **A local dashboard.** Day views for sleep, readiness, activity, heart and
  stress; trends over any range; a metric explorer with correlation; and a data
  page. Plain Python server and vanilla JS/SVG, no third-party front-end code.
- **Made for status bars.** Every sync writes `glance.json`, a small summary
  of the last week that a bar or widget can watch.
- **Runs itself.** The Home Manager module syncs every 30 minutes and starts
  the dashboard on demand.
- **Private by design.** Nothing leaves your machine except calls to the Oura
  API. Credentials live in one mode-600 directory and never in configuration.

## Contents

- [Quick start](#quick-start)
- [Commands](#commands)
- [Where things live](#where-things-live)
- [Documentation](#documentation)
- [What the API does and doesn't provide](#what-the-api-does-and-doesnt-provide)
- [Requirements](#requirements)

## Quick start

You need an Oura account, a ring and Nix with flakes. Without Nix, see
[Requirements](#requirements).

### 1. Register an Oura API app (once)

At <https://cloud.ouraring.com/oauth/applications>, create an application with
the redirect URI **`http://localhost:8080/callback`**. Keep the **client ID**
and **client secret** handy. [docs/usage.md](docs/usage.md#1-register-an-oura-api-app)
walks through the form.

### 2. Install

**With Home Manager (recommended).** This gives you automatic syncing and an
on-demand dashboard:

```nix
# flake.nix
inputs.ouraring-scraper = {
  url = "github:tom8347/ouraring-scraper";
  inputs.nixpkgs.follows = "nixpkgs";
};

# home.nix (the module needs `inputs` passed in, e.g. via extraSpecialArgs)
imports = [ inputs.ouraring-scraper.homeManagerModules.default ];
services.oura.enable = true;
```

**Without Home Manager:**

```sh
nix profile install github:tom8347/ouraring-scraper
# or run without installing:  nix run github:tom8347/ouraring-scraper -- <command>
```

### 3. Log in and look

```sh
oura login        # paste the client ID and secret; approve in the browser
oura dashboard    # opens http://127.0.0.1:8787/
```

`oura login` stores the credentials, authorises the app and runs the first
sync, which fetches up to two years of history. That's all. With the Home
Manager module, data then refreshes every half hour.

## Commands

| command | what it does |
|---|---|
| `oura login` | Store your app credentials, authorise in the browser, then sync. The only command that ever opens a login page. `--new-app` asks for new credentials, `--no-sync` skips the sync. |
| `oura sync` | Fetch anything new (2-day overlap for late syncs) and rewrite `glance.json`. Never interactive. `--reset` re-fetches the last 730 days. |
| `oura dashboard` | Open the dashboard, starting a server if none is listening. `--no-open` only starts it, `--port` changes the port. |
| `oura serve` | Run the dashboard server in the foreground. `--idle-exit MIN` stops it after MIN idle minutes. |
| `oura glance` | Rewrite `glance.json` from the data on disk, without contacting Oura. |
| `oura status` | Show where everything is, whether you're logged in, the last sync date and the granted scopes. |

Dashboard keys: **← / →** previous and next day, **T** today, **1–8** switch
pages.

## Where things live

| path | contents |
|---|---|
| `~/.config/oura/` | `credentials.json`, `tokens.json`: **secrets**, mode 600. Override with `$OURA_CONFIG_DIR`. |
| `~/.local/share/oura/` | One CSV per endpoint, `personal_info.json`, `.state.json` (last sync per endpoint). Override with `$OURA_DATA_DIR`. |
| `~/.local/state/oura/glance.json` | The last 7 days in brief, for bars and widgets. |

XDG variables (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`) are
respected. The data directory contains no credentials, but it is your personal
health data, so treat it accordingly. Everything in it can be fetched again from
Oura with `oura sync --reset`.

## Documentation

| | |
|---|---|
| [docs/usage.md](docs/usage.md) | Full guide: setup step by step, syncing, every dashboard page, the systemd services, configuration options, moving to a new machine, troubleshooting, uninstalling. |
| [docs/data.md](docs/data.md) | Data reference: every file and column, units, the encoded strings (sleep stages, activity classes), sample arrays, `glance.json`'s schema, loading examples. |
| [docs/development.md](docs/development.md) | How the code fits together, the dashboard's JSON API, adding endpoints and metrics, packaging and deploying. |
| [docs/oura-openapi.json](docs/oura-openapi.json) | Oura's OpenAPI spec (v1.41), for reference. |

## What the API does and doesn't provide

Every endpoint in Oura's v2 API is scraped:

`daily_activity` · `daily_sleep` · `sleep` · `sleep_time` · `daily_readiness` ·
`daily_stress` · `daily_resilience` · `daily_spo2` · `daily_cardiovascular_age` ·
`vO2_max` · `heartrate` · `ring_battery_level` · `workout` · `tag` · `enhanced_tag` ·
`session` · `rest_mode_period` · `ring_configuration` · `personal_info`

The API also has undocumented `symptom_radar`, `meal`, `temperature` (raw skin
temperature) and `interbeat_interval` endpoints. They sit behind scopes
(`health_radar`, `meals`, `research`) that Oura's consent screen currently
drops for personal apps. They're requested anyway and skipped with a note if
not granted.

Some newer Oura app features have **no API endpoint**: nighttime blood
pressure, sleep debt, body clock / chronotype, cumulative stress, nighttime
breathing, Symptom Radar's verdicts and meal logs. Sleep regularity appears only
as a readiness contributor.

## Requirements

- An Oura Ring with an Oura account, and an API app (step 1 above).
- **Nix** (flakes) for the packaged install. Without Nix: Python 3.11+ and
  `requests`, then run `python -m oura …` from a clone.
- The automatic sync timer and on-demand dashboard need **Home Manager on
  Linux** (systemd user units). On macOS, run `oura sync` from launchd or cron.
- A browser for the dashboard. `oura dashboard` prefers a chromeless
  Chromium/Chrome `--app` window and falls back to your default browser.
- Ports **8080** (only during `oura login`, for the OAuth callback) and **8787**
  (the dashboard) on 127.0.0.1.
