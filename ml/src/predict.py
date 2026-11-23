"""Export next-month estimates for the backend (backend/scripts/importRisk.ts). REFUSES to export when evidence is insufficient."""
from __future__ import annotations
import argparse, json, os, sys
import joblib, numpy as np, pandas as pd
from feature_engineering import FEATURES
from preprocessing import load_and_merge

LEVELS = [(25, "LOW"), (50, "MEDIUM"), (75, "HIGH"), (101, "VERY_HIGH")]


def level(score: float) -> str:
    return next(n for t, n in LEVELS if score < t)


def export(dengue: str, weather: str, out: str, level_name: str) -> list[dict]:
    ev = json.load(open(os.path.join(out, "evaluation.json")))
    if ev["status"] == "INSUFFICIENT_EVIDENCE":
        raise SystemExit("Refusing to export: evaluation status is INSUFFICIENT_EVIDENCE. No risk estimate will be fabricated.")
    model = joblib.load(os.path.join(out, "model.joblib"))
    df, audit = load_and_merge(dengue, weather)
    rows = []
    next_month = df["month"].max() + 1
    for area, g in df.groupby("area"):
        g = g.sort_values("month").set_index("month")
        c, r, t, h = g["cases"], g["rain_mm"], g["temp_c"], g["humidity_pct"]
        if len(g) < 13: continue
        x = pd.DataFrame([{"cases_lag1": c.iloc[-1], "cases_lag2": c.iloc[-2], "cases_lag3": c.iloc[-3], "cases_lag12": c.iloc[-12], "rain_lag1": r.iloc[-1], "rain_lag2": r.iloc[-2], "rain_lag3": r.iloc[-3],
                           "temp_lag1": t.iloc[-1], "hum_lag1": h.iloc[-1], "month_sin": np.sin(2 * np.pi * next_month.month / 12), "month_cos": np.cos(2 * np.pi * next_month.month / 12)}])[FEATURES]
        if x.isna().any(axis=None): continue  # missing stays missing: no estimate for this area
        pred = float(model.predict(x)[0])
        score = float((c < pred).mean() * 100)  # percentile of the forecast within this area's OWN history, not a probability
        rows.append({"areaName": area, "geographicLevel": level_name, "date": next_month.to_timestamp().strftime("%Y-%m-%d"), "score": round(score, 1), "level": level(score),
                     "topFactors": ev["explanation"]["top"], "modelVersion": ev["model_version"], "evaluationStatus": ev["status"],
                     "dataCoverage": f"{audit['first_month']}..{audit['last_month']}, {len(audit['areas'])} area(s), {level_name}-level source data; score = percentile of forecast cases vs this area's history (an estimate, not a probability)"})
    json.dump(rows, open(os.path.join(out, "risk_predictions.json"), "w"), indent=2)
    return rows


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--dengue", required=True); ap.add_argument("--weather", required=True)
    ap.add_argument("--out", default="outputs"); ap.add_argument("--level", default="district"); a = ap.parse_args()
    print(f"exported {len(export(a.dengue, a.weather, a.out, a.level))} estimate(s)"); sys.exit(0)
