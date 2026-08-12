"""
compare_ml_models.py
====================
Compare plusieurs modeles ML avec la meme cible, les memes features et le
meme split temporel que le pipeline de production.

Objectif :
  - rendre le choix du modele final defensable dans le rapport PFE
  - produire DATA/ml_output/model_comparison.csv

Usage : python compare_ml_models.py
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import os
import warnings
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from urllib.parse import quote_plus

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    roc_auc_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    f1_score,
    accuracy_score,
)

warnings.filterwarnings("ignore")

_env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=_env_path)

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_DW = os.getenv("DB_DW_NAME", "eleonetech_dw")

OUTPUT_DIR = Path(__file__).parent / "ml_output"
OUTPUT_DIR.mkdir(exist_ok=True)
COMPARISON_PATH = OUTPUT_DIR / "model_comparison.csv"

FEATURE_COLS = [
    "nb_cura_lag1", "nb_cura_lag2", "nb_cura_lag3",
    "nb_prev_lag1", "nb_prev_lag2", "nb_prev_lag3",
    "duree_cura_lag1", "duree_cura_lag2", "duree_cura_lag3",
    "nb_cura_roll3", "nb_prev_roll3", "duree_cura_roll3",
    "mois_depuis_cura", "mois_depuis_prev", "ratio_cura_3m",
    "nb_ot_total", "nb_curatif", "nb_preventif",
    "duree_cura_h", "duree_prev_h", "annee", "mois_num",
    "mtbf_h_lag1", "mtbf_h_roll3",
    "disponibilite_pct_lag1", "disponibilite_pct_roll3",
    "nb_arrets_lag1", "nb_arrets_roll3",
    "t_arret_lag1", "t_arret_roll3",
]


def get_engine():
    pwd = quote_plus(DB_PASSWORD)
    url = f"postgresql+psycopg2://{DB_USER}:{pwd}@{DB_HOST}:{DB_PORT}/{DB_DW}"
    return create_engine(url, pool_pre_ping=True)


def dw_query(engine, sql):
    with engine.connect() as c:
        return pd.read_sql(text(sql), c)


def rolling_features(g):
    g = g.sort_values("annee_mois").copy().reset_index(drop=True)
    for lag in [1, 2, 3]:
        g[f"nb_cura_lag{lag}"] = g["nb_curatif"].shift(lag)
        g[f"nb_prev_lag{lag}"] = g["nb_preventif"].shift(lag)
        g[f"duree_cura_lag{lag}"] = g["duree_cura_h"].shift(lag)

    g["nb_cura_roll3"] = g["nb_curatif"].shift(1).rolling(3, min_periods=1).sum()
    g["nb_prev_roll3"] = g["nb_preventif"].shift(1).rolling(3, min_periods=1).sum()
    g["duree_cura_roll3"] = g["duree_cura_h"].shift(1).rolling(3, min_periods=1).mean()

    for col in ["mtbf_h", "disponibilite_pct", "nb_arrets", "t_arret"]:
        if col in g.columns:
            g[f"{col}_lag1"] = g[col].shift(1)
            g[f"{col}_roll3"] = g[col].shift(1).rolling(3, min_periods=1).mean()

    cura_idx = g.index[g["nb_curatif"] > 0].tolist()
    prev_idx = g.index[g["nb_preventif"] > 0].tolist()

    def months_since(idx, idx_list):
        past = [m for m in idx_list if m < idx]
        return (idx - past[-1]) if past else np.nan

    g["mois_depuis_cura"] = [months_since(i, cura_idx) for i in range(len(g))]
    g["mois_depuis_prev"] = [months_since(i, prev_idx) for i in range(len(g))]
    g["ratio_cura_3m"] = g["nb_cura_roll3"] / (g["nb_cura_roll3"] + g["nb_prev_roll3"] + 1e-9)
    return g


def build_dataset(engine):
    df_raw = dw_query(engine, """
        SELECT fi.equip_id,
               t.annee_mois,
               t.annee,
               t.mois_num,
               fi.type_intervention,
               COALESCE(fi.duree_intervention_h, 0) AS duree_h
        FROM fact_intervention fi
        JOIN dim_temps t ON t.temps_id = fi.temps_id
        WHERE fi.equip_id IS NOT NULL
          AND t.annee_mois IS NOT NULL
    """)

    try:
        df_arret = dw_query(engine, """
            SELECT fa.equip_id,
                   t.annee_mois,
                   AVG(fa.mtbf_h) AS mtbf_h,
                   AVG(fa.disponibilite_pct) AS disponibilite_pct,
                   SUM(fa.nb_arrets) AS nb_arrets,
                   SUM(fa.t_arret) AS t_arret
            FROM fact_arret fa
            JOIN dim_temps t ON t.temps_id = fa.temps_id
            WHERE fa.equip_id IS NOT NULL
              AND t.annee_mois IS NOT NULL
            GROUP BY fa.equip_id, t.annee_mois
        """)
    except Exception:
        df_arret = pd.DataFrame()

    monthly = df_raw.groupby(["equip_id", "annee_mois", "annee", "mois_num"]).agg(
        nb_ot_total=("type_intervention", "count"),
        nb_curatif=("type_intervention", lambda x: (x == "CURA").sum()),
        nb_preventif=("type_intervention", lambda x: (x == "PREV").sum()),
        duree_cura_h=("duree_h", lambda x: x[df_raw.loc[x.index, "type_intervention"] == "CURA"].sum()),
        duree_prev_h=("duree_h", lambda x: x[df_raw.loc[x.index, "type_intervention"] == "PREV"].sum()),
    ).reset_index()

    monthly["annee_mois"] = pd.to_datetime(monthly["annee_mois"] + "-01")
    monthly = monthly.sort_values(["equip_id", "annee_mois"]).reset_index(drop=True)

    if not df_arret.empty:
        df_arret["annee_mois"] = pd.to_datetime(df_arret["annee_mois"] + "-01")
        monthly = monthly.merge(df_arret, on=["equip_id", "annee_mois"], how="left")

    featured = monthly.groupby("equip_id", group_keys=False).apply(rolling_features)
    featured = featured.sort_values(["equip_id", "annee_mois"])

    next_cura = featured.groupby("equip_id")["nb_curatif"].shift(-1).fillna(0)
    equip_median = featured.groupby("equip_id")["nb_curatif"].transform("median")
    featured["curatif_mois_suivant"] = (next_cura > equip_median).astype(int)

    last_month = featured.groupby("equip_id")["annee_mois"].transform("max")
    featured = featured[featured["annee_mois"] < last_month].copy()

    base_lag_cols = [
        "nb_cura_lag1", "nb_prev_lag1", "duree_cura_lag1",
        "nb_cura_roll3", "nb_prev_roll3", "duree_cura_roll3",
    ]
    featured = featured.dropna(subset=[c for c in base_lag_cols if c in featured.columns])

    feat_cols = [c for c in FEATURE_COLS if c in featured.columns]
    featured[feat_cols] = featured[feat_cols].fillna(0)
    return featured, feat_cols


def optional_xgboost_model(y_train):
    try:
        from xgboost import XGBClassifier
    except Exception:
        return None

    pos = int(np.sum(y_train == 1))
    neg = int(np.sum(y_train == 0))
    scale_pos_weight = neg / max(pos, 1)

    return XGBClassifier(
        n_estimators=200,
        max_depth=5,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="logloss",
        scale_pos_weight=scale_pos_weight,
        random_state=42,
        n_jobs=-1,
    )


def build_models(y_train):
    models = {
        "Logistic Regression": Pipeline([
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)),
        ]),
        "Random Forest": RandomForestClassifier(
            n_estimators=200,
            max_depth=8,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        ),
        "Gradient Boosting + Calibration": CalibratedClassifierCV(
            GradientBoostingClassifier(
                n_estimators=300,
                max_depth=4,
                learning_rate=0.05,
                subsample=0.8,
                min_samples_leaf=10,
                random_state=42,
            ),
            method="isotonic",
            cv=3,
        ),
    }

    xgb = optional_xgboost_model(y_train)
    if xgb is not None:
        models["XGBoost"] = xgb
    return models


def best_f1_threshold(y_true, y_proba):
    precision, recall, thresholds = precision_recall_curve(y_true, y_proba)
    if len(thresholds) == 0:
        return 0.5
    f1_scores = 2 * precision * recall / (precision + recall + 1e-9)
    return float(thresholds[np.argmax(f1_scores[:-1])])


def evaluate_model(name, model, X_train, X_test, y_train, y_test):
    model.fit(X_train, y_train)
    y_proba = model.predict_proba(X_test)[:, 1]
    threshold = best_f1_threshold(y_test, y_proba)
    y_pred = (y_proba >= threshold).astype(int)

    auc = roc_auc_score(y_test, y_proba) if len(np.unique(y_test)) > 1 else 0.5
    return {
        "model": name,
        "auc": round(float(auc), 4),
        "threshold_f1": round(float(threshold), 3),
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
    }


def main():
    # CRISP-DM — Business Understanding : benchmark des classifieurs de risque.
    print("=" * 72)
    print("  COMPARAISON MODELES ML - RISQUE DE PANNE PAR EQUIPEMENT")
    print("  CRISP-DM : Data Understanding > Preparation > Modeling > Evaluation")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 72)

    engine = get_engine()
    with engine.connect() as c:
        c.execute(text("SELECT 1"))
    print(f"  Connexion {DB_DW} OK")

    # CRISP-DM — Data Understanding / Data Preparation
    featured, feat_cols = build_dataset(engine)
    # CRISP-DM — split global chronologique, jamais aléatoire.
    featured = featured.sort_values(["annee_mois", "equip_id"]).reset_index(drop=True)
    X = featured[feat_cols].values
    y = featured["curatif_mois_suivant"].values

    split_idx = int(len(featured) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    pos = int(y.sum())
    neg = int(len(y) - pos)
    print(f"  Dataset : {len(featured):,} observations | {len(feat_cols)} features")
    print(f"  Cible   : curatifs mois suivant > mediane historique")
    print(f"  Classes : 1={pos} ({pos / len(y) * 100:.1f}%) | 0={neg}")
    print(f"  Split   : train={len(y_train):,} | test={len(y_test):,}")

    # CRISP-DM — Modeling / Evaluation
    rows = []
    models = build_models(y_train)
    if "XGBoost" not in models:
        rows.append({
            "model": "XGBoost",
            "auc": np.nan,
            "threshold_f1": np.nan,
            "accuracy": np.nan,
            "precision": np.nan,
            "recall": np.nan,
            "f1": np.nan,
            "status": "non_installe",
        })

    for name, model in models.items():
        print(f"\n  Entrainement : {name}")
        try:
            row = evaluate_model(name, model, X_train, X_test, y_train, y_test)
            row["status"] = "ok"
            rows.append(row)
            print(
                f"    AUC={row['auc']:.4f} | F1={row['f1']:.4f} | "
                f"Precision={row['precision']:.4f} | Recall={row['recall']:.4f}"
            )
        except Exception as e:
            rows.append({
                "model": name,
                "auc": np.nan,
                "threshold_f1": np.nan,
                "accuracy": np.nan,
                "precision": np.nan,
                "recall": np.nan,
                "f1": np.nan,
                "status": f"erreur: {e}",
            })
            print(f"    ERREUR : {e}")

    results = pd.DataFrame(rows)
    results["n_train"] = len(y_train)
    results["n_test"] = len(y_test)
    results["n_features"] = len(feat_cols)
    results["target"] = "curatifs mois suivant > mediane historique"
    results["generated_at"] = datetime.now().isoformat()

    sort_cols = ["status", "auc", "f1"]
    results = results.sort_values(sort_cols, ascending=[True, False, False])
    # CRISP-DM — Deployment : artefact de benchmark du seul modèle de risque.
    results.to_csv(COMPARISON_PATH, index=False, encoding="utf-8-sig")

    print("\n" + results[["model", "auc", "precision", "recall", "f1", "threshold_f1", "status"]].to_string(index=False))
    print(f"\n  Comparaison sauvegardee : {COMPARISON_PATH}")
    print("=" * 72)


if __name__ == "__main__":
    main()
