import numpy as np
import matplotlib
import matplotlib.dates as mdates
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg
from matplotlib.figure import Figure

# Dark theme rcParams — applied globally at import time
matplotlib.rcParams.update({
    "figure.facecolor":      "#0d1117",
    "axes.facecolor":        "#161b22",
    "axes.edgecolor":        "#30363d",
    "axes.labelcolor":       "#8b949e",
    "axes.labelsize":        11,
    "text.color":            "#e6edf3",
    "xtick.color":           "#8b949e",
    "ytick.color":           "#8b949e",
    "xtick.labelsize":       10,
    "ytick.labelsize":       10,
    "grid.color":            "#21262d",
    "grid.linewidth":        0.8,
    "legend.facecolor":      "#161b22",
    "legend.edgecolor":      "#30363d",
    "legend.labelcolor":     "#c9d1d9",
    "legend.fontsize":       10,
    "legend.framealpha":     0.95,
    "font.family":           ["sans-serif"],
    "font.sans-serif":       ["SF Pro Display", "Helvetica Neue", "Segoe UI", "Arial", "DejaVu Sans"],
    "figure.autolayout":     False,
})

# Cohesive palette that pops on dark backgrounds
_PALETTE = [
    "#58a6ff",  # blue
    "#3fb950",  # green
    "#f78166",  # salmon
    "#d2a8ff",  # lavender
    "#ffa657",  # amber
    "#79c0ff",  # sky
    "#56d364",  # mint
    "#ff7b72",  # coral
    "#e3b341",  # gold
    "#bc8cff",  # violet
    "#a5d6ff",  # ice blue
    "#7ee787",  # pale mint
    "#ffa198",  # pink
    "#cae8ff",  # pale sky
    "#ffb3ae",  # peach
    "#b1f0c5",  # pale green
]


class PlotCanvas(FigureCanvasQTAgg):
    def __init__(self, parent=None):
        self.fig = Figure(figsize=(10, 5), dpi=100)
        super().__init__(self.fig)
        self.setParent(parent)

    def plot(self, series_list):
        """series_list: [(Metric, dates_array, values_array), ...]"""
        self.fig.clear()

        if not series_list:
            ax = self.fig.add_subplot(111)
            ax.set_facecolor("#161b22")
            for spine in ax.spines.values():
                spine.set_visible(False)
            ax.set_xticks([])
            ax.set_yticks([])
            ax.text(0.5, 0.5, "Select metrics to plot",
                    ha="center", va="center", fontsize=14,
                    color="#8b949e", transform=ax.transAxes)
            self.draw()
            return

        colors = {series_list[i][0].key: _PALETTE[i % len(_PALETTE)]
                  for i in range(len(series_list))}

        # Group by scale_group for dual-axis support
        scale_groups = {}
        for metric, dates, values in series_list:
            sg = metric.scale_group or metric.key
            scale_groups.setdefault(sg, []).append((metric, dates, values))

        sg_keys = list(scale_groups.keys())
        ax_left = self.fig.add_subplot(111)
        ax_right = ax_left.twinx() if len(sg_keys) == 2 else None

        axes = {sg_keys[0]: ax_left}
        if len(sg_keys) >= 2:
            axes[sg_keys[1]] = ax_right or ax_left
        for sg in sg_keys[2:]:
            axes[sg] = ax_left

        lines, labels = [], []
        for sg, items in scale_groups.items():
            ax = axes[sg]
            for metric, dates, values in items:
                dt = np.array(dates, dtype="datetime64[D]")
                color = colors[metric.key]
                kw = dict(color=color, label=metric.label)
                if metric.plot_type == "bar":
                    bars = ax.bar(dt, values, width=0.8, alpha=0.7, **kw)
                    lines.append(bars[0] if len(bars) else None)
                elif metric.plot_type == "scatter":
                    sc = ax.scatter(dt, values, s=28, alpha=0.85, zorder=3, **kw)
                    lines.append(sc)
                else:
                    line, = ax.plot(dt, values, linewidth=2, alpha=0.9, **kw)
                    lines.append(line)
                labels.append(metric.label)

            unit_labels = {m.unit for m, _, _ in items if m.unit}
            if unit_labels:
                ax.set_ylabel(", ".join(sorted(unit_labels)))

        # Style axes
        for ax in {ax_left, ax_right} - {None}:
            ax.spines["top"].set_visible(False)
            ax.spines["right"].set_visible(ax is ax_right)
            ax.spines["left"].set_visible(ax is ax_left)
            ax.spines["bottom"].set_color("#30363d")
            if ax is ax_right and ax_right is not None:
                ax.spines["right"].set_color("#30363d")
            if ax is ax_left:
                ax.spines["left"].set_color("#30363d")
            ax.tick_params(axis="both", which="both", length=3, color="#30363d")
            ax.grid(True, axis="y", alpha=1.0, color="#21262d", linewidth=0.8)

        ax_left.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
        ax_left.xaxis.set_major_locator(mdates.AutoDateLocator())
        self.fig.autofmt_xdate(rotation=25, ha="right")

        valid = [(l, lb) for l, lb in zip(lines, labels) if l is not None]
        if valid:
            self.fig.legend(
                [v[0] for v in valid], [v[1] for v in valid],
                loc="upper left",
                bbox_to_anchor=(0.07, 0.97),
                framealpha=0.9,
                borderpad=0.8,
            )

        self.fig.subplots_adjust(left=0.07, right=0.95, top=0.92, bottom=0.12)
        self.draw()
