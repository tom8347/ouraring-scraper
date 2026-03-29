from datetime import date, timedelta

from PyQt6.QtCore import pyqtSignal, QDate, Qt
from PyQt6.QtWidgets import (
    QWidget, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QTreeWidget, QTreeWidgetItem, QDateEdit,
)

from .metrics import metric_groups


class ControlPanel(QWidget):
    plot_requested = pyqtSignal(list, str, str)  # metric_keys, start, end

    def __init__(self, available_files, parent=None):
        super().__init__(parent)
        self.available_files = available_files
        self.setFixedWidth(260)
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(4, 4, 4, 4)

        # Date range presets
        layout.addWidget(QLabel("Date Range"))
        presets_row = QHBoxLayout()
        for label, days in [("1W", 7), ("2W", 14), ("1M", 30), ("3M", 90),
                            ("6M", 180), ("1Y", 365), ("All", 0)]:
            btn = QPushButton(label)
            btn.setMaximumWidth(36)
            btn.clicked.connect(lambda _, d=days: self._set_preset(d))
            presets_row.addWidget(btn)
        layout.addLayout(presets_row)

        # Date pickers
        dates_row = QHBoxLayout()
        self.start_date = QDateEdit()
        self.start_date.setCalendarPopup(True)
        self.start_date.setDisplayFormat("yyyy-MM-dd")
        self.end_date = QDateEdit()
        self.end_date.setCalendarPopup(True)
        self.end_date.setDisplayFormat("yyyy-MM-dd")
        self._init_dates(30)
        dates_row.addWidget(self.start_date)
        dates_row.addWidget(QLabel("to"))
        dates_row.addWidget(self.end_date)
        layout.addLayout(dates_row)

        # Metric tree
        layout.addWidget(QLabel("Metrics"))
        self.tree = QTreeWidget()
        self.tree.setHeaderHidden(True)
        groups = metric_groups()
        for group_name, metrics in groups.items():
            group_item = QTreeWidgetItem(self.tree, [group_name])
            group_item.setExpanded(True)
            for m in metrics:
                item = QTreeWidgetItem(group_item, [m.label])
                item.setData(0, Qt.ItemDataRole.UserRole, m.key)
                enabled = m.file_stem in self.available_files
                if enabled:
                    item.setCheckState(0, Qt.CheckState.Unchecked)
                else:
                    item.setDisabled(True)
        self.tree.itemChanged.connect(lambda: self._on_plot())
        layout.addWidget(self.tree, stretch=1)

        # Connect date changes to auto-replot
        self.start_date.dateChanged.connect(lambda: self._on_plot())
        self.end_date.dateChanged.connect(lambda: self._on_plot())

    def _init_dates(self, days):
        today = date.today()
        self.end_date.setDate(QDate(today.year, today.month, today.day))
        if days == 0:
            start = date(2020, 1, 1)
        else:
            start = today - timedelta(days=days)
        self.start_date.setDate(QDate(start.year, start.month, start.day))

    def _set_preset(self, days):
        today = date.today()
        # Block signals to avoid double replot
        self.start_date.blockSignals(True)
        self.end_date.blockSignals(True)
        self.end_date.setDate(QDate(today.year, today.month, today.day))
        if days == 0:
            start = date(2020, 1, 1)
        else:
            start = today - timedelta(days=days)
        self.start_date.setDate(QDate(start.year, start.month, start.day))
        self.start_date.blockSignals(False)
        self.end_date.blockSignals(False)
        self._on_plot()

    def _on_plot(self):
        keys = []
        root = self.tree.invisibleRootItem()
        for i in range(root.childCount()):
            group = root.child(i)
            for j in range(group.childCount()):
                item = group.child(j)
                if item.checkState(0) == Qt.CheckState.Checked:
                    keys.append(item.data(0, Qt.ItemDataRole.UserRole))
        sd = self.start_date.date()
        ed = self.end_date.date()
        self.plot_requested.emit(
            keys,
            f"{sd.year():04d}-{sd.month():02d}-{sd.day():02d}",
            f"{ed.year():04d}-{ed.month():02d}-{ed.day():02d}",
        )
