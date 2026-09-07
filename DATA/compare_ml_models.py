import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

import os
import hashlib
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
from sklearn.base import clone
from sklearn.metrics import (
    roc_auc_score,
    precision_recall_curve,
    precision_score,
    recall_score,
    f1_score,
    accuracy_score,
    confusion_matrix,
)
from retrain_model import build_dataset as build_deployment_dataset

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns

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
    # Features curatives (7)
    "nb_cura_roll3", "duree_cura_h", "nb_curatif",
    "nb_cura_lag1", "duree_cura_lag1", "nb_cura_lag2", "nb_cura_lag3",
    # Features préventives (4)
    "nb_prev_lag1", "duree_prev_h", "nb_prev_roll3", "nb_preventif",
    # Features temporelles et de ratio (5)
    "mois_num", "ratio_cura_3m", "mois_depuis_cura", "mois_depuis_prev",
    "nb_ot_total",
]

# Benchmark utilise uniquement les features de production pour cohérence
# (compare_ml_models.py utilise maintenant build_deployment_dataset)


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


def build_dataset_legacy(engine):
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
    return featured.reset_index(drop=True), feat_cols


def build_dataset(engine):
    """Benchmark et production utilisent exactement la même préparation."""
    _, training, _, features = build_deployment_dataset(engine)
    return training.reset_index(drop=True), features


def data_fingerprint(featured, feat_cols):
    """Empreinte des donnees pour detecter les changements entre executions."""
    payload = featured[["equip_id", "annee_mois"] + feat_cols + ["curatif_mois_suivant"]]
    payload = payload.sort_values(["equip_id", "annee_mois"])
    raw = pd.util.hash_pandas_object(payload, index=False).values.tobytes()
    return hashlib.sha256(raw).hexdigest()[:16]


