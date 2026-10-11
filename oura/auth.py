"""
Oura API OAuth2 authentication.

`login()` is the only interactive step: it opens the browser, waits for the
callback and saves tokens. Everything else (`get_access_token()`) only loads
and refreshes them, and raises NotLoggedIn rather than opening a browser, so
background syncs can never pop up a login window.
"""

import json
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import requests

from . import paths

AUTH_URL = "https://cloud.ouraring.com/oauth/authorize"
TOKEN_URL = "https://api.ouraring.com/oauth/token"
REDIRECT_URI = "http://localhost:8080/callback"

# Scopes known to work for personal apps (several are undocumented)
CORE_SCOPES = "personal daily heartrate workout tag session spo2 stress heart_health ring_configuration email"
# Undocumented scopes guarding newer endpoints. Oura currently drops them
# silently for personal apps; they're asked for in case that changes.
EXTRA_SCOPES = "health_radar meals research"
SCOPES = f"{CORE_SCOPES} {EXTRA_SCOPES}"


class NotLoggedIn(Exception):
    """No usable tokens: the user needs to run `oura login`."""


# ---------------------------------------------------------------------------
# Credentials and tokens (both in the private config dir)
# ---------------------------------------------------------------------------

def load_credentials():
    path = paths.credentials_file()
    if not path.exists():
        return None
    return json.loads(path.read_text())


def save_credentials(client_id, client_secret):
    paths.write_private(paths.credentials_file(),
                        json.dumps({"client_id": client_id, "client_secret": client_secret}, indent=2))


def _load_tokens():
    path = paths.tokens_file()
    return json.loads(path.read_text()) if path.exists() else None


def _save_tokens(tokens):
    paths.write_private(paths.tokens_file(), json.dumps(tokens, indent=2))


def granted_scopes():
    """Scopes actually granted to the saved token (without the 'extapi:' prefix)."""
    tokens = _load_tokens() or {}
    return {s.split(":", 1)[-1] for s in tokens.get("scope", "").split()}


# ---------------------------------------------------------------------------
# Interactive login
# ---------------------------------------------------------------------------

class _CallbackHandler(BaseHTTPRequestHandler):
    code = None
    error = None

    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        ok = "code" in params
        if ok:
            _CallbackHandler.code = params["code"][0]
        else:
            _CallbackHandler.error = params.get("error", ["unknown"])[0]
        self.send_response(200 if ok else 400)
        self.send_header("Content-type", "text/html")
        self.end_headers()
        self.wfile.write(b"<h1>Authorization successful! You can close this tab.</h1>" if ok
                         else b"<h1>Authorization failed. Check the terminal.</h1>")

    def log_message(self, format, *args):
        pass  # suppress access logs


def _authorize(client_id, scopes, timeout=None):
    """Open the browser and wait for the callback. Returns (code, error)."""
    _CallbackHandler.code = _CallbackHandler.error = None
    url = f"{AUTH_URL}?{urlencode({'response_type': 'code', 'client_id': client_id, 'redirect_uri': REDIRECT_URI, 'scope': scopes})}"
    print("\nOpening browser for Oura authorization (cloud.ouraring.com)...")
    print(f"If the browser doesn't open, visit:\n  {url}\n")
    webbrowser.open(url)

    server = HTTPServer(("localhost", 8080), _CallbackHandler)
    server.timeout = timeout
    print("Waiting for authorization callback on http://localhost:8080/callback ...")
    server.handle_request()  # returns after `timeout` seconds if nothing arrives
    server.server_close()
    if not (_CallbackHandler.code or _CallbackHandler.error):
        return None, "timeout"
    return _CallbackHandler.code, _CallbackHandler.error


def login(client_id, client_secret):
    """Run the OAuth flow (falling back to core scopes if refused) and save tokens."""
    save_credentials(client_id, client_secret)
    # If Oura rejects the undocumented scopes it may show an error page instead
    # of redirecting back, so give up waiting after a few minutes and retry.
    code, error = _authorize(client_id, SCOPES, timeout=300)
    if error in ("invalid_scope", "unauthorized_client", "access_denied", "timeout"):
        print(f"Extra scopes not granted ({error}); retrying with core scopes only.")
        code, error = _authorize(client_id, CORE_SCOPES)
    if error or not code:
        raise RuntimeError(f"Authorization failed: {error or 'no code received'}")

    resp = requests.post(TOKEN_URL, data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
        "client_id": client_id,
        "client_secret": client_secret,
    }, timeout=30)
    resp.raise_for_status()
    tokens = resp.json()
    tokens["expires_at"] = time.time() + tokens.get("expires_in", 3600)
    _save_tokens(tokens)
    print(f"Logged in. Tokens saved to {paths.tokens_file()}")
    return tokens


# ---------------------------------------------------------------------------
# Non-interactive token access
# ---------------------------------------------------------------------------

def get_access_token():
    """Return a valid access token, refreshing it if needed. Never opens a browser."""
    creds, tokens = load_credentials(), _load_tokens()
    if not creds or not tokens:
        raise NotLoggedIn("not logged in")
    if time.time() < tokens.get("expires_at", 0) - 60:
        return tokens["access_token"]

    try:
        resp = requests.post(TOKEN_URL, data={
            "grant_type": "refresh_token",
            "refresh_token": tokens["refresh_token"],
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
        }, timeout=30)
    except requests.RequestException as e:
        raise ConnectionError(f"token refresh failed: {e}") from e
    if resp.status_code in (400, 401):
        raise NotLoggedIn("refresh token rejected")
    resp.raise_for_status()
    fresh = resp.json()
    # Keep what the refresh reply leaves out (it needn't repeat these)
    for key in ("refresh_token", "scope"):
        if not fresh.get(key) and tokens.get(key):
            fresh[key] = tokens[key]
    fresh["expires_at"] = time.time() + fresh.get("expires_in", 3600)
    _save_tokens(fresh)
    return fresh["access_token"]
