#!/usr/bin/env python3
import os
import subprocess
import sys

from PyQt6.QtWidgets import QApplication

from viewer.data import DataStore
from viewer.main_window import MainWindow

SCRAPER = os.path.join(os.path.dirname(__file__), "scraper.py")


def main():
    print("Fetching new data...")
    subprocess.run([sys.executable, SCRAPER], check=True)
    print("Done.")

    app = QApplication(sys.argv)
    store = DataStore()
    window = MainWindow(store)
    window.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