def select_features_by_importance(X_train, y_train, feat_cols, n_features=18):
    """Sélectionne les top N features basées sur l'importance Random Forest."""
    rf = RandomForestClassifier(
        n_estimators=100,
        max_depth=8,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    rf.fit(X_train, y_train)
    
    importance_dict = dict(zip(feat_cols, rf.feature_importances_))
    sorted_features = sorted(importance_dict.items(), key=lambda x: x[1], reverse=True)
    
    top_features = [feat for feat, imp in sorted_features[:n_features]]
    return top_features, importance_dict


def perform_eda(featured, feat_cols, output_dir):
    """EDA : corrélation avec target, détection features corrélées, boxplots."""
    X = featured[feat_cols]
    y = featured["curatif_mois_suivant"]
    
    # Matrice de corrélation avec target + heatmap
    corr_data = featured[feat_cols + ["curatif_mois_suivant"]]
    corr_matrix = corr_data.corr()
    plt.figure(figsize=(14, 12))
    sns.heatmap(corr_matrix, annot=False, cmap='coolwarm', center=0, 
                square=True, cbar_kws={'shrink': 0.8})
    plt.title('Matrice de corrélation (features + target)')
    plt.tight_layout()
    heatmap_path = output_dir / "correlation_heatmap.png"
    plt.savefig(heatmap_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    # Corrélation avec la cible
    target_corr = corr_matrix["curatif_mois_suivant"].abs().sort_values(ascending=False)
    print("\n  Corrélation avec la cible (top 10):")
    for feat, corr in target_corr.head(10).items():
        if feat != "curatif_mois_suivant":
            print(f"    {feat}: {corr:.4f}")
    
    # Détection features trop corrélées (|r| > 0.85)
    corr_abs = corr_matrix.abs()
    upper_tri = corr_abs.where(np.triu(np.ones(corr_abs.shape), k=1).astype(bool))
    to_drop = [col for col in upper_tri.columns if any(upper_tri[col] > 0.85)]
    feat_cols_clean = [col for col in feat_cols if col not in to_drop]
    
    # Boxplots des features principales (max 12 pour lisibilité)
    n_features = min(12, len(feat_cols))
    fig, axes = plt.subplots(3, 4, figsize=(16, 12))
    axes = axes.flatten()
    for i, col in enumerate(feat_cols[:n_features]):
        sns.boxplot(y=X[col], ax=axes[i])
        axes[i].set_title(col, fontsize=9)
        axes[i].tick_params(labelsize=8)
    for i in range(n_features, len(axes)):
        axes[i].set_visible(False)
    plt.suptitle('Boxplots des features principales', y=1.02)
    plt.tight_layout()
    boxplot_path = output_dir / "boxplots_features.png"
    plt.savefig(boxplot_path, dpi=150, bbox_inches='tight')
    plt.close()
    
    return feat_cols_clean, len(to_drop), target_corr


def build_models(y_train, feat_cols_clean):
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
    return models


def best_f1_threshold(y_true, y_proba):
    precision, recall, thresholds = precision_recall_curve(y_true, y_proba)
    if len(thresholds) == 0:
        return 0.5
    f1_scores = 2 * precision * recall / (precision + recall + 1e-9)
    return float(thresholds[np.argmax(f1_scores[:-1])])


def evaluate_model(name, model, X_train, X_test, y_train, y_test, feat_cols, output_dir=None):
    # Split train into fit + validation for threshold selection (80/20 of train)
    validation_idx = int(len(X_train) * 0.8)
    X_fit, y_fit = X_train[:validation_idx], y_train[:validation_idx]
    X_validation, y_validation = X_train[validation_idx:], y_train[validation_idx:]
    
    # Fit on full training data
    model.fit(X_train, y_train)
    
    # Calculate threshold on validation set, not test set
    threshold_model = clone(model)
    threshold_model.fit(X_fit, y_fit)
    y_proba_validation = threshold_model.predict_proba(X_validation)[:, 1]
    threshold = best_f1_threshold(y_validation, y_proba_validation)
    
    # Evaluate on test set with validation-derived threshold
    y_proba = model.predict_proba(X_test)[:, 1]
    y_pred = (y_proba >= threshold).astype(int)

    auc = roc_auc_score(y_test, y_proba) if len(np.unique(y_test)) > 1 else 0.5
    accuracy = accuracy_score(y_test, y_pred)
    
    # Calculate confusion matrix
    cm = confusion_matrix(y_test, y_pred)
    
    # Generate and save confusion matrix plot if output_dir is provided
    if output_dir is not None:
        plt.figure(figsize=(8, 6))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues', 
                    xticklabels=['Faible risque', 'Élevé risque'],
                    yticklabels=['Faible risque', 'Élevé risque'])
        plt.title(f'Matrice de Confusion - {name}')
        plt.ylabel('Vérité terrain')
        plt.xlabel('Prédiction')
        plt.tight_layout()
        cm_path = output_dir / f"confusion_matrix_{name.replace(' ', '_').lower()}.png"
        plt.savefig(cm_path, dpi=150, bbox_inches='tight')
        plt.close()
    
    # Extract feature importance for tree-based models
    feature_importance = None
    if hasattr(model, 'feature_importances_'):
        feature_importance = dict(zip(feat_cols, model.feature_importances_))
    elif hasattr(model, 'named_steps'):
        # For Pipeline models
        for step_name, step_obj in model.named_steps.items():
            if hasattr(step_obj, 'feature_importances_'):
                feature_importance = dict(zip(feat_cols, step_obj.feature_importances_))
                break
    elif hasattr(model, 'calibrated_classifiers_'):
        # For CalibratedClassifierCV - extract from base estimator.
        # sklearn renamed base_estimator -> estimator in 1.2 (removed in 1.4+),
        # so try both names for compatibility across versions.
        calibrated = model.calibrated_classifiers_[0]
        base_model = getattr(calibrated, 'estimator', None) or getattr(calibrated, 'base_estimator', None)
        if base_model is not None and hasattr(base_model, 'feature_importances_'):
            feature_importance = dict(zip(feat_cols, base_model.feature_importances_))
    
    return {
        "model": name,
        "auc": round(float(auc), 4),
        "threshold_f1": round(float(threshold), 3),
        "accuracy": round(float(accuracy), 4),
        "precision": round(float(precision_score(y_test, y_pred, zero_division=0)), 4),
        "recall": round(float(recall_score(y_test, y_pred, zero_division=0)), 4),
        "f1": round(float(f1_score(y_test, y_pred, zero_division=0)), 4),
        "n_features": len(feat_cols),
        "feature_importance": feature_importance,
        "confusion_matrix": cm.tolist(),  # Store as list for JSON serialization
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
    
    # Check data fingerprint to detect changes between executions
    fp = data_fingerprint(featured, feat_cols)
    print(f"[DEBUG] fingerprint données = {fp} | n_lignes={len(featured)} | n_positifs={int(featured['curatif_mois_suivant'].sum())}")
    
    # CRISP-DM — EDA : corrélation avec target, détection features corrélées, boxplots
    print("\n  EDA en cours...")
    feat_cols_clean, n_dropped, target_corr = perform_eda(featured, feat_cols, OUTPUT_DIR)
    print(f"  Features initiales : {len(feat_cols)} | Éliminées (|r|>0.85) : {n_dropped} | Restantes : {len(feat_cols_clean)}")
    
    # CRISP-DM — split global chronologique, jamais aléatoire.
    featured = featured.sort_values(["annee_mois", "equip_id"]).reset_index(drop=True)
    X = featured[feat_cols].values
    X_clean = featured[feat_cols_clean].values
    y = featured["curatif_mois_suivant"].values

    split_idx = int(len(featured) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    X_train_clean, X_test_clean = X_clean[:split_idx], X_clean[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    
    # Benchmark utilise uniquement les features de production pour cohérence
    pos = int(y.sum())
    neg = int(len(y) - pos)
    print(f"  Dataset : {len(featured):,} observations | {len(feat_cols)} features")
    print(f"  Cible   : curatifs mois suivant > mediane historique")
    print(f"  Classes : 1={pos} ({pos / len(y) * 100:.1f}%) | 0={neg}")
    print(f"  Split   : train={len(y_train):,} | test={len(y_test):,}")

    # CRISP-DM — Modeling / Evaluation
    rows = []
    models = build_models(y_train, feat_cols_clean)

    # Evaluate models with production features (FEATURE_COLS)
    print("\n  === Évaluation avec features de production ===")
    for name, model in models.items():
        print(f"\n  Entrainement : {name}")
        try:
            # Logistic Regression utilise features nettoyées, modèles tree-based toutes les features
            if name == "Logistic Regression":
                row = evaluate_model(name, model, X_train_clean, X_test_clean, y_train, y_test, feat_cols_clean, OUTPUT_DIR)
            else:
                row = evaluate_model(name, model, X_train, X_test, y_train, y_test, feat_cols, OUTPUT_DIR)
            row["status"] = "ok"
            row["feature_set"] = "production"
            rows.append(row)
            print(
                f"    AUC={row['auc']:.4f} | F1={row['f1']:.4f} | "
                f"Precision={row['precision']:.4f} | Recall={row['recall']:.4f} | Accuracy={row['accuracy']:.4f} | Features={row['n_features']}"
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
                "n_features": np.nan,
                "status": f"erreur: {e}",
                "feature_set": "production",
                "confusion_matrix": None,
            })
            print(f"    ERREUR : {e}")

    results = pd.DataFrame(rows)
    results["n_train"] = len(y_train)
    results["n_test"] = len(y_test)
    results["target"] = "curatifs mois suivant > mediane historique"
    results["generated_at"] = datetime.now().isoformat()

    sort_cols = ["status", "feature_set", "auc", "f1"]
    results = results.sort_values(sort_cols, ascending=[True, False, False, False])
    
    # Résultats de benchmark (features de production)
    print("\n  === Résultats de benchmark (features de production) ===")
    for _, row in results.iterrows():
        print(f"    {row['model']}: AUC={row['auc']:.4f} | F1={row['f1']:.4f} | Accuracy={row['accuracy']:.4f} | Precision={row['precision']:.4f} | Recall={row['recall']:.4f}")
    
    # Extract and save feature importance - use the best model (Gradient Boosting)
    print("\n  === Feature Importance ===")
    best_result = max(rows, key=lambda x: x["auc"])
    if best_result["feature_importance"]:
        importance_dict = best_result["feature_importance"]
        importance_data = [{
            "model": best_result["model"],
            "feature_set": best_result["feature_set"],
            "feature": feat,
            "importance": round(float(imp), 4)
        } for feat, imp in importance_dict.items()]
        
        importance_df = pd.DataFrame(importance_data)
        importance_path = OUTPUT_DIR / "feature_importance.csv"
        importance_df.to_csv(importance_path, index=False, encoding="utf-8-sig")
        print(f"    Feature importance sauvegardée : {importance_path}")
        
        # Show top 10 features
        top_features = importance_df.sort_values("importance", ascending=False).head(10)
        print(f"\n    Top 10 features - {best_result['model']}:")
        for _, feat_row in top_features.iterrows():
            print(f"      {feat_row['feature']}: {feat_row['importance']:.4f}")
    else:
        print("    Aucune feature importance disponible pour le meilleur modèle")
    
    # CRISP-DM — Deployment : artefact de benchmark du seul modèle de risque.
    results.to_csv(COMPARISON_PATH, index=False, encoding="utf-8-sig")

    print("\n" + results[["model", "feature_set", "auc", "accuracy", "precision", "recall", "f1", "threshold_f1", "n_features", "status"]].to_string(index=False))
    
    # Save feature importance from the best model (Random Forest)
    best_result = max(rows, key=lambda x: x["auc"])
    if best_result["feature_importance"]:
        importance_df = pd.DataFrame.from_dict(best_result["feature_importance"], orient='index', columns=['importance'])
        importance_df = importance_df.sort_values('importance', ascending=False)
        importance_df.to_csv(OUTPUT_DIR / "feature_importance.csv", encoding='utf-8-sig')
        
        importance_list_path = OUTPUT_DIR / "importance_features_list.txt"
        with open(importance_list_path, 'w', encoding='utf-8') as f:
            f.write(f"Feature Importance - {best_result['model']}:\n")
            for i, (feat, imp) in enumerate(importance_df.itertuples(), 1):
                f.write(f"{i}. {feat}: {imp:.4f}\n")
        print(f"\n  Feature importance sauvegardée : {OUTPUT_DIR / 'feature_importance.csv'}")
        print(f"  Liste features importance sauvegardée : {importance_list_path}")
    
    print(f"\n  Comparaison sauvegardee : {COMPARISON_PATH}")
    print(f"  EDA sauvegardee : {OUTPUT_DIR / 'correlation_heatmap.png'}, {OUTPUT_DIR / 'boxplots_features.png'}")
    print(f"  Matrices de confusion sauvegardees dans : {OUTPUT_DIR}")
    print("=" * 72)


if __name__ == "__main__":
    main()