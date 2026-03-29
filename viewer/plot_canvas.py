import numpy as np
from matplotlib.backends.backend_qtagg import FigureCanvasQTAgg
from matplotlib.figure import Figure
import matplotlib.dates as mdates

# High-contrast palette — perceptually distinct, colourblind-friendly
_PALETTE = [
    "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
    "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
    "#dcbeff", "#9a6324", "#800000", "#aaffc3", "#808000",
    "#000075", "#a9a9a9",
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
            self.fig.text(0.5, 0.5, "Select metrics and click Plot",
                          ha="center", va="center", fontsize=14, color="#888")
            self.draw()
            return

        # Assign colours dynamically from high-contrast palette
        colors = {series_list[i][0].key: _PALETTE[i % len(_PALETTE)]
                  for i in range(len(series_list))}

        # Group by scale_group
        scale_groups = {}
        for metric, dates, values in series_list:
            sg = metric.scale_group or metric.key
            scale_groups.setdefault(sg, []).append((metric, dates, values))

        sg_keys = list(scale_groups.keys())
        ax_left = self.fig.add_subplot(111)
        ax_right = None

        if len(sg_keys) == 2:
            ax_right = ax_left.twinx()

        axes = {sg_keys[0]: ax_left}
        if len(sg_keys) >= 2:
            axes[sg_keys[1]] = ax_right or ax_left
        for sg in sg_keys[2:]:
            axes[sg] = ax_left

        lines = []
        labels = []
        for sg, items in scale_groups.items():
            ax = axes[sg]
            for metric, dates, values in items:
                dt = np.array(dates, dtype="datetime64[D]")
                color = colors[metric.key]
                kw = dict(color=color, label=metric.label)
                if metric.plot_type == "bar":
                    bars = ax.bar(dt, values, width=0.8, alpha=0.6, **kw)
                    lines.append(bars[0] if len(bars) else None)
                elif metric.plot_type == "scatter":
                    sc = ax.scatter(dt, values, s=20, alpha=0.7, **kw)
                    lines.append(sc)
                else:
                    line, = ax.plot(dt, values, linewidth=1.5, alpha=0.8, **kw)
                    lines.append(line)
                labels.append(metric.label)
            unit_labels = set()
            for m, _, _ in items:
                if m.unit:
                    unit_labels.add(m.unit)
            if unit_labels:
                ax.set_ylabel(", ".join(sorted(unit_labels)))

        ax_left.xaxis.set_major_formatter(mdates.DateFormatter("%b %d"))
        ax_left.xaxis.set_major_locator(mdates.AutoDateLocator())
        self.fig.autofmt_xdate(rotation=30)
        ax_left.grid(True, alpha=0.3)

        valid = [(l, lb) for l, lb in zip(lines, labels) if l is not None]
        if valid:
            self.fig.legend([v[0] for v in valid], [v[1] for v in valid],
                            loc="upper left", fontsize=8, framealpha=0.8)

        self.fig.tight_layout()
        self.draw()
