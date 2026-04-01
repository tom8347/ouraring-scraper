from datetime import date, timedelta

from PyQt6.QtCore import pyqtSignal, QDate, Qt
from PyQt6.QtGui import QColor, QFont
from PyQt6.QtWidgets import (
    QFrame, QVBoxLayout, QHBoxLayout, QLabel,
    QPushButton, QTreeWidget, QTreeWidgetItem, QDateEdit, QSizePolicy,
)

from .metrics import metric_groups


def _section_label(text):
    lbl = QLabel(text.upper())
    font = lbl.font()
    font.setPointSize(9)
    font.setWeight(QFont.Weight.DemiBold)
    lbl.setFont(font)
    lbl.setStyleSheet(
        "color: #8b949e; letter-spacing: 1.2px;"
        "margin-top: 16px; margin-bottom: 2px;"
        "background: transparent;"
    )
    return lbl


class ControlPanel(QFrame):
    plot_requested = pyqtSignal(list, str, str)  # metric_keys, start, end

    def __init__(self, available_files, parent=None):
        super().__init__(parent)
        self.setObjectName("sidebar")
        self.available_files = available_files
        self.setFixedWidth(248)
        self._build_ui()

    def _build_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 16, 12, 12)
        layout.setSpacing(4)

        # App title
        title = QLabel("Oura Viewer")
        font = title.font()
        font.setPointSize(15)
        font.setWeight(QFont.Weight.Bold)
        title.setFont(font)
        title.setStyleSheet("color: #e6edf3; background: transparent; margin-bottom: 4px;")
        layout.addWidget(title)

        # ── Date Range ──────────────────────────────
        layout.addWidget(_section_label("Date Range"))

        presets_row = QHBoxLayout()
        presets_row.setSpacing(4)
        for label, days in [("1W", 7), ("1M", 30), ("3M", 90), ("6M", 180), ("1Y", 365), ("All", 0)]:
            btn = QPushButton(label)
            btn.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Fixed)
            btn.setFixedHeight(26)
            btn.clicked.connect(lambda _, d=days: self._set_preset(d))
            presets_row.addWidget(btn)
        layout.addLayout(presets_row)

        dates_row = QHBoxLayout()
        dates_row.setSpacing(6)
        self.start_date = QDateEdit()
        self.start_date.setCalendarPopup(True)
        self.start_date.setDisplayFormat("yyyy-MM-dd")
        self.start_date.setFixedHeight(28)
        self.end_date = QDateEdit()
        self.end_date.setCalendarPopup(True)
        self.end_date.setDisplayFormat("yyyy-MM-dd")
        self.end_date.setFixedHeight(28)
        self._init_dates(30)

        sep = QLabel("→")
        sep.setStyleSheet("color: #8b949e; background: transparent;")
        sep.setAlignment(Qt.AlignmentFlag.AlignCenter)

        dates_row.addWidget(self.start_date)
        dates_row.addWidget(sep)
        dates_row.addWidget(self.end_date)
        layout.addLayout(dates_row)

        # ── Metrics ─────────────────────────────────
        layout.addWidget(_section_label("Metrics"))

        self.tree = QTreeWidget()
        self.tree.setHeaderHidden(True)
        self.tree.setIndentation(12)
        self.tree.setAnimated(False)

        groups = metric_groups()
        for group_name, metrics in groups.items():
            group_item = QTreeWidgetItem(self.tree, [group_name])
            group_item.setExpanded(True)
            gfont = group_item.font(0)
            gfont.setWeight(QFont.Weight.DemiBold)
            gfont.setPointSize(11)
            group_item.setFont(0, gfont)
            group_item.setForeground(0, QColor("#c9d1d9"))
            group_item.setFlags(group_item.flags() & ~Qt.ItemFlag.ItemIsUserCheckable)

            for m in metrics:
                item = QTreeWidgetItem(group_item, [m.label])
                item.setForeground(0, QColor("#8b949e"))
                item.setData(0, Qt.ItemDataRole.UserRole, m.key)
                if m.file_stem in self.available_files:
                    item.setCheckState(0, Qt.CheckState.Unchecked)
                else:
                    item.setDisabled(True)

        self.tree.itemChanged.connect(lambda: self._on_plot())
        layout.addWidget(self.tree, stretch=1)

        self.start_date.dateChanged.connect(lambda: self._on_plot())
        self.end_date.dateChanged.connect(lambda: self._on_plot())

    def _init_dates(self, days):
        today = date.today()
        self.end_date.setDate(QDate(today.year, today.month, today.day))
        start = date(2020, 1, 1) if days == 0 else today - timedelta(days=days)
        self.start_date.setDate(QDate(start.year, start.month, start.day))

    def _set_preset(self, days):
        today = date.today()
        self.start_date.blockSignals(True)
        self.end_date.blockSignals(True)
        self.end_date.setDate(QDate(today.year, today.month, today.day))
        start = date(2020, 1, 1) if days == 0 else today - timedelta(days=days)
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
