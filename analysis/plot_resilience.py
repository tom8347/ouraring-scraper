import csv
import datetime
import matplotlib.pyplot as plt
import matplotlib.dates as mdates

DATA_FILE = "data/daily_resilience.csv"

rows = []
with open(DATA_FILE) as f:
    reader = csv.DictReader(f)
    for row in reader:
        rows.append(row)

cutoff = datetime.date.today() - datetime.timedelta(days=14)
rows = [r for r in rows if datetime.date.fromisoformat(r["day"]) >= cutoff]
rows.sort(key=lambda r: r["day"])

dates = [datetime.date.fromisoformat(r["day"]) for r in rows]
sleep_recovery = [float(r["contributors.sleep_recovery"]) for r in rows]
daytime_recovery = [float(r["contributors.daytime_recovery"]) for r in rows]
stress = [float(r["contributors.stress"]) for r in rows]

fig, ax = plt.subplots(figsize=(10, 5))

ax.plot(dates, sleep_recovery, marker="x", linestyle="none", markersize=10, markeredgewidth=2, label="Sleep recovery")
ax.plot(dates, daytime_recovery, marker="x", linestyle="none", markersize=10, markeredgewidth=2, label="Daytime recovery")
ax.plot(dates, stress, marker="x", linestyle="none", markersize=10, markeredgewidth=2, label="Stress")

ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
ax.xaxis.set_major_locator(mdates.DayLocator())
fig.autofmt_xdate()

ax.set_ylabel("Score")
ax.set_title("Daily Resilience — last 2 weeks")
ax.legend()
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()
