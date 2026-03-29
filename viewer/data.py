import os

import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")


class DataStore:
    def __init__(self, data_dir=DATA_DIR):
        self.data_dir = data_dir
        self._cache = {}

    def available_files(self):
        return [f[:-4] for f in os.listdir(self.data_dir) if f.endswith(".csv")]

    def _load(self, file_stem):
        if file_stem in self._cache:
            return self._cache[file_stem]
        path = os.path.join(self.data_dir, f"{file_stem}.csv")
        df = pd.read_csv(path)
        self._cache[file_stem] = df
        return df

    def query(self, file_stem, date_col, start, end):
        df = self._load(file_stem)
        dates = df[date_col].str[:10]
        mask = (dates >= start) & (dates <= end)
        return df.loc[mask].copy()

    def aggregate_heartrate_daily(self, df):
        df = df.copy()
        df["_day"] = df["timestamp"].str[:10]
        df["bpm"] = pd.to_numeric(df["bpm"], errors="coerce")
        agg = df.groupby("_day")["bpm"].mean().dropna().sort_index()
        return agg.index.values, agg.values

    def invalidate(self):
        self._cache.clear()
