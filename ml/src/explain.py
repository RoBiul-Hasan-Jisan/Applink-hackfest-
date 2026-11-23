"""SHAP when installed and valid for the model; otherwise permutation importance (labelled as such)."""
from __future__ import annotations
import numpy as np
from feature_engineering import FEATURES, LABELS


def importances(model, X, y) -> dict:
    try:
        import shap  # type: ignore
        sv = np.abs(shap.TreeExplainer(model).shap_values(X)).mean(axis=0)
        method = "shap_mean_abs"
    except Exception:
        from sklearn.inspection import permutation_importance
        sv = permutation_importance(model, X, y, n_repeats=10, random_state=0).importances_mean.clip(min=0)
        method = "permutation_importance"
    tot = float(sv.sum()) or 1.0
    top = sorted(zip(FEATURES, sv), key=lambda t: -t[1])[:3]
    return {"method": method, "top": [{"name": LABELS[f], "contribution": round(float(v) / tot, 3)} for f, v in top]}
