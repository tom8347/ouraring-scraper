"""
Oura API OAuth2 authentication.

First run: opens browser for authorization, saves tokens.
Subsequent runs: loads tokens, refreshes if expired.
"""

import json
import os
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlencode, urlparse

import requests

TOKENS_FILE = "tokens.json"
AUTH_URL = "https://cloud.ouraring.com/oauth/authorize"
TOKEN_URL = "https://api.ouraring.com/oauth/token"
REDIRECT_URI = "http://localhost:8080/callback"
SCOPES = "personal daily heartrate workout tag session spo2 stress heart_health ring_configuration"


class _CallbackHandler(BaseHTTPRequestHandler):
    code = None
    error = None

    def do_GET(self):
        parsed = urlparse(self.path)
        params = parse_qs(parsed.query)
        if "code" in params:
            _CallbackHandler.code = params["code"][0]
            self.send_response(200)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authorization successful! You can close this tab.</h1>")
        else:
            _CallbackHandler.error = params.get("error", ["unknown"])[0]
            self.send_response(400)
            self.send_header("Content-type", "text/html")
            self.end_headers()
            self.wfile.write(b"<h1>Authorization failed. Check the terminal.</h1>")

    def log_message(self, format, *args):
        pass  # suppress access logs


def _run_oauth_flow(client_id, client_secret):
    """Open browser, wait for callback, exchange code for tokens."""
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
    }
    auth_url = f"{AUTH_URL}?{urlencode(params)}"

    print("\nOpening browser for Oura authorization...")
    print(f"If the browser doesn't open, visit:\n  {auth_url}\n")
    webbrowser.open(auth_url)

    server = HTTPServer(("localhost", 8080), _CallbackHandler)
    print("Waiting for authorization callback on http://localhost:8080/callback ...")
    server.handle_request()

    if _CallbackHandler.error:
        raise RuntimeError(f"Authorization failed: {_CallbackHandler.error}")
    if not _CallbackHandler.code:
        raise RuntimeError("No authorization code received.")

    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "code": _CallbackHandler.code,
            "redirect_uri": REDIRECT_URI,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    resp.raise_for_status()
    tokens = resp.json()
    tokens["expires_at"] = time.time() + tokens.get("expires_in", 3600)
    _save_tokens(tokens)
    print("Authorization successful! Tokens saved to tokens.json.\n")
    return tokens


def _refresh_tokens(client_id, client_secret, refresh_token):
    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "client_secret": client_secret,
        },
    )
    resp.raise_for_status()
    tokens = resp.json()
    tokens["expires_at"] = time.time() + tokens.get("expires_in", 3600)
    _save_tokens(tokens)
    return tokens


def _load_tokens():
    if os.path.exists(TOKENS_FILE):
        with open(TOKENS_FILE) as f:
            return json.load(f)
    return None


def _save_tokens(tokens):
    with open(TOKENS_FILE, "w") as f:
        json.dump(tokens, f, indent=2)


def get_access_token(client_id, client_secret):
    """Return a valid access token, running OAuth flow or refreshing as needed."""
    tokens = _load_tokens()
    if not tokens:
        tokens = _run_oauth_flow(client_id, client_secret)
    elif time.time() > tokens.get("expires_at", 0) - 60:
        print("Access token expired, refreshing...")
        try:
            tokens = _refresh_tokens(client_id, client_secret, tokens["refresh_token"])
        except Exception as e:
            print(f"Refresh failed ({e}), re-authorizing...")
            tokens = _run_oauth_flow(client_id, client_secret)
    return tokens["access_token"]
