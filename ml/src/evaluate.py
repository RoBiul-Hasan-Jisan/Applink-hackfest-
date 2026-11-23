"""Release gate + honest evaluation. Chronological split only. Compares the model with a seasonal-naive baseline."""
from __future__ import annotations
import numpy as np
import pandas as pd

MIN_TRAIN_ROWS, MIN_TEST_MONTHS, MIN_AREAS_MONTHS = 36, 6, 36


def gate(feat: pd.DataFrame) -> list[str]:
    reasons = []
    months = sorted(feat["month"].unique())
    if len(feat) < MIN_TRAIN_ROWS + MIN_TEST_MONTHS: reasons.append(f"only {len(feat)} usable rows (need >= {MIN_TRAIN_ROWS + MIN_TEST_MONTHS})")
    if len(months) < MIN_AREAS_MONTHS: reasons.append(f"only {len(months)} distinct months of history after lagging (need >= {MIN_AREAS_MONTHS})")
    return reasons


def time_split(feat: pd.DataFrame, test_months: int | None = None):
    months = sorted(feat["month"].unique())
    n_test = test_months or max(MIN_TEST_MONTHS, len(months) // 5)
    cut = months[-n_test]
    return feat[feat["month"] < cut], feat[feat["month"] >= cut], n_test


def metrics(y, p) -> dict:
    y, p = np.asarray(y, float), np.asarray(p, float)
    return {"mae": float(np.mean(np.abs(y - p))), "rmse": float(np.sqrt(np.mean((y - p) ** 2))), "n": int(len(y))}


def seasonal_naive(test: pd.DataFrame) -> np.ndarray:
    return test["cases_lag12"].to_numpy()  # same month last year


def status_from(model_m: dict, base_m: dict, n_test_months: int) -> str:
    """'validated' only if the model beats the baseline on a holdout with enough months. Otherwise 'not_validated'."""
    return "validated" if n_test_months >= 12 and model_m["mae"] < base_m["mae"] else "not_validated"
