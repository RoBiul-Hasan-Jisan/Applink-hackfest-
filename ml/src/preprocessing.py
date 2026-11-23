"""Load and merge REAL monthly dengue counts and weather. No data ships with this repo; see ../DATA_SOURCES.md."""
from __future__ import annotations
import hashlib
import pandas as pd

DENGUE_COLS = {"area", "month", "cases", "source", "retrieved_at"}
WEATHER_COLS = {"area", "month", "rain_mm", "temp_c", "humidity_pct", "source"}


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _read(path: str, required: set[str]) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"{path}: missing columns {sorted(missing)}")
    df["month"] = pd.to_datetime(df["month"], format="%Y-%m").dt.to_period("M")
    return df


def load_and_merge(dengue_path: str, weather_path: str) -> tuple[pd.DataFrame, dict]:
    d, w = _read(dengue_path, DENGUE_COLS), _read(weather_path, WEATHER_COLS)
    d = d.drop_duplicates(["area", "month"], keep="last")
    w = w.drop_duplicates(["area", "month"], keep="last")
    df = d.merge(w.drop(columns=["source"]), on=["area", "month"], how="left").sort_values(["area", "month"]).reset_index(drop=True)
    audit = {  # provenance shown in the data-integrity center; missing data stays missing (no imputation here)
        "dengue_file_sha256": sha256_file(dengue_path), "weather_file_sha256": sha256_file(weather_path),
        "dengue_rows": int(len(d)), "weather_rows": int(len(w)), "merged_rows": int(len(df)),
        "rows_without_weather": int(df[["rain_mm", "temp_c", "humidity_pct"]].isna().any(axis=1).sum()),
        "sources": sorted(set(d["source"].astype(str))), "weather_sources": sorted(set(w["source"].astype(str))),
        "areas": sorted(df["area"].unique().tolist()), "first_month": str(df["month"].min()), "last_month": str(df["month"].max()),
    }
    return df, audit
