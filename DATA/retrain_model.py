import io
import json
import os
import pickle
import sys
import warnings
from datetime import datetime
from pathlib import Path
from urllib.parse import quote_plus

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import roc_auc_score, precision_recall_curve, accuracy_score, precision_score, recall_score, f1_score

# Fix encoding for both script and notebook environments
if hasattr(sys.stdout, 'buffer'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
warnings.filterwarnings("ignore")

load_dotenv(Path(__file__).parent.parent / "backend" / ".env")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_DW = os.getenv("DB_DW_NAME", "eleonetech_dw")

OUTPUT_DIR = Path(__file__).parent / "ml_output"
OUTPUT_DIR.mkdir(exist_ok=True)
MODEL_PATH = OUTPUT_DIR / "best_model.pkl"
PREDS_PATH = OUTPUT_DIR / "predictions_risque.csv"
META_PATH = OUTPUT_DIR / "model_meta.json"

FEATURE_COLS = [
    # Features curatives (8)
    "nb_cura_roll3", "duree_cura_h", "nb_curatif", "duree_cura_roll3",
    "nb_cura_lag1", "duree_cura_lag1", "nb_cura_lag2", "nb_cura_lag3",
    # Features préventives (4)
    "nb_prev_lag1", "duree_prev_h", "nb_prev_roll3", "nb_preventif",
    # Features de fiabilité (3)
    "disponibilite_pct_roll3", "mtbf_h_roll3", "disponibilite_pct_lag1",
    # Features temporelles et de ratio (6)
    "mois_num", "ratio_cura_3m", "mois_depuis_cura", "mois_depuis_prev",
    "annee", "nb_ot_total",
]


# CRISP-DM — Data Understanding
def get_engine():
    """Crée la connexion au Data Warehouse."""
    password = quote_plus(DB_PASSWORD)
    return create_engine(
        f"postgresql+psycopg2://{DB_USER}:{password}@{DB_HOST}:{DB_PORT}/{DB_DW}",
        pool_pre_ping=True,
    )


def dw_query(engine, sql):
    """Exécute une requête DW et retourne un DataFrame."""
    with engine.connect() as connection:
        return pd.read_sql(text(sql), connection)


# CRISP-DM — Data Preparation
def rolling_features(group):
    """Construit les variables historiques sans regarder le mois courant futur."""
    group = group.sort_values("annee_mois").copy().reset_index(drop=True)
    for lag in (1, 2, 3):
        group[f"nb_cura_lag{lag}"] = group["nb_curatif"].shift(lag)
        group[f"nb_prev_lag{lag}"] = group["nb_preventif"].shift(lag)
        group[f"duree_cura_lag{lag}"] = group["duree_cura_h"].shift(lag)

    group["nb_cura_roll3"] = group["nb_curatif"].shift(1).rolling(3, min_periods=1).sum()
    group["nb_prev_roll3"] = group["nb_preventif"].shift(1).rolling(3, min_periods=1).sum()
    group["duree_cura_roll3"] = group["duree_cura_h"].shift(1).rolling(3, min_periods=1).mean()
    for column in ("mtbf_h", "disponibilite_pct", "nb_arrets", "t_arret"):
        if column in group:
            group[f"{column}_lag1"] = group[column].shift(1)
            group[f"{column}_roll3"] = group[column].shift(1).rolling(3, min_periods=1).mean()

    for event, output in (("nb_curatif", "mois_depuis_cura"), ("nb_preventif", "mois_depuis_prev")):
        event_positions = group.index[group[event] > 0].tolist()
        group[output] = [
            position - previous[-1] if (previous := [i for i in event_positions if i < position]) else np.nan
            for position in range(len(group))
        ]
    group["ratio_cura_3m"] = group["nb_cura_roll3"] / (
        group["nb_cura_roll3"] + group["nb_prev_roll3"] + 1e-9
    )
    return group


def build_dataset(engine):
    """Extrait, agrège et prépare le jeu de données de risque."""
    interventions = dw_query(engine, """
        SELECT fi.equip_id, t.annee_mois, t.annee, t.mois_num,
               fi.type_intervention, COALESCE(fi.duree_intervention_h, 0) AS duree_h
        FROM fact_intervention fi
        JOIN dim_temps t ON t.temps_id = fi.temps_id
        WHERE fi.equip_id IS NOT NULL AND t.annee_mois IS NOT NULL
    """)
    monthly = interventions.groupby(["equip_id", "annee_mois", "annee", "mois_num"]).agg(
        nb_ot_total=("type_intervention", "count"),
        nb_curatif=("type_intervention", lambda values: (values == "CURA").sum()),
        nb_preventif=("type_intervention", lambda values: (values == "PREV").sum()),
        duree_cura_h=("duree_h", lambda values: values[interventions.loc[values.index, "type_intervention"].eq("CURA")].sum()),
        duree_prev_h=("duree_h", lambda values: values[interventions.loc[values.index, "type_intervention"].eq("PREV")].sum()),
    ).reset_index()
    monthly["annee_mois"] = pd.to_datetime(monthly["annee_mois"] + "-01")

    try:
        stops = dw_query(engine, """
            SELECT fa.equip_id, t.annee_mois, AVG(fa.mtbf_h) AS mtbf_h,
                   AVG(fa.disponibilite_pct) AS disponibilite_pct,
                   SUM(fa.nb_arrets) AS nb_arrets, SUM(fa.t_arret) AS t_arret
            FROM fact_arret fa JOIN dim_temps t ON t.temps_id = fa.temps_id
            WHERE fa.equip_id IS NOT NULL AND t.annee_mois IS NOT NULL
            GROUP BY fa.equip_id, t.annee_mois
        """)
        stops["annee_mois"] = pd.to_datetime(stops["annee_mois"] + "-01")
        monthly = monthly.merge(stops, on=["equip_id", "annee_mois"], how="left")
    except Exception as error:
        print(f"  Avertissement : métriques fact_arret indisponibles ({error}).")

    featured_all = monthly.groupby("equip_id", group_keys=False).apply(rolling_features)
    featured_all = featured_all.sort_values(["equip_id", "annee_mois"]).copy()
    next_curative = featured_all.groupby("equip_id")["nb_curatif"].shift(-1)
    historical_median = featured_all.groupby("equip_id")["nb_curatif"].transform("median")
    featured_all["curatif_mois_suivant"] = (next_curative > historical_median).astype(int)

    last_month = featured_all.groupby("equip_id")["annee_mois"].transform("max")
    training = featured_all[featured_all["annee_mois"] < last_month].copy()
    required_history = ["nb_cura_lag1", "nb_prev_lag1", "duree_cura_lag1", "nb_cura_roll3", "nb_prev_roll3", "duree_cura_roll3"]
    training = training.dropna(subset=required_history)
    available = [column for column in FEATURE_COLS if column in training.columns]
    training[available] = training[available].fillna(0)

    scoring = featured_all.dropna(subset=required_history).copy()
    scoring[available] = scoring[available].fillna(0)
    return interventions, training, scoring, available


def best_f1_threshold(y_true, probabilities):
    """Calcule le seuil décisionnel qui maximise F1 sur le jeu de test."""
    precision, recall, thresholds = precision_recall_curve(y_true, probabilities)
    if not len(thresholds):
        return 0.5
    scores = 2 * precision[:-1] * recall[:-1] / (precision[:-1] + recall[:-1] + 1e-9)
    return float(thresholds[int(np.argmax(scores))])


def load_champion():
    """Charge le champion existant, si son format est valide."""
    if not MODEL_PATH.exists():
        return None
    try:
        with MODEL_PATH.open("rb") as stream:
            saved = pickle.load(stream)
        return saved if isinstance(saved, dict) and "model" in saved else None
    except Exception as error:
        print(f"  Avertissement : champion illisible ({error}).")
        return None


def build_models(y_train):
    """Construit plusieurs modèles pour le benchmark."""
    calibration_cv = min(3, int(np.bincount(y_train.astype(int), minlength=2).min()))
    models = {
        "Logistic Regression": Pipeline([
            ("scaler", StandardScaler()),
            ("model", LogisticRegression(class_weight="balanced", max_iter=1000, random_state=42)),
        ]),
        "Random Forest": RandomForestClassifier(
            n_estimators=100,
            max_depth=6,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1,
        ),
        "Gradient Boosting + Calibration": CalibratedClassifierCV(
            GradientBoostingClassifier(
                n_estimators=100,
                max_depth=3,
                learning_rate=0.1,
                subsample=0.8,
                min_samples_leaf=20,
                random_state=42,
            ),
            method="isotonic",
            cv=calibration_cv,
        ),
    }
    return models


def evaluate_model(name, model, X_train, X_test, y_train, y_test):
    """Évalue un modèle et retourne les métriques."""
    model.fit(X_train, y_train)
    y_proba = model.predict_proba(X_test)[:, 1]
    threshold = best_f1_threshold(y_test, y_proba)
    y_pred = (y_proba >= threshold).astype(int)

    auc = roc_auc_score(y_test, y_proba) if len(np.unique(y_test)) > 1 else 0.5
    return {
        "model": name,
        "model_obj": model,
        "auc": round(float(auc), 4),
        "threshold_f1": round(float(threshold), 3),
        "accuracy": round(float(accuracy_score(y_test, y_pred)), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
    }


# CRISP-DM — Modeling, Evaluation et Deployment
def main():
    """Exécute le pipeline CRISP-DM du risque de panne."""
    print("=" * 72)
    print("RÉENTRAÎNEMENT — RISQUE DE PANNE PAR ÉQUIPEMENT")
    print("CRISP-DM : Business Understanding > Data Understanding > Data Preparation")
    print("           Modeling > Evaluation > Deployment")
    print("Cible : curatifs du mois suivant > médiane historique de l'équipement")
    print("=" * 72)

    # CRISP-DM — Business Understanding : anticiper un mois curatif anormal.
    engine = get_engine()
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception as error:
        print(f"Connexion DW impossible : {error}")
        return

    # CRISP-DM — Data Understanding / Data Preparation
    print("\n[1/4] Extraction et préparation des données...")
    interventions, training, scoring, features = build_dataset(engine)
    if training.empty or not features:
        print("Données insuffisantes pour entraîner le modèle de risque.")
        return
    positives = int(training["curatif_mois_suivant"].sum())
    print(f"  Équipements : {interventions.equip_id.nunique()} | interventions : {len(interventions):,}")
    print(f"  Observations entraînement : {len(training):,} | features : {len(features)}")
    print(f"  Classes : risque cible=1 : {positives} ({positives / len(training) * 100:.1f} %) | cible=0 : {len(training) - positives}")

    # CRISP-DM — Modeling : split strictement temporel 80/20.
    chronological = training.sort_values(["annee_mois", "equip_id"]).reset_index(drop=True)
    split_index = int(len(chronological) * 0.8)
    train, test = chronological.iloc[:split_index], chronological.iloc[split_index:]
    X_train, y_train = train[features].values, train["curatif_mois_suivant"].values
    X_test, y_test = test[features].values, test["curatif_mois_suivant"].values
    class_counts = np.bincount(y_train.astype(int), minlength=2)
    calibration_cv = min(3, int(class_counts.min()))
    if calibration_cv < 2 or len(np.unique(y_test)) < 2:
        print("Données temporelles insuffisantes pour calibrer/évaluer le modèle.")
        return

    print(f"\n[2/4] Modeling — split temporel : train={len(train):,}, test={len(test):,}")
    
    # Benchmark de plusieurs modèles
    models = build_models(y_train)
    results = []
    print("  Benchmark des modèles en cours...")
    for name, model in models.items():
        result = evaluate_model(name, model, X_train, X_test, y_train, y_test)
        results.append(result)
        print(f"    {name}: AUC={result['auc']:.4f} | F1={result['f1']:.4f} | Precision={result['precision']:.4f} | Recall={result['recall']:.4f}")
    
    # Sélection du meilleur modèle par AUC
    best_result = max(results, key=lambda x: x["auc"])
    candidate = best_result["model_obj"]
    candidate_auc = best_result["auc"]
    candidate_threshold = best_result["threshold_f1"]
    candidate_name = best_result["model"]
    
    # Calculer train_auc pour le meilleur modèle
    train_proba = candidate.predict_proba(X_train)[:, 1]
    train_auc = float(roc_auc_score(y_train, train_proba))
    
    print(f"\n[3/4] Evaluation — Meilleur modèle: {candidate_name} (AUC train={train_auc:.4f} | AUC test={candidate_auc:.4f})")

    champion = load_champion()
    champion_auc = float(champion.get("auc", 0.0)) if champion else 0.0
    accepted = champion is None or candidate_auc >= champion_auc - 0.005
    if accepted:
        active = {
            "model": candidate, "features": features, "threshold": candidate_threshold,
            "model_name": candidate_name,
            "auc": candidate_auc, "train_auc": train_auc, "n_train": len(train), "n_test": len(test),
            "trained_at": datetime.now().isoformat(),
        }
        with MODEL_PATH.open("wb") as stream:
            pickle.dump(active, stream)
        decision = "challenger accepté"
    else:
        active = champion
        decision = "champion conservé"
    print(f"  Champion/challenger : AUC champion={champion_auc:.4f} | {decision} (tolérance 0.005)")

    # CRISP-DM — Deployment : score du dernier mois disponible par équipement.
    print("\n[4/4] Deployment — génération des prédictions de risque...")
    active_features = active["features"]
    if any(column not in scoring.columns for column in active_features):
        print("Le champion historique est incompatible avec les données actuelles.")
        return
    latest = scoring.sort_values(["annee_mois", "equip_id"]).groupby("equip_id").tail(1).copy()
    latest["proba_panne"] = active["model"].predict_proba(latest[active_features].values)[:, 1]
    p66, p85 = latest["proba_panne"].quantile([0.66, 0.85])
    latest["risque"] = pd.cut(
        latest["proba_panne"], bins=[-0.001, p66, max(p85, p66 + 1e-9), 1.001],
        labels=["Faible", "Modéré", "Élevé"], include_lowest=True,
    )
    equipment = dw_query(engine, "SELECT equip_id, code_equipement, libelle FROM dim_equipement")
    predictions = latest.merge(equipment, on="equip_id", how="left")[[
        "code_equipement", "libelle", "annee_mois", "proba_panne", "risque",
        "nb_cura_roll3", "nb_prev_roll3", "mois_depuis_cura", "mois_depuis_prev",
    ]].sort_values("proba_panne", ascending=False)
    predictions["annee_mois"] = predictions["annee_mois"].astype(str)
    predictions.to_csv(PREDS_PATH, index=False, encoding="utf-8-sig")

    stats = {key: int((predictions["risque"] == label).sum()) for key, label in {
        "eleve": "Élevé", "modere": "Modéré", "faible": "Faible",
    }.items()}
    meta = {
        "model_name": active["model_name"], "version": "risk-only-1.0",
        "auc": round(float(active["auc"]), 4), "train_auc": round(float(active.get("train_auc", 0)), 4),
        "threshold": round(float(active["threshold"]), 3), "n_features": len(active_features),
        "features": active_features, "n_train": int(active.get("n_train", len(train))),
        "n_test": int(active.get("n_test", len(test))),
        "trained_at": active.get("trained_at", "inconnu"),
        "scored_at": datetime.now().isoformat(),
        "target": "nombre de curatifs du mois suivant > médiane historique de l’équipement",
        "risk_percentiles": {"modere": 66, "eleve": 85}, "stats": stats,
    }
    with META_PATH.open("w", encoding="utf-8") as stream:
        json.dump(meta, stream, ensure_ascii=False, indent=2)
    print(f"  Prédictions : {len(predictions)} équipements → {PREDS_PATH.name}")
    print(f"  Distribution : Élevé={stats['eleve']} | Modéré={stats['modere']} | Faible={stats['faible']}")
    print(f"  Sorties : {MODEL_PATH.name}, {PREDS_PATH.name}, {META_PATH.name}")


if __name__ == "__main__":
    main()
