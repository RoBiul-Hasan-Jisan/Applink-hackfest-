# ML (optional, release-gated)
```
pip install -r requirements.txt
python src/train.py   --dengue data/dengue_monthly.csv --weather data/weather_monthly.csv --level district
python src/predict.py --dengue data/dengue_monthly.csv --weather data/weather_monthly.csv --level district
cd ../backend && node scripts/importRisk.ts          # imports outputs/risk_predictions.json
pytest tests
```
The pipeline is **independent of the backend** and **never fabricates**: with too little real history it writes `outputs/evaluation.json` with `INSUFFICIENT_EVIDENCE` and `predict.py` refuses to export.
Only estimates whose status is `validated` (beat the seasonal-naive baseline on a chronological holdout of >= 12 months) influence report priority; everything else is displayed for context only.
Risk scores are *percentiles of the forecast within an area's own history*, not probabilities, and carry the geographic level of the source data.
