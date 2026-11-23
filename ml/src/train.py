"""usage: python src/train.py --dengue data/dengue_monthly.csv --weather data/weather_monthly.csv [--level district]
Writes outputs/evaluation.json. With insufficient real data it writes status INSUFFICIENT_EVIDENCE and trains nothing."""
from __future__ import annotations
import argparse, json, os, sys
import joblib
from feature_engineering import FEATURES, make_features
from preprocessing import load_and_merge
from evaluate import gate, time_split, metrics, seasonal_naive, status_from
from explain import importances


def make_model():
    try:
        from xgboost import XGBRegressor  # type: ignore
        return XGBRegressor(n_estimators=300, max_depth=3, learning_rate=0.05, subsample=0.8, random_state=0), "xgboost"
    except Exception:
        from sklearn.ensemble import HistGradientBoostingRegressor
        return HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05, max_iter=300, random_state=0), "sklearn-HistGradientBoosting"


def run(dengue: str, weather: str, out: str, level: str = "district") -> dict:
    os.makedirs(out, exist_ok=True)
    df, audit = load_and_merge(dengue, weather)
    feat = make_features(df)
    reasons = gate(feat)
    ev: dict = {"level": level, "audit": audit, "release_gate_reasons": reasons}
    if reasons:
        ev.update(status="INSUFFICIENT_EVIDENCE", note="Too little independently usable history to estimate model performance. No model trained, no risk exported.")
    else:
        train, test, n_test = time_split(feat)
        model, lib = make_model()
        model.fit(train[FEATURES], train["cases"])
        mm, bm = metrics(test["cases"], model.predict(test[FEATURES])), metrics(test["cases"], seasonal_naive(test))
        model.fit(feat[FEATURES], feat["cases"])  # refit on all history for the forward estimate only AFTER evaluation
        joblib.dump(model, os.path.join(out, "model.joblib"))
        ev.update(status=status_from(mm, bm, n_test), library=lib, model_version=f"DengueZero-Risk-{lib}-v1", model=mm, seasonal_naive_baseline=bm, test_months=n_test,
                  train_rows=int(len(train)), test_rows=int(len(test)), explanation=importances(model, test[FEATURES], test["cases"]),
                  caveats=["Single chronological holdout; no claim beyond the geographic level of the training data.", f"Geographic level of inputs: {level}. Never read as ward-level."])
    with open(os.path.join(out, "evaluation.json"), "w") as f:
        json.dump(ev, f, indent=2, default=str)
    return ev


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--dengue", required=True); ap.add_argument("--weather", required=True)
    ap.add_argument("--out", default="outputs"); ap.add_argument("--level", default="district"); a = ap.parse_args()
    ev = run(a.dengue, a.weather, a.out, a.level); print(json.dumps({k: ev[k] for k in ("status", "release_gate_reasons") if k in ev}, indent=2))
    sys.exit(0)
