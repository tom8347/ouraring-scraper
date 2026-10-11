"""
Where things live. Secrets, data and the bar's summary are kept apart so the
data directory can be shared or synced without leaking credentials.

    config  $OURA_CONFIG_DIR or $XDG_CONFIG_HOME/oura   credentials.json, tokens.json (mode 600)
    data    $OURA_DATA_DIR   or $XDG_DATA_HOME/oura     one CSV per endpoint, .state.json
    glance  $XDG_STATE_HOME/oura/glance.json            small summary for status bars
"""

import os
from pathlib import Path


def _xdg(var, default):
    return Path(os.environ.get(var) or Path.home() / default)


def config_dir() -> Path:
    return Path(os.environ.get("OURA_CONFIG_DIR") or _xdg("XDG_CONFIG_HOME", ".config") / "oura")


def data_dir() -> Path:
    return Path(os.environ.get("OURA_DATA_DIR") or _xdg("XDG_DATA_HOME", ".local/share") / "oura")


def state_dir() -> Path:
    return _xdg("XDG_STATE_HOME", ".local/state") / "oura"


def credentials_file() -> Path:
    return config_dir() / "credentials.json"


def tokens_file() -> Path:
    return config_dir() / "tokens.json"


def sync_state_file() -> Path:
    return data_dir() / ".state.json"


def glance_file() -> Path:
    return state_dir() / "glance.json"


def write_private(path: Path, text: str):
    """Write a file readable only by the owner (for credentials and tokens)."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    fd = os.open(path.with_suffix(".tmp"), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.replace(path.with_suffix(".tmp"), path)
