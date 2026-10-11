# Usage guide

1. [Register an Oura API app](#1-register-an-oura-api-app)
2. [Install](#2-install)
3. [Log in](#3-log-in)
4. [Syncing](#4-syncing)
5. [The dashboard](#5-the-dashboard)
6. [Status bars and widgets](#6-status-bars-and-widgets)
7. [The background services](#7-the-background-services)
8. [Configuration](#8-configuration)
9. [New machines, backups and resets](#9-new-machines-backups-and-resets)
10. [Troubleshooting](#10-troubleshooting)
11. [Uninstalling and revoking access](#11-uninstalling-and-revoking-access)

---

## 1. Register an Oura API app

Oura no longer issues personal access tokens (deprecated December 2025), so the
scraper signs in through OAuth2 as an "application" that you own.

1. Sign in at <https://cloud.ouraring.com/oauth/applications> with your Oura
   account and create a new application.
2. Fill in the form. For a personal app, the descriptive fields (name,
   description, website, privacy policy and terms URLs) can be anything
   sensible. `http://localhost` is fine for the URLs.
3. Set the **redirect URI** to exactly:

   ```
   http://localhost:8080/callback
   ```

4. Save. Note the **client ID** and **client secret** shown for the app. You'll
   paste them into `oura login`. You can come back to this page any time to see
   them again or to create a new app.

One app is enough for all your machines. Each machine just logs in once.

## 2. Install

### Home Manager (recommended)

Add the flake input and enable the module:

```nix
# flake.nix
inputs.ouraring-scraper = {
  url = "github:tom8347/ouraring-scraper";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

```nix
# home.nix — `inputs` must reach the module, e.g. through
# home-manager.extraSpecialArgs = { inherit inputs; };
{ inputs, ... }: {
  imports = [ inputs.ouraring-scraper.homeManagerModules.default ];
  services.oura.enable = true;
}
```

After switching you have:

- the `oura` command,
- `oura-sync.timer`, which syncs every 30 minutes,
- `oura-dashboard.socket`, which serves the dashboard on
  <http://127.0.0.1:8787/> and starts the server on the first visit.

To pick up new versions, run `nix flake update ouraring-scraper` and switch again.

### Nix without Home Manager

```sh
nix profile install github:tom8347/ouraring-scraper
```

Everything works except automatic syncing. Run `oura sync` yourself, or from
cron, launchd or a systemd timer you write.

### From a clone (development)

```sh
git clone https://github.com/tom8347/ouraring-scraper
cd ouraring-scraper
direnv allow        # or: nix develop
oura status         # in the dev shell, `oura` runs this working tree
```

Without Nix: `pip install requests`, then use `python -m oura …` from the clone.

## 3. Log in

```sh
oura login
```

1. It asks for the client ID and secret (the secret isn't echoed) and stores
   them in `~/.config/oura/credentials.json`.
2. Your browser opens Oura's consent page. If it doesn't, the URL is printed.
   Copy it into a browser on the same machine.
3. Approve. Oura redirects to `http://localhost:8080/callback`, where
   `oura login` is waiting, and the tokens are saved to
   `~/.config/oura/tokens.json`.
4. The first sync starts. It fetches up to 730 days of history. Expect one to a
   few minutes, mostly heart rate.

Both files are created with mode 600, in a directory with mode 700.

**About the permissions screen.** The scraper asks for every scope it knows of:
`personal daily heartrate workout tag session spo2 stress heart_health
ring_configuration email`, plus the undocumented `health_radar meals research`.
At the time of writing, Oura silently leaves the last three off the consent
screen for personal apps. That's expected. If Oura ever shows an error instead,
`oura login` waits five minutes, then retries with the standard scopes.

Options:

- `oura login --new-app` asks for credentials again (e.g. after creating a new app).
- `oura login --client-id ID --client-secret SECRET` skips the prompts.
- `oura login --no-sync` doesn't sync afterwards.

You only log in once per machine. Access tokens are refreshed automatically
with the stored refresh token. If that's ever rejected (you revoked or deleted
the app, changed its secret, or it expired), syncs stop with "not logged in".
Run `oura login` again.

## 4. Syncing

```sh
oura sync            # fetch anything new
oura sync --reset    # forget what's been fetched and re-fetch 730 days
```

A sync:

1. refreshes the access token if needed (never opening a browser),
2. saves `personal_info.json`,
3. for each endpoint, asks for everything from two days before the last sync up
   to today, so late-arriving data and still-changing days (today's steps) are
   covered,
4. merges the records into that endpoint's CSV. Records with the same ID (or
   timestamp, for time series) replace the stored ones, new fields become new
   columns, and the file is rewritten atomically, sorted by date,
5. rewrites `glance.json`.

Endpoints your token can't reach are skipped with a one-line note, which isn't
an error. An incremental sync takes about 10 seconds. Only one sync runs at a
time: a second one waits for the first (lock file `.sync.lock` in the data dir).

**When is new data available?** Oura computes the day's readiness and sleep
after you wake, once the Oura phone app has synced with the ring and uploaded.
Until then the latest readiness is yesterday's. The bar summary marks this, see
[§6](#6-status-bars-and-widgets).

**Offline.** A sync that can't reach Oura exits non-zero, keeps the data it has,
and records the error in `glance.json`. The next sync catches up.

**Exit codes:** `0` all good, `1` something failed (network, an endpoint error),
`2` not logged in.

## 5. The dashboard

```sh
oura dashboard
```

This opens <http://127.0.0.1:8787/>. With the Home Manager module, systemd
starts the server on the first request (about 2 seconds while it loads the
data). Without the module, `oura dashboard` starts its own server. Either
way, an open dashboard pings the server every 30 seconds, and the server exits
about 2 minutes after the last window closes (a minimised window still counts
as open).
Bookmark the URL or open it from a launcher. It works in any browser.

### Navigating

- **Sidebar:** the eight pages. On narrow windows it becomes a bottom bar.
- **Date:** ‹ › step a day, the date opens a picker, and **Today** jumps back.
  Day views show the selected date.
- **Trends range:** 1W / 1M / 3M / 6M / 1Y / All. Trend charts end at the
  selected date. Ranges longer than about six weeks show the daily values
  faintly with a 7-day average on top.
- **Keyboard:** ← / → previous and next day, **T** today, **1–8** pages.
- **Hover** any chart for exact values. The URL (`#/page/date/range`) can be
  bookmarked or shared between your own browsers.

### Pages

| page | what's on it |
|---|---|
| **Today** | Score rings (readiness, sleep, activity, resting HR, HRV, stress, resilience), the readiness arc with its strongest and weakest contributors, twelve vitals cards with 14-day trends, the day's heart rate (sleep and workouts shaded), and last night's sleep stages. |
| **Sleep** | Sleep score and contributors; hypnogram (awake / REM / light / deep in 5-minute blocks) with stage totals, bedtime, wake time and bedtime guidance; key metrics; overnight heart rate and HRV. Trends: score, stages per night, timing (bedtime to wake), efficiency. |
| **Readiness** | Score and all nine contributors; resting HR, HRV, body temperature, respiratory rate; overnight HR (lowest marked) and HRV. Trends: score, temperature deviation, resting HR, HRV. |
| **Activity** | Score and contributors; goal progress, total burn, activity time, steps; the day's intensity in 5-minute blocks from 4 am; workouts. Trends: steps, time by intensity, score, active calories. |
| **Heart** | The whole day's heart rate; sleeping range, resting, daytime lowest and highest, HRV, SpO2; cardiovascular age, pulse wave velocity, VO2 max. Trends for each. |
| **Stress & resilience** | Daytime stress summary, stressed and restored time; resilience level and its contributors. Trends: stressed vs restored, resilience level, contributors. |
| **Trends** | Pick any of ~70 daily metrics (searchable) and chart them stacked on one time axis, optionally smoothed. **Correlate** plots one metric against another, optionally against the next day (e.g. does a late bedtime lower next-day HRV?), with the correlation coefficient. Your selection is remembered. |
| **Data** | Sync now (with its log), last sync per endpoint, ring and profile details, ring battery over the last week, granted permissions, and every data file with row counts, date ranges and columns (click a row). |

**Sync now** (sidebar and Data page) runs `oura sync` and reloads the dashboard.

## 6. Status bars and widgets

Every sync rewrites `~/.local/state/oura/glance.json` atomically. It holds the
last seven days (scores, vitals, contributors and the main sleep with its
stages), so a widget can show plenty without loading the CSVs. Watch the file
for changes rather than polling. Its schema is in
[data.md](data.md#glancejson).

The most recent readiness score:

```sh
jq -r '. as $g | $g.days[] | select(.day == $g.latest) | .readiness' ~/.local/state/oura/glance.json
```

`latest` is the most recent day *with* a readiness score. If it isn't today,
today's score isn't in yet. `error` is non-null when the last sync failed
(`"not logged in"` means run `oura login`), and `synced` is when the last good
sync finished.

A Waybar module, for example:

```jsonc
"custom/oura": {
  "exec": "jq -r '. as $g | $g.days[] | select(.day == $g.latest) | \"󰹧 \\(.readiness)\"' ~/.local/state/oura/glance.json",
  "interval": 300,
  "on-click": "xdg-open http://127.0.0.1:8787/"
}
```

(The glyph is Material Design Icons' `sprout-outline`, U+F0E67. Any icon font
works.) Richer widgets can show the whole week: each entry in `days` has the
scores, vitals and the night's sleep stages.

## 7. The background services

With `services.oura.enable = true` (Linux):

| unit | role |
|---|---|
| `oura-sync.service` | One-shot `oura sync`. |
| `oura-sync.timer` | Starts it a minute after login and then on `syncInterval` (default every 30 min). `Persistent=true`, so a run missed while asleep happens on wake. |
| `oura-dashboard.socket` | Listens on `127.0.0.1:8787` and starts the server on the first connection. |
| `oura-dashboard.service` | `oura serve`, which exits `dashboard.idleExit` minutes after the last dashboard window closes. The socket keeps listening, so the next visit starts it again. |

Useful commands:

```sh
systemctl --user list-timers oura-sync.timer      # when the next sync runs
systemctl --user start oura-sync                  # sync now (or: oura sync)
journalctl --user -u oura-sync -n 40              # what the last syncs did
systemctl --user status oura-dashboard.socket oura-dashboard.service
systemctl --user stop oura-dashboard.service      # free its memory now
```

Memory: a sync peaks at around 250 MB for a few seconds while it merges heart
rate. The dashboard server holds about 50 MB while running. Nothing stays
resident between uses.

## 8. Configuration

### Home Manager options

| option | default | meaning |
|---|---|---|
| `services.oura.enable` | `false` | Install `oura` and the units above. |
| `services.oura.package` | this flake's package | Override to pin or patch. |
| `services.oura.dataDir` | `${xdg.dataHome}/oura` | Where the CSVs go. Also exported as `OURA_DATA_DIR` in your session, so `oura` in a terminal uses the same place. |
| `services.oura.syncInterval` | `"*:0/30"` | systemd `OnCalendar` expression, e.g. `"hourly"` or `"*:0/15"`. |
| `services.oura.dashboard.port` | `8787` | Dashboard port on 127.0.0.1. |
| `services.oura.dashboard.idleExit` | `2` | Minutes without a request (open pages ping every 30 s) before the server stops (`0`: never). |

### Environment variables

| variable | effect |
|---|---|
| `OURA_CONFIG_DIR` | Directory for `credentials.json` and `tokens.json` (default `$XDG_CONFIG_HOME/oura`). |
| `OURA_DATA_DIR` | Data directory (default `$XDG_DATA_HOME/oura`). |
| `XDG_STATE_HOME` | `glance.json` goes in `$XDG_STATE_HOME/oura/` (default `~/.local/state`). |

## 9. New machines, backups and resets

- **New machine:** install, then `oura login`. The first sync rebuilds your data
  from Oura, so there's nothing to copy.
  - To skip the download, copy `~/.local/share/oura` across first.
  - To skip the login as well, copy `~/.config/oura` too, keeping its
    permissions (mode 600 files, 700 directory). Don't run two machines on one
    copied set of tokens, because a refresh on one can invalidate the other's.
    Log in on each machine instead.
- **Backups:** back up `~/.local/share/oura` if you like. It's reproducible from
  Oura while your account exists. Don't put `~/.config/oura` anywhere public.
- **Start again from scratch:** `oura sync --reset`. Or delete the data
  directory and sync.
- **Switch Oura apps or accounts:** `oura login --new-app`.

## 10. Troubleshooting

**The bar or widget says "Not connected" / `oura sync` says "not logged in".**
No tokens, or the refresh token was rejected. Run `oura login`.

**`oura login` fails with "Address already in use".** Something else is on
port 8080. Stop it for the minute the login takes. The redirect URI is fixed
by your Oura app, so the port can't change without editing the app too.

**The browser didn't open during login.** Copy the printed URL into a browser
on the same machine. The callback has to reach `localhost:8080` there.

**"SKIP (scope … not granted)" in the sync log.** Expected for
`symptom_radar`, `meal`, `temperature` and `interbeat_interval`, which Oura
doesn't currently grant to personal apps. For any other endpoint, run
`oura login` and make sure everything is ticked on the consent page.

**"SKIP (404 …)".** That data type isn't available for your account or ring.

**Today's readiness is missing.** Oura hasn't computed it yet. Open the Oura
phone app so the ring syncs, and the next sync (or **Sync now**) picks it up.

**The dashboard doesn't load.** Check `systemctl --user status
oura-dashboard.socket`. If something else holds port 8787 (e.g. an `oura serve`
started by hand), stop it or change `dashboard.port`. Without the module, run
`oura serve` in a terminal to see errors.

**The dashboard shows "Something went wrong".** Reload the page. If it
persists, look at the browser console and `journalctl --user -u
oura-dashboard`. Please report it with the message.

**Data looks stale.** `journalctl --user -u oura-sync -n 40` shows what the
last syncs did. `systemctl --user list-timers` shows when the next one runs.

**Blood oxygen shows gaps.** Nights without enough SpO2 readings come back from
Oura as 0. They're treated as missing rather than 0%.

**A CSV has unexpected columns.** Oura added a field. New fields are appended
as new columns, and older rows have them empty.

## 11. Uninstalling and revoking access

1. Remove `services.oura` (and the flake input), or `nix profile remove`.
2. Delete `~/.config/oura` (credentials), and `~/.local/share/oura` and
   `~/.local/state/oura` if you don't want the data.
3. To revoke access completely, delete the app at
   <https://cloud.ouraring.com/oauth/applications>. Its tokens stop working.
