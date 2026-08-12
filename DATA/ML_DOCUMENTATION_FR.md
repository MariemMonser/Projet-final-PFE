# Modèle ML — risque de panne par équipement

## Objectif

Le périmètre ML d'Eleonetech est limité à l'estimation du risque de panne pour chaque équipement. La cible est : nombre de curatifs du mois suivant > médiane historique de l'équipement.

Les prévisions de charge technicien et de demande PRC sont désactivées. Aucun calcul EWMA, ajustement par famille ou fichier de commande n'est produit.

## Méthode CRISP-DM

1. **Business Understanding** — Prioriser les équipements à surveiller ou à maintenir.
2. **Data Understanding** — Données de fact_intervention, fact_arret, dim_temps et dim_equipement.
3. **Data Preparation** — Agrégation équipement × mois, lags 1 à 3, fenêtres 3 mois, MTBF, disponibilité, arrêts, durées et ratio curatif/préventif.
4. **Modeling** — GradientBoostingClassifier avec CalibratedClassifierCV isotonic : 300 arbres, profondeur 4, learning rate 0,05, subsample 0,8 et 10 observations minimales par feuille.
5. **Evaluation** — Découpage temporel 80/20, AUC-ROC train/test et seuil F1. Le challenger remplace le champion seulement si sa perte AUC ne dépasse pas 0,005.
6. **Deployment** — Score du dernier mois disponible de chaque équipement après chaque ETL.

## Catégories de risque

- Faible : probabilité jusqu'au percentile 66.
- Modéré : entre les percentiles 66 et 85.
- Élevé : au-dessus du percentile 85.

La catégorie est une priorisation relative; proba_panne reste la probabilité calibrée.

## Exécution

Après l'ETL : python DATA/retrain_model.py.

Le script DATA/run_etl.bat enchaîne uniquement ETL et réentraînement du risque. Le benchmark indépendant est DATA/compare_ml_models.py.

## Sorties API

| Fichier | Contenu |
|---|---|
| ml_output/best_model.pkl | Champion, variables, seuil et métriques. |
| ml_output/predictions_risque.csv | Scores par équipement et indicateurs historiques. |
| ml_output/model_meta.json | Version, AUC, date, cible, variables et distribution. |
| ml_output/model_comparison.csv | Résultats du benchmark de risque. |

Les fichiers charge_prevision.json, prc_prevision.csv et prc_commande.csv ne sont plus générés.
