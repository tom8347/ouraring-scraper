#!/usr/bin/env python3
"""Scatter plot of all heart rate readings over time."""

import csv
from datetime import datetime
from pathlib import Path

import numpy as np
import matplotlib.pyplot as plt

DATA = Path(__file__).parent.parent / "data"

with open(DATA / "heartrate.csv", newline="") as f:
    reader = csv.DictReader(f)
    rows = list(reader)

timestamps = np.array([datetime.fromisoformat(r["timestamp"].replace("Z", "+00:00")) for r in rows])
bpm = np.array([int(r["bpm"]) for r in rows])

order = np.argsort(timestamps)
timestamps = timestamps[order]
bpm = bpm[order]

fig, ax = plt.subplots(figsize=(20, 6))

ax.scatter(timestamps, bpm, s=1, alpha=0.3, linewidths=0)

ax.set_title("Heart Rate over Time")
ax.set_xlabel("Date")
ax.set_ylabel("BPM")

fig.tight_layout()
plt.show()
