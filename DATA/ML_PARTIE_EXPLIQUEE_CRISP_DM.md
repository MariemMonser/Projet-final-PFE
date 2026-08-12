# Partie expliquée — CRISP-DM : prédiction du risque de panne

## 1. Business Understanding

La maintenance identifie les équipements susceptibles de connaître un mois anormalement curatif afin de prioriser inspections et préventifs. La sortie est une probabilité et une catégorie Faible, Modéré ou Élevé.

## 2. Data Understanding

Le Data Warehouse fournit CURA et PREV, leurs durées, ainsi que MTBF, disponibilité, nombre et durée des arrêts. Chaque observation est un équipement et un mois.

## 3. Data Preparation

Le dataset comprend les lags 1, 2 et 3 mois, agrégats glissants 3 mois, délais depuis le dernier curatif/préventif, ratio curatif/préventif, volumes, durées, MTBF, disponibilité et arrêts.

La cible binaire est : nombre de curatifs du mois suivant > médiane historique de l'équipement. Le dernier mois de chaque équipement est exclu de l'apprentissage et le split 80/20 respecte l'ordre des mois.

## 4. Modeling

Le modèle de production est GradientBoostingClassifier calibré par CalibratedClassifierCV isotonic. Le benchmark compare régression logistique, forêt aléatoire et, s'il est installé, XGBoost.

## 5. Evaluation

L'AUC-ROC est calculée sur le test temporel, avec AUC train et seuil F1. Le challenger est retenu seulement si son AUC est à moins de 0,005 sous celle du champion.

## 6. Deployment

Après chaque ETL, le dernier mois disponible de chaque équipement est scoré. Les percentiles 66 et 85 définissent les niveaux Modéré et Élevé.

Les seules sorties sont best_model.pkl, predictions_risque.csv, model_meta.json et model_comparison.csv. Les anciens modules EWMA charge technicien et PRC sont désactivés et ne produisent aucun fichier.
