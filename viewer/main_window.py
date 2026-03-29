import numpy as np
import pandas as pd
from PyQt6.QtWidgets import QMainWindow, QWidget, QHBoxLayout

from .controls import ControlPanel
from .data import DataStore
from .metrics import get_metric
from .plot_canvas import PlotCanvas


class MainWindow(QMainWindow):
    def __init__(self, data_store):
        super().__init__()
        self.data = data_store
        self.setWindowTitle("Oura Viewer")
        self.resize(1200, 700)

        central = QWidget()
        self.setCentralWidget(central)
        layout = QHBoxLayout(central)

        self.controls = ControlPanel(self.data.available_files())
        self.canvas = PlotCanvas()

        layout.addWidget(self.controls)
        layout.addWidget(self.canvas, stretch=1)

        self.controls.plot_requested.connect(self._on_plot)

        self.statusBar().showMessage("Select metrics and click Plot")

    def _on_plot(self, metric_keys, start, end):
        series = []
        for key in metric_keys:
            metric = get_metric(key)
            if not metric:
                continue

            if key == "heartrate_daily":
                df = self.data.query(metric.file_stem, metric.date_column, start, end)
                dates, values = self.data.aggregate_heartrate_daily(df)
            else:
                df = self.data.query(metric.file_stem, metric.date_column, start, end)
                if metric.row_filter:
                    df = df[df.apply(metric.row_filter, axis=1)]
                vals = pd.to_numeric(df[metric.value_column], errors="coerce")
                mask = vals.notna()
                df = df.loc[mask]
                vals = vals.loc[mask]
                if metric.value_transform:
                    vals = vals.map(metric.value_transform)
                dates = df[metric.date_column].str[:10].values
                values = vals.values

            if len(dates) > 0:
                series.append((metric, dates, values))

        self.canvas.plot(series)
        n = len(series)
        self.statusBar().showMessage(f"{n} metric{'s' if n != 1 else ''} | {start} to {end}")

