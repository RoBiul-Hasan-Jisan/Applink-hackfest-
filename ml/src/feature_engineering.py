"""Leakage-safe features: everything for month t uses information from months < t only."""
from __future__ import annotations
import numpy as np
import pandas as pd

FEATURES = ["cases_lag1", "cases_lag2", "cases_lag3", "cases_lag12", "rain_lag1", "rain_lag2", "rain_lag3", "temp_lag1", "hum_lag1", "month_sin", "month_cos"]
LABELS = {"cases_lag1": "Last month's dengue activity", "cases_lag2": "Dengue activity two months ago", "cases_lag3": "Dengue activity three months ago", "cases_lag12": "Same month last year (seasonality)",
          "rain_lag1": "Rainfall last month", "rain_lag2": "Rainfall two months ago", "rain_lag3": "Rainfall three months ago", "temp_lag1": "Temperature last month", "hum_lag1": "Humidity last month",
          "month_sin": "Time of year", "month_cos": "Time of year"}


def make_features(df: pd.DataFrame) -> pd.DataFrame:
    out = []
    for _, g in df.sort_values("month").groupby("area"):
        g = g.copy()
        for k in (1, 2, 3, 12):
            g[f"cases_lag{k}"] = g["cases"].shift(k)
        for k in (1, 2, 3):
            g[f"rain_lag{k}"] = g["rain_mm"].shift(k)
        g["temp_lag1"], g["hum_lag1"] = g["temp_c"].shift(1), g["humidity_pct"].shift(1)
        m = g["month"].dt.month
        g["month_sin"], g["month_cos"] = np.sin(2 * np.pi * m / 12), np.cos(2 * np.pi * m / 12)
        out.append(g)
    return pd.concat(out).dropna(subset=FEATURES + ["cases"]).reset_index(drop=True)
