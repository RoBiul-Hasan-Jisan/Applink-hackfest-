"""TEST FIXTURES ONLY. The generated frames below are synthetic and exist solely to exercise code paths.
They are never written to data/ or outputs/ of the product and must never be presented as real."""
import os, sys, json, numpy as np, pandas as pd, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from feature_engineering import make_features, FEATURES
from evaluate import gate, time_split, status_from
import train, predict


def fixture_frames(months: int, seed=0):
    rng = np.random.default_rng(seed); idx = pd.period_range("2015-01", periods=months, freq="M")
    cases = [max(0, int(50 + 40 * np.sin(2 * np.pi * p.month / 12) + rng.normal(0, 5))) for p in idx]
    d = pd.DataFrame({"area": "TEST-AREA", "month": idx.astype(str), "cases": cases, "source": "TEST FIXTURE", "retrieved_at": "n/a"})
    w = pd.DataFrame({"area": "TEST-AREA", "month": idx.astype(str), "rain_mm": rng.uniform(0, 400, months), "temp_c": rng.uniform(18, 33, months), "humidity_pct": rng.uniform(60, 90, months), "source": "TEST FIXTURE"})
    return d, w


def write(tmp, months):
    d, w = fixture_frames(months); dp, wp = tmp / "d.csv", tmp / "w.csv"; d.to_csv(dp, index=False); w.to_csv(wp, index=False); return str(dp), str(wp)


def test_features_never_use_the_current_or_future_month(tmp_path):
    d, w = fixture_frames(30); df = d.merge(w.drop(columns="source"), on=["area", "month"]); df["month"] = pd.PeriodIndex(df["month"], freq="M")
    f = make_features(df); row = f.iloc[5]; src = df.set_index("month")
    assert row["cases_lag1"] == src.loc[row["month"] - 1, "cases"] and row["rain_lag1"] == src.loc[row["month"] - 1, "rain_mm"] and row["cases_lag12"] == src.loc[row["month"] - 12, "cases"]
    assert row["month"] - 1 in src.index and "cases" not in FEATURES


def test_split_is_chronological(tmp_path):
    d, w = fixture_frames(60); df = d.merge(w.drop(columns="source"), on=["area", "month"]); df["month"] = pd.PeriodIndex(df["month"], freq="M")
    tr, te, n = time_split(make_features(df)); assert tr["month"].max() < te["month"].min() and n >= 6


def test_release_gate_blocks_tiny_data_and_export_refuses(tmp_path):
    dp, wp = write(tmp_path, 20); out = str(tmp_path / "o"); ev = train.run(dp, wp, out)
    assert ev["status"] == "INSUFFICIENT_EVIDENCE" and ev["release_gate_reasons"] and not os.path.exists(os.path.join(out, "model.joblib"))
    with pytest.raises(SystemExit): predict.export(dp, wp, out, "district")


def test_enough_data_trains_compares_with_baseline_and_exports_honest_fields(tmp_path):
    dp, wp = write(tmp_path, 120); out = str(tmp_path / "o"); ev = train.run(dp, wp, out)
    assert ev["status"] in ("validated", "not_validated") and ev["seasonal_naive_baseline"]["mae"] >= 0 and ev["model"]["rmse"] >= 0 and ev["explanation"]["method"] in ("shap_mean_abs", "permutation_importance")
    rows = predict.export(dp, wp, out, "district"); r = rows[0]
    assert {"modelVersion", "dataCoverage", "evaluationStatus", "score", "level", "topFactors", "geographicLevel", "date"} <= set(r) and 0 <= r["score"] <= 100 and "estimate" in r["dataCoverage"]


def test_status_requires_beating_the_baseline_with_enough_test_months():
    assert status_from({"mae": 1}, {"mae": 2}, 12) == "validated" and status_from({"mae": 1}, {"mae": 2}, 6) == "not_validated" and status_from({"mae": 3}, {"mae": 2}, 24) == "not_validated"
