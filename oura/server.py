"""
Local HTTP server for the dashboard: static files from web/ plus a small JSON API.

    GET  /api/summary        every daily metric, as columns
    GET  /api/day?d=DATE     one day's detail (sleep stages, samples, workouts…)
    GET  /api/meta           files, sync state, scopes, ring
    GET  /api/ping           heartbeat from an open page (keeps the server up)
    POST /api/sync           run `oura sync`, then reload

Works standalone or socket-activated by systemd (LISTEN_FDS): the socket unit
owns the port, and the server can exit when idle and be started again by the
next request.
"""

import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .store import DataStore

WEB_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")


class App:
    def __init__(self):
        self._store = None
        self.lock = threading.Lock()
        self.sync_log = ""
        self.syncing = False
        self.last_request = time.monotonic()

    @property
    def store(self):
        # Loaded on first use, so a socket-activated start answers quickly
        with self.lock:
            if self._store is None:
                self._store = DataStore()
            return self._store

    def sync(self):
        """Run `oura sync` in a child process (same interpreter and path), then reload."""
        if self.syncing:
            return False, "A sync is already running."
        self.syncing = True
        try:
            env = dict(os.environ, PYTHONPATH=os.pathsep.join(p for p in sys.path if p))
            proc = subprocess.run([sys.executable, "-m", "oura", "sync"], env=env,
                                  capture_output=True, text=True, timeout=1800)
            self.sync_log = proc.stdout + proc.stderr
            with self.lock:
                self._store = None  # reload on next request
            return proc.returncode == 0, self.sync_log
        finally:
            self.syncing = False


def make_handler(app: App):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=WEB_DIR, **kwargs)

        def log_message(self, format, *args):
            pass

        def end_headers(self):
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def _json(self, payload, status=200):
            body = json.dumps(payload, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            app.last_request = time.monotonic()
            url = urlparse(self.path)
            q = parse_qs(url.query)
            if url.path == "/api/summary":
                return self._json(app.store.summary())
            if url.path == "/api/day":
                day = q.get("d", [""])[0]
                if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
                    return self._json({"error": "bad date"}, 400)
                return self._json(app.store.day(day))
            if url.path == "/api/ping":
                return self._json({})
            if url.path == "/api/meta":
                return self._json(app.store.meta() | {"syncing": app.syncing, "sync_log": app.sync_log})
            if url.path.startswith("/api/"):
                return self._json({"error": "not found"}, 404)
            return super().do_GET()

        def do_POST(self):
            app.last_request = time.monotonic()
            if urlparse(self.path).path == "/api/sync":
                ok, log = app.sync()
                app.last_request = time.monotonic()
                return self._json({"ok": ok, "log": log})
            return self._json({"error": "not found"}, 404)

    return Handler


def serve(port=8787, idle_exit=0):
    """
    Serve until interrupted (or, with idle_exit, until that many minutes pass
    without a request). Uses the systemd-passed socket when there is one.
    """
    app = App()
    activated = os.environ.get("LISTEN_PID") == str(os.getpid()) and os.environ.get("LISTEN_FDS") == "1"
    if activated:
        server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app), bind_and_activate=False)
        server.socket.close()
        server.socket = socket.socket(fileno=3)
    else:
        server = ThreadingHTTPServer(("127.0.0.1", port), make_handler(app))

    if idle_exit:
        def watch():
            while True:
                time.sleep(10)
                if not app.syncing and time.monotonic() - app.last_request > idle_exit * 60:
                    server.shutdown()
                    return
        threading.Thread(target=watch, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        if not activated:
            server.server_close()
