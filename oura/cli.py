"""
oura — scrape your Oura Ring data to CSV and browse it in a local dashboard.

    oura login               one-time: store app credentials and authorize (opens a browser)
    oura sync [--reset]      fetch anything new (never opens a browser)
    oura dashboard           open the dashboard (starting the server if needed)
    oura serve               run the dashboard server in the foreground
    oura glance              rewrite the bar summary from the data on disk
    oura status              show where things are and whether you're logged in
"""

import argparse
import getpass
import json
import os
import shutil
import socket
import subprocess
import sys
import time
import webbrowser

from . import auth, paths

DEFAULT_PORT = 8787
APP_PAGE = "https://cloud.ouraring.com/oauth/applications"


def cmd_login(args):
    creds = auth.load_credentials() or {}
    client_id = args.client_id or creds.get("client_id")
    client_secret = args.client_secret or creds.get("client_secret")
    if not (client_id and client_secret) or args.new_app:
        print(f"Oura API app credentials (from {APP_PAGE},")
        print("redirect URI http://localhost:8080/callback). Stored only in", paths.credentials_file())
        client_id = input("Client ID: ").strip()
        client_secret = getpass.getpass("Client secret: ").strip()
    auth.login(client_id, client_secret)
    if not args.no_sync:
        return cmd_sync(argparse.Namespace(reset=False))
    return 0


def cmd_sync(args):
    from .scraper import sync
    try:
        return 0 if sync(reset=args.reset) else 1
    except auth.NotLoggedIn as e:
        print(f"Oura: {e} — run `oura login`.", file=sys.stderr)
        return 2
    except Exception as e:  # e.g. offline; glance.json records it for the bar
        print(f"Oura sync failed: {e}", file=sys.stderr)
        return 1


def _listening(port):
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


def open_window(url):
    """A chromeless Chromium/Chrome app window if available, else the default browser."""
    for browser in ("chromium", "google-chrome-stable", "google-chrome"):
        path = shutil.which(browser)
        if path:
            subprocess.Popen([path, f"--app={url}", "--class=oura-dashboard"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            return
    webbrowser.open(url)


def cmd_dashboard(args):
    url = f"http://127.0.0.1:{args.port}/"
    if not _listening(args.port):
        # No socket unit / server running: start one that exits when left idle
        env = dict(os.environ, PYTHONPATH=os.pathsep.join(p for p in sys.path if p))
        subprocess.Popen([sys.executable, "-m", "oura", "serve", "--port", str(args.port), "--idle-exit", "30"],
                         env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        for _ in range(50):
            if _listening(args.port):
                break
            time.sleep(0.1)
    print(f"Dashboard: {url}")
    if not args.no_open:
        open_window(url)
    return 0


def cmd_serve(args):
    from .server import serve
    print(f"Serving http://127.0.0.1:{args.port}/ (data: {paths.data_dir()})", flush=True)
    serve(port=args.port, idle_exit=args.idle_exit)
    return 0


def cmd_glance(args):
    from . import glance
    out = glance.write()
    print(f"Wrote {paths.glance_file()} (latest readiness: {out.get('latest')})")
    return 0


def cmd_status(args):
    tokens = paths.tokens_file()
    state = paths.sync_state_file()
    last = max(json.loads(state.read_text()).values()) if state.exists() else None
    print(f"config  {paths.config_dir()}  ({'logged in' if tokens.exists() else 'not logged in — run `oura login`'})")
    print(f"data    {paths.data_dir()}  (last sync: {last or 'never'})")
    print(f"glance  {paths.glance_file()}")
    if tokens.exists():
        print(f"scopes  {' '.join(sorted(auth.granted_scopes()))}")
    return 0


def main(argv=None):
    parser = argparse.ArgumentParser(prog="oura", description="Oura Ring data scraper and dashboard")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("login", help="store app credentials and authorize (opens a browser)")
    p.add_argument("--client-id")
    p.add_argument("--client-secret")
    p.add_argument("--new-app", action="store_true", help="ask for credentials even if some are stored")
    p.add_argument("--no-sync", action="store_true", help="don't sync after logging in")
    p.set_defaults(func=cmd_login)

    p = sub.add_parser("sync", help="fetch new data")
    p.add_argument("--reset", action="store_true", help="re-fetch everything (last 730 days)")
    p.set_defaults(func=cmd_sync)

    p = sub.add_parser("dashboard", help="open the dashboard")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--no-open", action="store_true", help="just make sure the server is up")
    p.set_defaults(func=cmd_dashboard)

    p = sub.add_parser("serve", help="run the dashboard server in the foreground")
    p.add_argument("--port", type=int, default=DEFAULT_PORT)
    p.add_argument("--idle-exit", type=int, default=0, metavar="MIN", help="exit after MIN idle minutes")
    p.set_defaults(func=cmd_serve)

    sub.add_parser("glance", help="rewrite the bar summary").set_defaults(func=cmd_glance)
    sub.add_parser("status", help="show paths and login state").set_defaults(func=cmd_status)

    args = parser.parse_args(argv)
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
