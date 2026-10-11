# Development

- [Layout](#layout)
- [How data flows](#how-data-flows)
- [Dev environment](#dev-environment)
- [The Oura API's quirks](#the-oura-apis-quirks)
- [Adding an endpoint](#adding-an-endpoint)
- [Adding a metric to the dashboard](#adding-a-metric-to-the-dashboard)
- [The dashboard's JSON API](#the-dashboards-json-api)
- [Front end](#front-end)
- [glance.json is a contract](#glancejson-is-a-contract)
- [Packaging and releasing](#packaging-and-releasing)
- [Checking a change](#checking-a-change)
- [Rules](#rules)

## Layout

```
oura/
  cli.py        the `oura` command (argparse subcommands)
  paths.py      where config, data and glance.json live (env overrides)
  auth.py       OAuth2: login() is interactive; get_access_token() never is
  scraper.py    ENDPOINTS table, fetching, CSV upsert, sync() (locked)
  store.py      DataStore: reads the CSVs, builds the daily METRICS table and per-day detail
  glance.py     builds glance.json from a DataStore
  server.py     stdlib HTTP server: static web/ + JSON API; socket activation, idle exit
  web/          index.html, app.css, charts.js, app.js (no build step, no dependencies)
nix/
  package.nix   buildPythonApplication
  hm-module.nix services.oura (sync timer, dashboard socket + service)
flake.nix       packages.default, homeManagerModules.default, devShells.default
analysis/       ad-hoc matplotlib scripts
docs/           these docs and Oura's OpenAPI spec
```

The only runtime dependency is `requests`.

## How data flows

```
             oura login (once)                     oura-sync.timer (every 30 min)
                   │                                          │
                   ▼                                          ▼
        ~/.config/oura/{credentials,tokens}.json ──▶ scraper.sync()
                                                         │  for each Endpoint: fetch → merge_into_csv()
                                                         ▼
                                               ~/.local/share/oura/*.csv
                                                  │                 │
                                     glance.write()                 DataStore (store.py)
                                                  ▼                 │
                          ~/.local/state/oura/glance.json           ▼
                                                  │          server.py  /api/*  ◀── web/app.js
                                                  ▼
                                  status bars (file watch)
```

- **Sync** is the only writer. It holds an exclusive `fcntl` lock on
  `<data>/.sync.lock`, so the timer, the dashboard's Sync button and a terminal
  can't interleave.
- **Merging** reads the whole CSV, replaces rows by key, adds new columns,
  sorts, and writes a `.tmp` that's renamed into place. Readers never see a
  half-written file.
- **DataStore** is read-only and rebuilt from disk. The server loads it lazily
  on the first API request and drops it after a sync. `glance.py` builds one
  with `heartrate=False`, which skips the largest file.

## Dev environment

```sh
direnv allow            # or: nix develop
oura status             # `oura` here is a wrapper for `python -m oura` on this tree
oura serve --port 8790  # a second dashboard next to the installed one
```

The dev shell puts the repo on `PYTHONPATH` and includes `requests`, the
analysis libraries (numpy, matplotlib, PyQt6) and editor tooling. It reads and
writes your real data unless you point it elsewhere:

```sh
export OURA_DATA_DIR=/tmp/oura-test OURA_CONFIG_DIR=/tmp/oura-test-config
```

`XDG_STATE_HOME` moves `glance.json` too.

## The Oura API's quirks

- Base URL `https://api.ouraring.com/v2/usercollection/`. The spec is at
  `https://cloud.ouraring.com/v2/static/json/openapi-<version>.json` (version
  linked from <https://cloud.ouraring.com/v2/docs>); a copy is in
  `docs/oura-openapi.json`.
- **Scopes the spec gets wrong or omits:** `spo2` (old specs said `spo2Daily`),
  `stress` (needed for `daily_resilience`), `heart_health` (`daily_cardiovascular_age`,
  `vO2_max`), `ring_configuration` (`ring_configuration`, `ring_battery_level`).
  Granted scopes come back in the token prefixed `extapi:`.
- **Undocumented endpoints**, found by probing (401 = exists but needs a scope):
  `symptom_radar` (`health_radar`), `meal` (`meals`), `temperature` and
  `interbeat_interval` (`research`), `pregnancy` (`pregnancy`, not scraped). The
  consent screen silently drops these scopes for personal apps.
- **No endpoint (404)** exists for nighttime blood pressure, sleep debt, body
  clock, cumulative stress or nighttime breathing.
- `heartrate`, `ring_battery_level` and the research endpoints take
  `start_datetime`/`end_datetime`; the rest take `start_date`/`end_date`.
- `end_date` is **exclusive** for `daily_activity` and `workout` (inclusive
  for the other daily endpoints), so `_range_params` always sends the day
  after. Without that, today's activity score and today's workouts never
  arrive.
- Large time series 400 on long ranges, so they're fetched in chunks
  (`chunk_days`).
- `vO2_max` is mixed case in the URL.
- Pagination is `next_token`. Rate limits come back as 429 with `Retry-After`,
  which `api_get` honours.
- Daily SpO2 averages come back as `0` when not measured. `store.py` treats 0
  as missing.

## Adding an endpoint

1. Add an `Endpoint(...)` to `ENDPOINTS` in `oura/scraper.py`: its URL path,
   file stem, the scope it needs, `params="datetime"` if it takes datetimes,
   `key="timestamp"` if records have no `id`, and `chunk_days` for big time
   series.
2. If it needs a scope that isn't requested yet, add it to `CORE_SCOPES` (or
   `EXTRA_SCOPES`, if Oura might refuse it) in `oura/auth.py`. Existing users
   need `oura login` again to grant it.
3. Run `oura sync` and check the new CSV.
4. Document it in `docs/data.md` and the endpoint list in the README.

## Adding a metric to the dashboard

1. Compute it in `DataStore._metrics_for()` in `oura/store.py` (the dict key is
   the metric key).
2. Add `(key, label, unit, group, decimals)` to `METRICS`. Units with special
   formatting: `h` (hours → "7h 25m"), `min`, `clock` (hours since midnight;
   evening values may exceed 24), `level` (1–5 resilience), `°C`. The group
   picks the colour (`Readiness`, `Sleep`, `Activity`, `Heart`, `Stress`,
   `Body`).
3. It now appears in **Trends** automatically. To show it on a page, use
   `val(key)` for the selected day, `trendCard(id, title)` plus
   `trendLine(id, key, colorVar)` for a trend, or the `tile()` / `contribRow()`
   helpers in `oura/web/app.js`.

## The dashboard's JSON API

All `GET`s, plus one `POST`. Bound to 127.0.0.1 only.

| route | returns |
|---|---|
| `/api/summary` | `{days: [date…], metrics: [{key, label, unit, group, decimals}…], values: {key: [value or null, aligned with days]}, labels: {stress_summary: {day: …}, resilience: {day: …}}, profile}`. Only metrics with data are included. |
| `/api/day?d=YYYY-MM-DD` | One day's detail: `metrics` (that day's row), `sleep` (`start`, `end`, `phases`, `movement`, `hr`/`hrv` sample series, `durations`), `naps`, `activity` (`start`, `class_5_min`, `met`), `heartrate` (`[[epoch ms, bpm, source]…]` for the local day), `battery`, `workouts`, `sessions`, `tags`, `stress_summary`, `resilience`, `bedtime`. Times are epoch ms. |
| `/api/meta` | Data files (name, rows, columns, from/to, size), sync state, granted scopes, ring, profile, recent battery readings, `data_dir`, `syncing`, `sync_log`. |
| `/api/ping` | `{}`. Open pages call it every 30 s so the server stays up while a window is open; it never loads the data. |
| `POST /api/sync` | Runs `python -m oura sync` in a child process with the server's `sys.path` (so it works inside the Nix wrapper), then drops the cached DataStore. Returns `{ok, log}`. |

**Socket activation.** When `LISTEN_PID`/`LISTEN_FDS` say systemd passed a
socket, `serve()` adopts fd 3 instead of binding. With `--idle-exit N`, a
watcher thread (checking every 10 s) shuts the server down after N minutes
without requests (never during a sync). Pages ping `/api/ping` every 30 s, so
N=2 (the default for `oura dashboard` and the module) means "about 2 minutes
after the last window closes"; Chromium throttles hidden tabs to one timer per
minute, so keep N at 2 or more. The socket unit keeps listening, so the next request starts it
again.

## Front end

No framework, no build step: `index.html` loads `app.js` as an ES module.

- **`app.js`**: hash routing (`#/page/date/range`), state, and one async
  function per page in `pages`. Each page writes its HTML, then draws charts
  into elements by id. Untrusted strings go through `esc()`. `render()`
  prefetches the day's data, then renders in one pass, since charts measure
  their containers.
- **`charts.js`**: a small SVG chart kit: `line`, `bars`, `stacked`,
  `rangeBars`, `hypnogram`, `activityStrip`, `scatter`, `spark`, `ring`,
  `arcGauge`. Every chart redraws on resize (`ResizeObserver`) and has a hover
  tooltip, built with `textContent`. Gaps (nulls) break lines rather than being
  bridged.
- **`app.css`**: design tokens on `:root`. The UI chrome is Rosé Pine. Chart
  mark colours were checked for contrast and colour-blind separation on
  `--surface` (`#1f1d2e`): sleep stages and activity intensity are one-hue
  ordinal ramps (`--stage-*`, `--act-*`), multi-series charts use `--cat-1..3`,
  and single-series accents are per section (`--c-*`). There are no
  dual-axis charts: Trends uses small multiples on a shared time axis.
- Status words follow Oura's bands: 85+ Optimal, 70–84 Good, 60–69 Fair,
  under 60 Pay attention.

## glance.json is a contract

Bars and widgets read `glance.json`, and the author's Quickshell bar
(`OuraService.qml` / `OuraCard.qml` in a separate dotfiles repo) depends on its
shape. Within `version: 1`, only **add** fields; renaming or removing one means
`version: 2` and updating consumers. The schema is documented in
[data.md](data.md#glancejson) and at the top of `oura/glance.py`. Keep all
three in step.

## Packaging and releasing

- `nix build` builds `packages.default` (`nix/package.nix`). Its source is only
  `pyproject.toml` and `oura/`, so editing docs doesn't rebuild it. `web/` ships
  as package data.
- Bump the version in **both** `pyproject.toml` and `nix/package.nix`.
- `homeManagerModules.default` is `nix/hm-module.nix`, curried with `self` so
  its default package is this flake's.
- To ship a change to a machine that uses the module: push to `main`, then in
  that machine's flake run `nix flake update ouraring-scraper` and switch.

To try an unpushed change against a Home Manager configuration:

```sh
nix build "git+file://$HOME/.dotfiles#homeConfigurations.<user>.activationPackage" \
  --override-input ouraring-scraper "git+file://$PWD" --no-write-lock-file
```

Use `git+file:`, never `path:`. A `path:` input copies the whole directory,
including any untracked secrets, into the world-readable Nix store.

## Checking a change

There's no test suite. Check by hand:

```sh
oura sync && oura status                         # fetch, then sanity-check
oura glance && jq . ~/.local/state/oura/glance.json | head
oura serve --port 8790                           # in another terminal, then open each page
nix build                                        # the package still builds
```

For the dashboard, open every page (the sidebar, or keys 1–8), step through a
few days, change the range, and watch the browser console for errors. Also
load the bare URL with no `#…`.

## Rules

- **This repository is public.** Never commit credentials, tokens, data,
  exports or screenshots of real data. `.gitignore` covers the usual suspects
  (`config.json`, `tokens.json`, `data/`, `app_screenshots/`, `*.tmp`).
- Only `oura login` may open a browser. Anything that runs unattended must fail
  cleanly with `NotLoggedIn` instead.
- Keep dependencies at `requests` (Python) and nothing (front end).
