#!/usr/bin/env python3
import os
import subprocess
import sys

from PyQt6.QtWidgets import QApplication

from viewer.data import DataStore
from viewer.main_window import MainWindow

SCRAPER = os.path.join(os.path.dirname(__file__), "scraper.py")

_DARK_QSS = """
QMainWindow, QWidget {
    background-color: #0d1117;
    color: #e6edf3;
    font-size: 13px;
}

QFrame#sidebar {
    background-color: #161b22;
    border-right: 1px solid #21262d;
}

QPushButton {
    background-color: #21262d;
    color: #c9d1d9;
    border: 1px solid #30363d;
    border-radius: 5px;
    padding: 3px 7px;
    font-size: 11px;
}
QPushButton:hover {
    background-color: #30363d;
    border-color: #58a6ff;
    color: #58a6ff;
}
QPushButton:pressed {
    background-color: #1f6feb44;
}

QDateEdit {
    background-color: #21262d;
    color: #e6edf3;
    border: 1px solid #30363d;
    border-radius: 5px;
    padding: 3px 6px;
    selection-background-color: #1f6feb;
}
QDateEdit:focus { border-color: #58a6ff; }
QDateEdit::drop-down { border: none; width: 16px; }

QTreeWidget {
    background-color: #0d1117;
    border: 1px solid #21262d;
    border-radius: 6px;
    outline: none;
}
QTreeWidget::item { height: 24px; padding-left: 2px; }
QTreeWidget::item:hover { background-color: #1f2937; border-radius: 4px; }
QTreeWidget::item:selected { background-color: transparent; }
QHeaderView::section { background-color: #0d1117; border: none; }

QScrollBar:vertical {
    background: #0d1117;
    width: 6px;
    margin: 0;
    border-radius: 3px;
}
QScrollBar::handle:vertical {
    background: #30363d;
    border-radius: 3px;
    min-height: 20px;
}
QScrollBar::handle:vertical:hover { background: #58a6ff; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }

QStatusBar {
    background-color: #161b22;
    color: #8b949e;
    border-top: 1px solid #21262d;
    font-size: 11px;
}

QCalendarWidget QWidget { background-color: #161b22; color: #e6edf3; }
QCalendarWidget QAbstractItemView {
    background-color: #161b22;
    color: #e6edf3;
    selection-background-color: #1f6feb;
}
QCalendarWidget QToolButton { color: #e6edf3; background-color: #21262d; }
QCalendarWidget QMenu { background-color: #161b22; color: #e6edf3; }
"""


def main():
    print("Fetching new data...")
    subprocess.run([sys.executable, SCRAPER], check=True)
    print("Done.")

    app = QApplication(sys.argv)
    app.setStyleSheet(_DARK_QSS)
    store = DataStore()
    window = MainWindow(store)
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
