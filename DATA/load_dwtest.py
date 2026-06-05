"""
load_dw.py  —  Peuple eleonetech_dw depuis eleonetech_staging
=============================================================
Architecture corrigée :

DIMENSIONS :
  dim_temps        → clé temporelle (OT timestamp + mois + jours énergie)
  dim_zone         → 8 zones fixes
  dim_equipement   → équipements avec KPIs agrégés
  dim_ligne        → lignes de production
  dim_employe      → techniciens avec KPIs agrégés
  dim_intervention → attributs descriptifs d'un OT (pas les mesures)
  dim_prc          → pièces de rechange avec stock et prix
  dim_electricite  → 1 ligne/jour — attributs du relevé élec
                     (date, annee_mois, annee, mois_num,
                      phase1_kwh, phase2_kwh, phase3_kwh  ← attributs)
  dim_pv           → 1 ligne/jour — attributs du relevé PV
                     (date, puissance_installee_kwp, production_cumulee_kwh,
                      heures_equiv_h  ← attributs descriptifs)
  dim_eau          → 1 ligne/jour — attributs du relevé eau
                     (date, annee_mois, annee, mois_num)

TABLES DE FAITS (mesures uniquement) :
  fact_ot_global     → 1/mois  : nb_ot, taux_realisation
  fact_intervention  → 1/OT    : duree_intervention_h
  fact_pdr           → 1/mvt   : quantite_sortie, valeur_consommee_tnd
  fact_arret         → 1/(eq×mois) : MTBF, MTTR, dispo (calculés)
  fact_energie_elec  → 1/jour  : conso_jour_kwh, cout_jour_tnd  ← MESURES
  fact_energie_eau   → 1/jour  : conso_jour_m3, cout_jour_tnd   ← MESURES
  fact_energie_pv    → 1/jour  : production_kwh, valeur_pv_tnd  ← MESURES

MTBF/MTTR calculés :
  t_arret = durée arrêt depuis stg_clean_taux_dispo (PDF Coswin)
  MTTR = t_arret / nb_arret
  MTBF = (t_ouverture - t_arret) / nb_arret
  Dispo = MTBF / (MTBF + MTTR) × 100
  Seuils : MTBF ≥ 715h | MTTR ≤ 1h | Dispo ≥ 95%

Usage : python load_dw.py
"""

import numpy as np
import pandas as pd
import warnings
from datetime import datetime
from sqlalchemy import create_engine, text

warnings.filterwarnings("ignore")

# ── Config ────────────────────────────────────────────────────────────────────
DB_HOST     = "localhost"
DB_PORT     = 5432
DB_USER     = "postgres"
DB_PASSWORD = ""
DB_STAGING  = "eleonetech_staging"
DB_DW       = "eleonetech_dw"
DB_APP      = "eleonetech_db"   # base principale de l'application web


def get_engine(db):
    if DB_PASSWORD:
        url = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{db}"
    else:
        url = f"postgresql+psycopg2://{DB_USER}@{DB_HOST}:{DB_PORT}/{db}"
    return create_engine(url)


MOIS_MAP = {
    1:'Janvier',2:'Février',3:'Mars',4:'Avril',5:'Mai',6:'Juin',
    7:'Juillet',8:'Août',9:'Septembre',10:'Octobre',11:'Novembre',12:'Décembre'
}

MOIS_SQL = """CASE
    WHEN UPPER({col})='JANVIER'                  THEN 1
    WHEN UPPER({col}) IN ('FEVRIER','FÉVRIER')   THEN 2
    WHEN UPPER({col})='MARS'                     THEN 3
    WHEN UPPER({col})='AVRIL'                    THEN 4
    WHEN UPPER({col})='MAI'                      THEN 5
    WHEN UPPER({col})='JUIN'                     THEN 6
    WHEN UPPER({col})='JUILLET'                  THEN 7
    WHEN UPPER({col}) IN ('AOUT','AOÛT')         THEN 8
    WHEN UPPER({col})='SEPTEMBRE'                THEN 9
    WHEN UPPER({col})='OCTOBRE'                  THEN 10
    WHEN UPPER({col})='NOVEMBRE'                 THEN 11
    WHEN UPPER({col}) IN ('DECEMBRE','DÉCEMBRE') THEN 12
END"""

# ── DDL ───────────────────────────────────────────────────────────────────────


DW_DROP = """
DROP TABLE IF EXISTS fact_ot_global        CASCADE;
DROP TABLE IF EXISTS fact_intervention     CASCADE;
DROP TABLE IF EXISTS fact_pdr              CASCADE;
DROP TABLE IF EXISTS fact_arret            CASCADE;
DROP TABLE IF EXISTS fact_energie_elec     CASCADE;
DROP TABLE IF EXISTS fact_energie_eau      CASCADE;
DROP TABLE IF EXISTS fact_energie_pv       CASCADE;
DROP TABLE IF EXISTS dim_intervention      CASCADE;
DROP TABLE IF EXISTS dim_employe           CASCADE;
DROP TABLE IF EXISTS dim_prc               CASCADE;
DROP TABLE IF EXISTS dim_ligne             CASCADE;
DROP TABLE IF EXISTS dim_equipement        CASCADE;
DROP TABLE IF EXISTS dim_zone              CASCADE;
DROP TABLE IF EXISTS dim_temps             CASCADE;
DROP TABLE IF EXISTS dim_electricite       CASCADE;
DROP TABLE IF EXISTS dim_pv                CASCADE;
DROP TABLE IF EXISTS dim_eau               CASCADE;
DROP VIEW  IF EXISTS v_kpi_ot_mensuel      CASCADE;
DROP VIEW  IF EXISTS v_kpi_technicien      CASCADE;
DROP VIEW  IF EXISTS v_kpi_equipement      CASCADE;
DROP VIEW  IF EXISTS v_kpi_disponibilite   CASCADE;
DROP VIEW  IF EXISTS v_kpi_pdr             CASCADE;
DROP VIEW  IF EXISTS v_kpi_energie_mensuel CASCADE;
DROP VIEW  IF EXISTS v_kpi_pv_gain         CASCADE;
"""

DW_DDL = """
CREATE TABLE dim_temps (
    temps_id      SERIAL       PRIMARY KEY,
    date_debut    TIMESTAMP,
    duree_minutes NUMERIC(10,2),
    annee         SMALLINT,
    semestre      SMALLINT,
    trimestre     SMALLINT,
    mois_num      SMALLINT,
    mois_nom      VARCHAR(20),
    semaine       SMALLINT,
    jour          SMALLINT,
    jour_semaine  SMALLINT,
    heure         SMALLINT,
    minute        SMALLINT,
    annee_mois    VARCHAR(7)
);

CREATE TABLE dim_zone (
    zone_id      SERIAL       PRIMARY KEY,
    code_zone    VARCHAR(10)  NOT NULL UNIQUE,
    libelle_zone VARCHAR(60)  NOT NULL,
    batiment     VARCHAR(30),
    etage        VARCHAR(20)
);

CREATE TABLE dim_equipement (
    equip_id        SERIAL       PRIMARY KEY,
    code_equipement VARCHAR(30)  NOT NULL UNIQUE,
    libelle         TEXT,
    zone_id         INT          REFERENCES dim_zone(zone_id),
    nb_arrets_total INTEGER      DEFAULT 0,
    nb_ot_curatif   INTEGER      DEFAULT 0,
    nb_ot_preventif INTEGER      DEFAULT 0,
    nb_ot_autre     INTEGER      DEFAULT 0
);

CREATE TABLE dim_ligne (
    ligne_id    SERIAL       PRIMARY KEY,
    code_ligne  VARCHAR(20)  NOT NULL UNIQUE,
    description TEXT,
    entite      VARCHAR(20)  DEFAULT 'SG',
    statut      VARCHAR(10)  DEFAULT 'Actif',
    zone_id     INT          REFERENCES dim_zone(zone_id),
    equip_id    INT          REFERENCES dim_equipement(equip_id)
);

CREATE TABLE dim_prc (
    prc_id             SERIAL        PRIMARY KEY,
    code_prc           VARCHAR(15)   NOT NULL UNIQUE,
    designation        TEXT,
    famille_equipement TEXT,
    cout_unitaire_tnd  NUMERIC(12,3) DEFAULT 0,
    stock_actuel       INTEGER       DEFAULT 0
);

CREATE TABLE dim_employe (
    employe_id      SERIAL        PRIMARY KEY,
    matricule       VARCHAR(20)   NOT NULL UNIQUE,
    nom_prenom      TEXT,
    total_hrs_annee NUMERIC(10,3) DEFAULT 0,
    hrs_curatif     NUMERIC(10,3) DEFAULT 0,
    hrs_preventif   NUMERIC(10,3) DEFAULT 0,
    hrs_autre       NUMERIC(10,3) DEFAULT 0,
    nb_ot_total     INTEGER       DEFAULT 0,
    nb_ot_curatif   INTEGER       DEFAULT 0,
    nb_ot_preventif INTEGER       DEFAULT 0,
    nb_ot_autre     INTEGER       DEFAULT 0
);

CREATE TABLE dim_intervention (
    id_inter          SERIAL       PRIMARY KEY,
    numero_ot         VARCHAR(30)  UNIQUE,
    type_intervention VARCHAR(10),
    matricule_tech    VARCHAR(20),
    nom_technicien    TEXT,
    code_equipement   VARCHAR(30),
    date_debut        TIMESTAMP,
    duree_h           NUMERIC(10,3)
);

CREATE TABLE dim_electricite (
    elec_id      SERIAL  PRIMARY KEY,
    date_releve  DATE    NOT NULL UNIQUE,
    annee_mois   VARCHAR(7),
    annee        SMALLINT,
    mois_num     SMALLINT,
    jour         SMALLINT,
    semaine      SMALLINT,
    jour_semaine SMALLINT,
    phase1_kwh   NUMERIC(12,3),
    phase2_kwh   NUMERIC(12,3),
    phase3_kwh   NUMERIC(12,3)
);

CREATE TABLE dim_pv (
    pv_id                   SERIAL  PRIMARY KEY,
    date_jour               DATE    NOT NULL UNIQUE,
    annee_mois              VARCHAR(7),
    annee                   SMALLINT,
    mois_num                SMALLINT,
    jour                    SMALLINT,
    semaine                 SMALLINT,
    jour_semaine            SMALLINT,
    puissance_installee_kwp NUMERIC(8,2),
    production_cumulee_kwh  NUMERIC(12,3)
);

CREATE TABLE dim_eau (
    eau_id       SERIAL  PRIMARY KEY,
    date_releve  DATE    NOT NULL UNIQUE,
    annee_mois   VARCHAR(7),
    annee        SMALLINT,
    mois_num     SMALLINT,
    jour         SMALLINT,
    semaine      SMALLINT,
    jour_semaine SMALLINT
);

CREATE TABLE fact_ot_global (
    id                   SERIAL PRIMARY KEY,
    temps_id             INT    REFERENCES dim_temps(temps_id),
    nb_ot_total          INTEGER,
    nb_ot_curatif        INTEGER,
    nb_ot_preventif      INTEGER,
    nb_ot_autre          INTEGER,
    nb_ot_honore         INTEGER,
    taux_realisation_pct NUMERIC(5,2),
    ratio_preventif_pct  NUMERIC(5,2),
    UNIQUE (temps_id)
);

CREATE TABLE fact_intervention (
    id                   SERIAL PRIMARY KEY,
    temps_id             INT    REFERENCES dim_temps(temps_id),
    equip_id             INT    REFERENCES dim_equipement(equip_id),
    employe_id           INT    REFERENCES dim_employe(employe_id),
    zone_id              INT    REFERENCES dim_zone(zone_id),
    id_inter             INT    REFERENCES dim_intervention(id_inter),
    type_intervention    VARCHAR(10),
    duree_intervention_h NUMERIC(10,3),
    UNIQUE (id_inter)
);

CREATE TABLE fact_pdr (
    id                   SERIAL PRIMARY KEY,
    temps_id             INT    REFERENCES dim_temps(temps_id),
    prc_id               INT    REFERENCES dim_prc(prc_id),
    quantite_sortie      INTEGER,
    stock_final          INTEGER,
    valeur_consommee_tnd NUMERIC(12,3)
);

-- fact_arret : nb_arrets INTEGER, sans colonnes _pdf
-- ecart_mtbf = MTBF_calcule - 715 (negatif = mauvais)
-- ecart_mttr = 1 - MTTR_calcule (negatif = mauvais)
-- dispo=100% quand nb_arrets=0 est CORRECT (aucune panne ce mois)
CREATE TABLE fact_arret (
    id                SERIAL PRIMARY KEY,
    temps_id          INT    REFERENCES dim_temps(temps_id),
    ligne_id          INT    REFERENCES dim_ligne(ligne_id),
    zone_id           INT    REFERENCES dim_zone(zone_id),
    equip_id          INT    REFERENCES dim_equipement(equip_id),
    duree_ouverture_h NUMERIC(10,2),
    t_arret           NUMERIC(10,2),
    nb_arrets         INTEGER,
    nb_ot_curatif     INTEGER,
    mttr_h            NUMERIC(10,2),
    mtbf_h            NUMERIC(10,2),
    disponibilite_pct NUMERIC(5,2),
    conforme_mtbf     BOOLEAN       GENERATED ALWAYS AS (mtbf_h >= 715) STORED,
    conforme_mttr     BOOLEAN       GENERATED ALWAYS AS (mttr_h <= 1)   STORED,
    ecart_mtbf        NUMERIC(10,2) GENERATED ALWAYS AS (mtbf_h - 715)  STORED,
    ecart_mttr        NUMERIC(10,2) GENERATED ALWAYS AS (1 - mttr_h)    STORED,
    UNIQUE (temps_id, ligne_id)
);

CREATE TABLE fact_energie_elec (
    id             SERIAL PRIMARY KEY,
    elec_id        INT    REFERENCES dim_electricite(elec_id),
    temps_id       INT    REFERENCES dim_temps(temps_id),
    zone_id        INT    REFERENCES dim_zone(zone_id),
    conso_jour_kwh NUMERIC(12,3),
    cout_jour_tnd  NUMERIC(12,3),
    UNIQUE (elec_id)
);

CREATE TABLE fact_energie_eau (
    id            SERIAL PRIMARY KEY,
    eau_id        INT    REFERENCES dim_eau(eau_id),
    temps_id      INT    REFERENCES dim_temps(temps_id),
    zone_id       INT    REFERENCES dim_zone(zone_id),
    conso_jour_m3 NUMERIC(10,3),
    cout_jour_tnd NUMERIC(10,3) GENERATED ALWAYS AS (
        ROUND(COALESCE(conso_jour_m3,0)*0.200,3)) STORED,
    UNIQUE (eau_id)
);

CREATE TABLE fact_energie_pv (
    id             SERIAL PRIMARY KEY,
    pv_id          INT    REFERENCES dim_pv(pv_id),
    temps_id       INT    REFERENCES dim_temps(temps_id),
    zone_id        INT    REFERENCES dim_zone(zone_id),
    production_kwh NUMERIC(12,3),
    heures_equiv_h NUMERIC(8,3),
    valeur_pv_tnd  NUMERIC(12,3) GENERATED ALWAYS AS (
        ROUND(COALESCE(production_kwh,0)*0.291,3)) STORED,
    UNIQUE (pv_id)
);
"""

DW_SEED = """
INSERT INTO dim_zone (code_zone,libelle_zone,batiment,etage) VALUES
('BAT','Batiment','Bat. Principal','RDC'),
('CMS','CMS Assemblage','Bat. Production','RDC'),
('MAG','Magasin','Bat. Stockage','RDC'),
('MEZ','Mezzanine','Bat. Principal','Mezzanine'),
('SEP','SEP Separation','Bat. Production','RDC'),
('THT','THT Traversant','Bat. Production','RDC'),
('UAP4','UAP4 Production','Bat. Production','RDC')
ON CONFLICT (code_zone) DO NOTHING;
"""

DW_VIEWS = """
DROP VIEW IF EXISTS v_kpi_ot_mensuel      CASCADE;
DROP VIEW IF EXISTS v_kpi_technicien      CASCADE;
DROP VIEW IF EXISTS v_kpi_equipement      CASCADE;
DROP VIEW IF EXISTS v_kpi_disponibilite   CASCADE;
DROP VIEW IF EXISTS v_kpi_pdr             CASCADE;
DROP VIEW IF EXISTS v_kpi_energie_mensuel CASCADE;
DROP VIEW IF EXISTS v_kpi_pv_gain         CASCADE;

CREATE OR REPLACE VIEW v_kpi_ot_mensuel AS
SELECT dt.annee, dt.mois_nom, dt.annee_mois, dt.trimestre,
       f.nb_ot_total, f.nb_ot_curatif, f.nb_ot_preventif, f.nb_ot_autre,
       f.nb_ot_honore, f.taux_realisation_pct, f.ratio_preventif_pct,
       ROUND(f.nb_ot_curatif::NUMERIC  /NULLIF(f.nb_ot_total,0)*100,2) AS pct_curatif,
       ROUND(f.nb_ot_preventif::NUMERIC/NULLIF(f.nb_ot_total,0)*100,2) AS pct_preventif,
       ROUND(f.nb_ot_autre::NUMERIC    /NULLIF(f.nb_ot_total,0)*100,2) AS pct_autre
FROM fact_ot_global f
JOIN dim_temps dt ON dt.temps_id = f.temps_id
ORDER BY dt.annee, dt.mois_num;

CREATE OR REPLACE VIEW v_kpi_technicien AS
SELECT de.matricule, de.nom_prenom,
       dt.annee_mois, dt.mois_nom, dt.annee,
       COUNT(fi.id)                                                   AS nb_ot,
       ROUND(SUM(COALESCE(fi.duree_intervention_h,0)),2)              AS total_hrs,
       SUM(CASE WHEN fi.type_intervention='CURA'  THEN 1 ELSE 0 END) AS nb_curatif,
       SUM(CASE WHEN fi.type_intervention='PREV'  THEN 1 ELSE 0 END) AS nb_preventif,
       SUM(CASE WHEN fi.type_intervention='AUTRE' THEN 1 ELSE 0 END) AS nb_autre,
       ROUND(SUM(CASE WHEN fi.type_intervention='CURA'
           THEN COALESCE(fi.duree_intervention_h,0) ELSE 0 END),2)   AS hrs_curatif,
       ROUND(SUM(CASE WHEN fi.type_intervention='PREV'
           THEN COALESCE(fi.duree_intervention_h,0) ELSE 0 END),2)   AS hrs_preventif,
       ROUND(SUM(CASE WHEN fi.type_intervention='AUTRE'
           THEN COALESCE(fi.duree_intervention_h,0) ELSE 0 END),2)   AS hrs_autre
FROM fact_intervention fi
JOIN dim_employe de ON de.employe_id = fi.employe_id
JOIN dim_temps   dt ON dt.temps_id   = fi.temps_id
GROUP BY de.matricule, de.nom_prenom,
         dt.annee_mois, dt.mois_nom, dt.annee, dt.mois_num
ORDER BY dt.annee, dt.mois_num, total_hrs DESC;

CREATE OR REPLACE VIEW v_kpi_equipement AS
SELECT deq.code_equipement, deq.libelle, dz.code_zone,
       dt.annee_mois, dt.mois_nom, dt.annee,
       COUNT(fi.id)                                                   AS nb_interventions,
       ROUND(SUM(COALESCE(fi.duree_intervention_h,0)),2)              AS total_hrs,
       SUM(CASE WHEN fi.type_intervention='CURA'  THEN 1 ELSE 0 END) AS nb_curatif,
       SUM(CASE WHEN fi.type_intervention='PREV'  THEN 1 ELSE 0 END) AS nb_preventif,
       SUM(CASE WHEN fi.type_intervention='AUTRE' THEN 1 ELSE 0 END) AS nb_autre,
       fa.nb_arrets, fa.mtbf_h, fa.mttr_h, fa.disponibilite_pct,
       fa.conforme_mtbf, fa.conforme_mttr, fa.ecart_mtbf, fa.ecart_mttr
FROM dim_equipement deq
LEFT JOIN dim_zone          dz ON dz.zone_id  = deq.zone_id
LEFT JOIN fact_intervention fi ON fi.equip_id = deq.equip_id
LEFT JOIN dim_temps         dt ON dt.temps_id = fi.temps_id
LEFT JOIN fact_arret        fa ON fa.equip_id = deq.equip_id
                               AND fa.temps_id = fi.temps_id
WHERE dt.annee_mois IS NOT NULL
GROUP BY deq.code_equipement, deq.libelle, dz.code_zone,
         dt.annee_mois, dt.mois_nom, dt.annee, dt.mois_num,
         fa.nb_arrets, fa.mtbf_h, fa.mttr_h, fa.disponibilite_pct,
         fa.conforme_mtbf, fa.conforme_mttr, fa.ecart_mtbf, fa.ecart_mttr
ORDER BY dt.annee, dt.mois_num, nb_interventions DESC;

CREATE OR REPLACE VIEW v_kpi_disponibilite AS
SELECT deq.code_equipement, deq.libelle, dz.code_zone,
       dt.annee, dt.mois_nom, dt.annee_mois, dt.trimestre,
       fa.duree_ouverture_h, fa.nb_arrets,
       fa.t_arret, fa.nb_ot_curatif,
       fa.mttr_h, fa.mtbf_h, fa.disponibilite_pct,
       fa.conforme_mtbf, fa.conforme_mttr,
       fa.ecart_mtbf, fa.ecart_mttr,
       715  AS objectif_mtbf,
       1    AS objectif_mttr,
       95.0 AS objectif_dispo,
       CASE WHEN fa.conforme_mtbf AND fa.conforme_mttr THEN 'Conforme'
            WHEN fa.conforme_mtbf OR  fa.conforme_mttr THEN 'Partiel'
            ELSE 'Non conforme' END AS statut
FROM fact_arret fa
JOIN dim_temps      dt  ON dt.temps_id  = fa.temps_id
JOIN dim_equipement deq ON deq.equip_id = fa.equip_id
LEFT JOIN dim_zone  dz  ON dz.zone_id   = deq.zone_id
ORDER BY dt.annee, dt.mois_num, fa.disponibilite_pct;

CREATE OR REPLACE VIEW v_kpi_pdr AS
SELECT dp.code_prc, dp.designation, dp.famille_equipement,
       dp.cout_unitaire_tnd, dp.stock_actuel,
       dt.annee, dt.mois_nom, dt.annee_mois,
       SUM(fp.quantite_sortie)          AS qtite_sortie,
       MAX(fp.stock_final)              AS stock_final,
       SUM(fp.valeur_consommee_tnd)     AS cout_total_periode,
       dp.stock_actuel * dp.cout_unitaire_tnd AS valeur_stock_tnd
FROM fact_pdr fp
JOIN dim_prc   dp ON dp.prc_id   = fp.prc_id
JOIN dim_temps dt ON dt.temps_id = fp.temps_id
GROUP BY dp.code_prc, dp.designation, dp.famille_equipement,
         dp.cout_unitaire_tnd, dp.stock_actuel,
         dt.annee, dt.mois_nom, dt.annee_mois, dt.mois_num
ORDER BY dt.annee, dt.mois_num, cout_total_periode DESC;

CREATE OR REPLACE VIEW v_kpi_energie_mensuel AS
SELECT de.annee_mois, de.annee, de.mois_num,
       SUM(fe.conso_jour_kwh) AS conso_elec_kwh,
       SUM(fe.cout_jour_tnd)  AS cout_elec_tnd,
       COUNT(fe.id)           AS nb_jours_elec,
       eau_m.conso_eau_m3, eau_m.cout_eau_tnd,
       pv_m.production_pv_kwh, pv_m.heures_equiv_h,
       ROUND(pv_m.production_pv_kwh * 0.291, 3) AS valeur_pv_tnd,
       ROUND(pv_m.production_pv_kwh * 0.291 - COALESCE(SUM(fe.cout_jour_tnd),0), 3) AS gain_pv_tnd,
       CASE WHEN SUM(fe.conso_jour_kwh) > 0
            THEN ROUND(pv_m.production_pv_kwh/SUM(fe.conso_jour_kwh)*100,2)
            ELSE 0 END AS taux_couverture_pct
FROM dim_electricite de
LEFT JOIN fact_energie_elec fe ON fe.elec_id = de.elec_id
LEFT JOIN (
    SELECT deau.annee_mois,
           SUM(fw.conso_jour_m3) AS conso_eau_m3,
           SUM(fw.cout_jour_tnd) AS cout_eau_tnd
    FROM fact_energie_eau fw JOIN dim_eau deau ON deau.eau_id = fw.eau_id
    GROUP BY deau.annee_mois
) eau_m ON eau_m.annee_mois = de.annee_mois
LEFT JOIN (
    SELECT dpv.annee_mois,
           SUM(fpv.production_kwh) AS production_pv_kwh,
           SUM(fpv.heures_equiv_h) AS heures_equiv_h
    FROM fact_energie_pv fpv JOIN dim_pv dpv ON dpv.pv_id = fpv.pv_id
    GROUP BY dpv.annee_mois
) pv_m ON pv_m.annee_mois = de.annee_mois
GROUP BY de.annee_mois, de.annee, de.mois_num,
         eau_m.conso_eau_m3, eau_m.cout_eau_tnd,
         pv_m.production_pv_kwh, pv_m.heures_equiv_h
ORDER BY de.annee, de.mois_num;

CREATE OR REPLACE VIEW v_kpi_pv_gain AS
SELECT dpv.date_jour, dpv.annee_mois,
       dpv.puissance_installee_kwp, dpv.production_cumulee_kwh,
       fpv.production_kwh, fpv.heures_equiv_h, fpv.valeur_pv_tnd,
       fe.conso_jour_kwh, fe.cout_jour_tnd AS cout_elec_tnd,
       ROUND(fpv.valeur_pv_tnd - COALESCE(fe.cout_jour_tnd,0),3) AS gain_jour_tnd,
       CASE WHEN fpv.valeur_pv_tnd > COALESCE(fe.cout_jour_tnd,0)
            THEN 'Rentable' ELSE 'Deficit' END AS statut_pv
FROM fact_energie_pv fpv
JOIN dim_pv dpv ON dpv.pv_id = fpv.pv_id
LEFT JOIN fact_energie_elec fe  ON fe.temps_id = fpv.temps_id
LEFT JOIN dim_electricite   dee ON dee.elec_id  = fe.elec_id
                                AND dee.date_releve = dpv.date_jour
WHERE fpv.production_kwh IS NOT NULL AND fpv.production_kwh > 0
ORDER BY dpv.date_jour;
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def run_sql(engine, sql_block, label="SQL"):
    ok = err = 0
    for stmt in sql_block.split(";"):
        stmt = stmt.strip()
        if stmt:
            try:
                with engine.begin() as c:
                    c.execute(text(stmt))
                ok += 1
            except Exception as e:
                err += 1
                print(f"    ↳ [{label}] {str(e)[:100]}")
    return ok, err


def stg(engine_stg, sql):
    with engine_stg.connect() as c:
        return pd.read_sql(text(sql), c)


def app(engine_app, sql):
    """Lit depuis eleonetech_db (base principale de l'application web)."""
    try:
        with engine_app.connect() as c:
            return pd.read_sql(text(sql), c)
    except Exception as e:
        print(f"    ⚠  app(): {str(e)[:80]}")
        return pd.DataFrame()


def dw_read(engine_dw, sql):
    with engine_dw.connect() as c:
        return pd.read_sql(text(sql), c)


def dw_write(df, table, engine_dw):
    if df is None or df.empty:
        print(f"    ⚠  {table}: rien à insérer")
        return 0
    df = df.copy().where(pd.notna(df), other=None)
    for col in df.columns:
        df[col] = df[col].apply(
            lambda v: None if v is None
            else int(v)   if isinstance(v, np.integer)
            else float(v) if isinstance(v, np.floating)
            else v)
    try:
        df.to_sql(table, engine_dw, if_exists="append",
                  index=False, method="multi", chunksize=200)
        print(f"    ✓  {table:<42} {len(df):>5} lignes")
        return len(df)
    except Exception as e:
        print(f"    ✗  {table}: {str(e)[:120]}")
        return 0


# ═══════════════════════════════════════════════════════════════════════════════
# DIMENSIONS
# ═══════════════════════════════════════════════════════════════════════════════

def load_dim_employe(engine_stg, engine_dw, engine_app=None):
    df = stg(engine_stg, """
        SELECT matricule, MAX(nom_prenom) AS nom_prenom,
               ROUND(SUM(COALESCE(hrs_travaux,0)),3) AS total_hrs_annee,
               ROUND(SUM(CASE WHEN type_intervention='CURA'
                   THEN COALESCE(hrs_travaux,0) ELSE 0 END),3) AS hrs_curatif,
               ROUND(SUM(CASE WHEN type_intervention='PREV'
                   THEN COALESCE(hrs_travaux,0) ELSE 0 END),3) AS hrs_preventif,
               ROUND(SUM(CASE WHEN UPPER(COALESCE(type_intervention,'')) NOT LIKE '%CURA%'
                   AND UPPER(COALESCE(type_intervention,'')) NOT LIKE '%PREV%'
                   THEN COALESCE(hrs_travaux,0) ELSE 0 END),3) AS hrs_autre,
               COUNT(DISTINCT numero_ot)                                          AS nb_ot_total,
               COUNT(DISTINCT CASE WHEN type_intervention='CURA'  THEN numero_ot END) AS nb_ot_curatif,
               COUNT(DISTINCT CASE WHEN type_intervention='PREV'  THEN numero_ot END) AS nb_ot_preventif,
               COUNT(DISTINCT CASE WHEN type_intervention='AUTRE' THEN numero_ot END) AS nb_ot_autre
        FROM stg_clean_charges
        WHERE matricule IS NOT NULL
        GROUP BY matricule
    """)
    dw_write(df[["matricule","nom_prenom","total_hrs_annee","hrs_curatif","hrs_preventif","hrs_autre","nb_ot_total","nb_ot_curatif","nb_ot_preventif","nb_ot_autre"]], "dim_employe", engine_dw)

    # Supplement: techniciens depuis utilisateurs (eleonetech_db)
    if engine_app is not None:
        df_u = app(engine_app, """
            SELECT 'USER-' || id::text AS matricule,
                   CONCAT(prenom, ' ', nom) AS nom_prenom
            FROM utilisateurs
            WHERE role IN ('Technicien','Responsable') AND est_actif = true
        """)
        if not df_u.empty:
            existing = dw_read(engine_dw, "SELECT matricule FROM dim_employe")
            new_u = df_u[~df_u["matricule"].isin(existing["matricule"])].copy()
            if not new_u.empty:
                for col in ["total_hrs_annee","hrs_curatif","hrs_preventif","hrs_autre",
                            "nb_ot_total","nb_ot_curatif","nb_ot_preventif","nb_ot_autre"]:
                    new_u[col] = 0
                dw_write(new_u[["matricule","nom_prenom","total_hrs_annee","hrs_curatif",
                                "hrs_preventif","hrs_autre","nb_ot_total","nb_ot_curatif",
                                "nb_ot_preventif","nb_ot_autre"]], "dim_employe", engine_dw)


def load_dim_equipement(engine_stg, engine_dw, engine_app=None):
    df = stg(engine_stg, """
        SELECT DISTINCT td.code_ligne AS code_equipement, td.description AS libelle,
               CASE
                   WHEN td.code_ligne LIKE 'BAT%'  THEN 'BAT'
                   WHEN td.code_ligne LIKE 'THT%'  THEN 'THT'
                   WHEN td.code_ligne = 'LEVAGE'   THEN 'MAG'
                   WHEN td.code_ligne = 'ELECT'    THEN 'BAT'
                   WHEN td.code_ligne = 'ESD'      THEN 'BAT'
                   WHEN td.code_ligne LIKE 'MAG%'  THEN 'MAG'
                   WHEN td.code_ligne LIKE 'CONV%' THEN 'CMS'
                   ELSE 'SG'
               END AS zone_code
        FROM stg_clean_taux_dispo td
        WHERE td.code_ligne IS NOT NULL
    """)
    if not df.empty:
        dz = dw_read(engine_dw, "SELECT zone_id, code_zone FROM dim_zone")
        df = df.merge(dz, left_on="zone_code", right_on="code_zone", how="left")
        dw_write(df[["code_equipement","libelle","zone_id"]], "dim_equipement", engine_dw)

    # Équipements depuis charges_employes non encore dans dim_equipement
    df_eq = stg(engine_stg, """
        SELECT DISTINCT code_equipement FROM stg_clean_charges
        WHERE code_equipement IS NOT NULL
    """)
    if not df_eq.empty:
        existing = dw_read(engine_dw, "SELECT code_equipement FROM dim_equipement")
        sg_zone  = dw_read(engine_dw, "SELECT zone_id FROM dim_zone WHERE code_zone='BAT'")
        new_eq   = df_eq[~df_eq["code_equipement"].isin(existing["code_equipement"])].copy()
        if not new_eq.empty:
            new_eq["libelle"] = new_eq["code_equipement"]
            new_eq["zone_id"] = int(sg_zone["zone_id"].iloc[0])
            dw_write(new_eq, "dim_equipement", engine_dw)

    # KPIs agrégés
    # nb_arrets → depuis stg_taux_disponibilite
    df_arr = stg(engine_stg, """
        SELECT code_ligne,
               SUM(COALESCE(nb_arret,0))::INTEGER AS total_arrets
        FROM stg_clean_taux_dispo
        GROUP BY code_ligne
    """)
    # nb_ot_curatif/preventif → depuis stg_charges_employes (source directe des OT)
    df_ot = stg(engine_stg, """
        SELECT code_equipement,
               COUNT(DISTINCT CASE WHEN type_intervention='CURA'
                   THEN numero_ot END) AS nb_ot_cura,
               COUNT(DISTINCT CASE WHEN type_intervention='PREV'
                   THEN numero_ot END) AS nb_ot_prev
        FROM stg_clean_charges
        WHERE code_equipement IS NOT NULL AND code_equipement != ''
        GROUP BY code_equipement
    """)
    with engine_dw.begin() as c:
        for _, row in df_arr.iterrows():
            c.execute(text(
                "UPDATE dim_equipement SET nb_arrets_total=:na WHERE code_equipement=:ce"),
                {"na": int(row.total_arrets), "ce": row.code_ligne})
        for _, row in df_ot.iterrows():
            c.execute(text(
                "UPDATE dim_equipement SET nb_ot_curatif=:nc, nb_ot_preventif=:np, nb_ot_autre=:na "
                "WHERE code_equipement=:ce"),
                {"nc": int(row.nb_ot_cura), "np": int(row.nb_ot_prev),
                 "na": int(row.get("nb_ot_autre", 0)), "ce": row.code_equipement})


def load_dim_prc(engine_stg, engine_dw, engine_app=None):
    df = stg(engine_stg, """
        SELECT code_prc_format AS code_prc, designation,
               equipement AS famille_equipement,
               COALESCE(NULLIF(cout_tnd,'')::NUMERIC,0) AS cout_unitaire_tnd
        FROM stg_pieces_rechange_catalogue
        WHERE code_prc_format IS NOT NULL
    """)
    dw_write(df, "dim_prc", engine_dw)

    # Supplement: prc depuis eleonetech_db
    if engine_app is not None:
        df_prc = app(engine_app, """
            SELECT 'PRC' || LPAD(p.code_prc, 8, '0') AS code_prc,
                   p.designation,
                   e.nom AS famille_equipement,
                   p.cout AS cout_unitaire_tnd,
                   p.stock AS stock_actuel
            FROM prc p
            LEFT JOIN equipements e ON e.id = p.equipement_id
            WHERE p.code_prc IS NOT NULL
        """)
        if not df_prc.empty:
            existing_prc = dw_read(engine_dw, "SELECT code_prc FROM dim_prc")
            new_prc = df_prc[~df_prc["code_prc"].isin(existing_prc["code_prc"])].copy()
            if not new_prc.empty:
                dw_write(new_prc[["code_prc","designation","famille_equipement","cout_unitaire_tnd"]],
                         "dim_prc", engine_dw)
            # Mettre à jour le stock pour les prc existants
            with engine_dw.begin() as c:
                for _, row in df_prc.iterrows():
                    if row.get("stock_actuel") is not None:
                        c.execute(text(
                            "UPDATE dim_prc SET stock_actuel=:s WHERE code_prc=:cp"),
                            {"s": int(row.stock_actuel), "cp": row.code_prc})
    df_stock = stg(engine_stg, """
        SELECT code_prc, MAX(NULLIF(aftsto,'')::NUMERIC) AS stock
        FROM stg_pieces_rechange_mouvements
        WHERE aftsto IS NOT NULL AND aftsto != ''
        GROUP BY code_prc
    """)
    if not df_stock.empty:
        with engine_dw.begin() as c:
            for _, row in df_stock.iterrows():
                if row.stock is not None:
                    c.execute(text(
                        "UPDATE dim_prc SET stock_actuel=:s WHERE code_prc=:cp"),
                        {"s": int(round(float(row.stock))), "cp": row.code_prc})


def load_dim_intervention(engine_stg, engine_dw):
    # Prioriser CURA > PREV > AUTRE pour chaque OT
    # Un OT peut avoir plusieurs lignes → prendre la plus significative
    df = stg(engine_stg, """
        SELECT DISTINCT ON (numero_ot)
               numero_ot,
               type_intervention,
               matricule AS matricule_tech, nom_prenom AS nom_technicien,
               code_equipement,
               date_debut,
               COALESCE(hrs_travaux,0) AS duree_h
        FROM stg_clean_charges
        WHERE numero_ot IS NOT NULL AND matricule IS NOT NULL
        ORDER BY numero_ot,
                 CASE WHEN type_intervention='CURA' THEN 1
                      WHEN type_intervention='PREV' THEN 2
                      ELSE 3 END ASC,
                 date_debut DESC NULLS LAST
    """)
    dw_write(df, "dim_intervention", engine_dw)


def load_dim_temps(engine_stg, engine_dw, engine_app=None):
    # A. Entrée par OT (timestamp précis)
    di = dw_read(engine_dw,
        "SELECT id_inter, date_debut, duree_h FROM dim_intervention WHERE date_debut IS NOT NULL")
    if not di.empty:
        di["date_debut"]   = pd.to_datetime(di["date_debut"])
        di["annee"]        = di["date_debut"].dt.year.astype("Int64")
        di["semestre"]     = ((di["date_debut"].dt.month-1)//6+1).astype("Int64")
        di["trimestre"]    = di["date_debut"].dt.quarter.astype("Int64")
        di["mois_num"]     = di["date_debut"].dt.month.astype("Int64")
        di["mois_nom"]     = di["mois_num"].map(MOIS_MAP)
        di["semaine"]      = di["date_debut"].dt.isocalendar().week.astype("Int64")
        di["jour"]         = di["date_debut"].dt.day.astype("Int64")
        di["jour_semaine"] = (di["date_debut"].dt.dayofweek+1).astype("Int64")
        di["heure"]        = di["date_debut"].dt.hour.astype("Int64")
        di["minute"]       = di["date_debut"].dt.minute.astype("Int64")
        di["annee_mois"]   = di["date_debut"].dt.strftime("%Y-%m")
        di["duree_minutes"]= (di["duree_h"]*60).round(2)
        dw_write(di[["date_debut","duree_minutes","annee","semestre","trimestre",
                     "mois_num","mois_nom","semaine","jour","jour_semaine",
                     "heure","minute","annee_mois"]], "dim_temps", engine_dw)

    # B. Entrée mensuelle pour les mois du PDF
    df_td = stg(engine_stg, f"""
        SELECT DISTINCT annee::SMALLINT AS annee,
               {MOIS_SQL.format(col='mois_libelle')} AS mois_num
        FROM stg_clean_taux_dispo
        WHERE annee IS NOT NULL
    """)
    if not df_td.empty:
        df_td = df_td.dropna(subset=["mois_num"])
        df_td["mois_nom"]  = df_td["mois_num"].map(MOIS_MAP)
        df_td["annee_mois"]= df_td.apply(
            lambda r: f"{int(r.annee):04d}-{int(r.mois_num):02d}", axis=1)
        df_td["semestre"]  = df_td["mois_num"].apply(lambda m: 1 if int(m)<=6 else 2)
        df_td["trimestre"] = df_td["mois_num"].apply(lambda m: (int(m)-1)//3+1)
        existing = set(dw_read(engine_dw,
            "SELECT DISTINCT annee_mois FROM dim_temps WHERE annee_mois IS NOT NULL"
        )["annee_mois"].tolist())
        new_m = df_td[~df_td["annee_mois"].isin(existing)]
        if not new_m.empty:
            dw_write(new_m[["annee","mois_num","mois_nom","semestre",
                             "trimestre","annee_mois"]], "dim_temps", engine_dw)

    # C. Entrée journalière pour les dates énergie
    # Depuis eleonetech_db si disponible, sinon staging
    if engine_app:
        app_energy_sources = [
            (engine_app, "consommation_electricite", "date_releve"),
            (engine_app, "consommation_eau",         "date_releve"),
            (engine_app, "production_photovoltaique","date"),
        ]
    else:
        app_energy_sources = []
    for src_table, date_col in [
        ("stg_energie_electricite",    "date_releve"),
        ("stg_energie_eau",            "date_releve"),
        ("stg_energie_photovoltaique", "date"),
    ]:
        try:
            df_d = stg(engine_stg,
                f"SELECT DISTINCT {date_col}::DATE AS jour FROM {src_table} "
                f"WHERE {date_col} IS NOT NULL")
            if df_d.empty:
                continue
            df_d["jour"]       = pd.to_datetime(df_d["jour"])
            df_d["annee"]      = df_d["jour"].dt.year.astype("Int64")
            df_d["semestre"]   = ((df_d["jour"].dt.month-1)//6+1).astype("Int64")
            df_d["trimestre"]  = df_d["jour"].dt.quarter.astype("Int64")
            df_d["mois_num"]   = df_d["jour"].dt.month.astype("Int64")
            df_d["mois_nom"]   = df_d["mois_num"].map(MOIS_MAP)
            df_d["semaine"]    = df_d["jour"].dt.isocalendar().week.astype("Int64")
            df_d["jour_num"]   = df_d["jour"].dt.day.astype("Int64")
            df_d["jour_sem"]   = (df_d["jour"].dt.dayofweek+1).astype("Int64")
            df_d["annee_mois"] = df_d["jour"].dt.strftime("%Y-%m")
            df_d["date_debut"] = df_d["jour"]
            existing_d = set(dw_read(engine_dw,
                "SELECT DISTINCT DATE(date_debut) AS d FROM dim_temps "
                "WHERE date_debut IS NOT NULL")["d"].astype(str).tolist())
            new_d = df_d[~df_d["jour"].dt.strftime("%Y-%m-%d").isin(existing_d)]
            if not new_d.empty:
                dw_write(new_d[["date_debut","annee","semestre","trimestre",
                                "mois_num","mois_nom","semaine","jour_num",
                                "jour_sem","annee_mois"]].rename(
                    columns={"jour_num":"jour","jour_sem":"jour_semaine"}),
                    "dim_temps", engine_dw)
        except Exception as e:
            print(f"    ⚠  dim_temps {src_table}: {str(e)[:80]}")

    # D. Dates depuis eleonetech_db (intervient aussi)
    for eng, src_table, date_col in app_energy_sources:
        try:
            df_d = app(eng, f"SELECT DISTINCT {date_col}::DATE AS jour FROM {src_table} WHERE {date_col} IS NOT NULL")
            if df_d.empty:
                continue
            df_d["jour"]       = pd.to_datetime(df_d["jour"])
            df_d["annee"]      = df_d["jour"].dt.year.astype("Int64")
            df_d["semestre"]   = ((df_d["jour"].dt.month-1)//6+1).astype("Int64")
            df_d["trimestre"]  = df_d["jour"].dt.quarter.astype("Int64")
            df_d["mois_num"]   = df_d["jour"].dt.month.astype("Int64")
            df_d["mois_nom"]   = df_d["mois_num"].map(MOIS_MAP)
            df_d["semaine"]    = df_d["jour"].dt.isocalendar().week.astype("Int64")
            df_d["jour_num"]   = df_d["jour"].dt.day.astype("Int64")
            df_d["jour_sem"]   = (df_d["jour"].dt.dayofweek+1).astype("Int64")
            df_d["annee_mois"] = df_d["jour"].dt.strftime("%Y-%m")
            df_d["date_debut"] = df_d["jour"]
            existing_d = set(dw_read(engine_dw,
                "SELECT DISTINCT DATE(date_debut) AS d FROM dim_temps WHERE date_debut IS NOT NULL"
            )["d"].astype(str).tolist())
            new_d = df_d[~df_d["jour"].dt.strftime("%Y-%m-%d").isin(existing_d)]
            if not new_d.empty:
                dw_write(new_d[["date_debut","annee","semestre","trimestre",
                                "mois_num","mois_nom","semaine","jour_num",
                                "jour_sem","annee_mois"]].rename(
                    columns={"jour_num":"jour","jour_sem":"jour_semaine"}),
                    "dim_temps", engine_dw)
        except Exception as e:
            print(f"    ⚠  dim_temps app {src_table}: {str(e)[:80]}")


def load_dim_ligne(engine_stg, engine_dw):
    de = dw_read(engine_dw, "SELECT equip_id, code_equipement, zone_id FROM dim_equipement")
    df = stg(engine_stg,
        "SELECT DISTINCT code_ligne, description FROM stg_clean_taux_dispo")
    if not df.empty:
        df = df.merge(de, left_on="code_ligne", right_on="code_equipement", how="left")
        dw_write(df[["code_ligne","description","zone_id","equip_id"]], "dim_ligne", engine_dw)


def load_dim_energie(engine_stg, engine_dw, engine_app=None):
    """
    dim_electricite : attributs du relevé (date, mois, phases kwh)
    dim_pv          : attributs (date, mois, puissance installée, cumulé)
    dim_eau         : attributs temporels (date, mois)
    Les MESURES vont dans les tables de faits.
    """
    import datetime as _dt

    def _enrich_date_cols(df, date_col):
        d = pd.to_datetime(df[date_col].astype(str))
        df["annee"]        = d.dt.year
        df["mois_num"]     = d.dt.month
        df["annee_mois"]   = d.dt.strftime("%Y-%m")
        df["jour"]         = d.dt.day
        df["semaine"]      = d.dt.isocalendar().week.astype(int)
        df["jour_semaine"] = d.dt.dayofweek + 1
        return df

    # ── dim_electricite — staging (données historiques PDF) ───────────────────
    df_e = stg(engine_stg, """
        SELECT date_releve::TEXT AS date_releve,
               SUM(phase1_kwh) AS phase1_kwh,
               SUM(phase2_kwh) AS phase2_kwh,
               SUM(phase3_kwh) AS phase3_kwh
        FROM stg_energie_electricite
        WHERE date_releve IS NOT NULL
        GROUP BY date_releve ORDER BY date_releve
    """)
    if not df_e.empty:
        df_e["date_releve"] = pd.to_datetime(df_e["date_releve"]).dt.date
        df_e = _enrich_date_cols(df_e, "date_releve")
        dw_write(df_e[["date_releve","annee_mois","annee","mois_num",
                        "jour","semaine","jour_semaine",
                        "phase1_kwh","phase2_kwh","phase3_kwh"]], "dim_electricite", engine_dw)

    # ── dim_electricite — eleonetech_db (nouvelles saisies web) ──────────────
    if engine_app is not None:
        existing_elec = set(dw_read(engine_dw,
            "SELECT date_releve::TEXT FROM dim_electricite")["date_releve"].tolist())
        df_e2 = app(engine_app, """
            SELECT date_releve, phase1 AS phase1_kwh,
                   phase2 AS phase2_kwh, phase3 AS phase3_kwh
            FROM consommation_electricite
            WHERE date_releve IS NOT NULL ORDER BY date_releve
        """)
        if not df_e2.empty:
            df_e2["date_releve"] = pd.to_datetime(df_e2["date_releve"]).dt.date
            df_e2 = df_e2[~df_e2["date_releve"].astype(str).isin(existing_elec)]
            if not df_e2.empty:
                df_e2 = _enrich_date_cols(df_e2, "date_releve")
                dw_write(df_e2[["date_releve","annee_mois","annee","mois_num",
                                "jour","semaine","jour_semaine",
                                "phase1_kwh","phase2_kwh","phase3_kwh"]], "dim_electricite", engine_dw)

    # ── dim_pv — staging ──────────────────────────────────────────────────────
    df_p = stg(engine_stg, """
        SELECT date::TEXT AS date_jour,
               NULLIF(puissance_installee_kwp,'')::NUMERIC  AS puissance_installee_kwp,
               NULLIF(production_cumulee_kwh,'')::NUMERIC   AS production_cumulee_kwh
        FROM stg_energie_photovoltaique
        WHERE date IS NOT NULL
          AND NULLIF(production_journaliere_kwh,'')::NUMERIC > 0
        ORDER BY date
    """)
    if not df_p.empty:
        df_p["date_jour"] = pd.to_datetime(df_p["date_jour"]).dt.strftime("%Y-%m-%d")
        df_p = _enrich_date_cols(df_p, "date_jour")
        df_p = df_p.sort_values("puissance_installee_kwp", ascending=False)
        df_p = df_p.drop_duplicates(subset=["date_jour"], keep="first")
        dw_write(df_p[["date_jour","annee_mois","annee","mois_num",
                        "jour","semaine","jour_semaine",
                        "puissance_installee_kwp","production_cumulee_kwh"]], "dim_pv", engine_dw)

    # ── dim_pv — eleonetech_db (nouvelles saisies web) ────────────────────────
    if engine_app is not None:
        existing_pv = set(dw_read(engine_dw,
            "SELECT date_jour::TEXT FROM dim_pv")["date_jour"].tolist())
        df_p2 = app(engine_app, """
            SELECT date AS date_jour, puissance_installee_kwp, production_cumulee_kwh
            FROM production_photovoltaique
            WHERE date IS NOT NULL AND production_journaliere_kwh > 0 ORDER BY date
        """)
        if not df_p2.empty:
            df_p2["date_jour"] = pd.to_datetime(df_p2["date_jour"]).dt.strftime("%Y-%m-%d")
            df_p2 = df_p2[~df_p2["date_jour"].isin(existing_pv)]
            if not df_p2.empty:
                df_p2 = _enrich_date_cols(df_p2, "date_jour")
                df_p2 = df_p2.drop_duplicates(subset=["date_jour"], keep="first")
                dw_write(df_p2[["date_jour","annee_mois","annee","mois_num",
                                "jour","semaine","jour_semaine",
                                "puissance_installee_kwp","production_cumulee_kwh"]], "dim_pv", engine_dw)

    # ── dim_eau — staging ─────────────────────────────────────────────────────
    df_w = stg(engine_stg, """
        SELECT DISTINCT date_releve::TEXT AS date_releve
        FROM stg_energie_eau
        WHERE date_releve IS NOT NULL ORDER BY date_releve
    """)
    if not df_w.empty:
        df_w["date_releve"] = pd.to_datetime(df_w["date_releve"]).dt.date
        df_w = _enrich_date_cols(df_w, "date_releve")
        dw_write(df_w[["date_releve","annee_mois","annee","mois_num",
                        "jour","semaine","jour_semaine"]], "dim_eau", engine_dw)

    # ── dim_eau — eleonetech_db (nouvelles saisies web) ───────────────────────
    if engine_app is not None:
        existing_eau = set(dw_read(engine_dw,
            "SELECT date_releve::TEXT FROM dim_eau")["date_releve"].tolist())
        df_w2 = app(engine_app, """
            SELECT DISTINCT date_releve FROM consommation_eau
            WHERE date_releve IS NOT NULL ORDER BY date_releve
        """)
        if not df_w2.empty:
            df_w2["date_releve"] = pd.to_datetime(df_w2["date_releve"]).dt.date
            df_w2 = df_w2[~df_w2["date_releve"].astype(str).isin(existing_eau)]
            if not df_w2.empty:
                df_w2 = _enrich_date_cols(df_w2, "date_releve")
                dw_write(df_w2[["date_releve","annee_mois","annee","mois_num",
                                "jour","semaine","jour_semaine"]], "dim_eau", engine_dw)

def load_fact_ot_global(engine_stg, engine_dw, engine_app=None):
    df_ot = stg(engine_stg, """
        SELECT r.annee::SMALLINT AS annee, r.mois_num::SMALLINT AS mois_num,
               ROUND(r.nb_ot_total::NUMERIC)::INTEGER  AS nb_ot_total,
               ROUND(r.nb_curatif::NUMERIC)::INTEGER   AS nb_ot_curatif,
               ROUND(r.nb_preventif::NUMERIC)::INTEGER AS nb_ot_preventif,
               r.ratio_preventif_pct::NUMERIC          AS ratio_preventif_pct
        FROM stg_ratio_intervention r
        WHERE r.nb_ot_total IS NOT NULL AND r.nb_ot_total != ''
    """)
    df_sit = stg(engine_stg, f"""
        SELECT s.annee::SMALLINT AS annee,
               {MOIS_SQL.format(col='s.mois')} AS mois_num,
               SUM(COALESCE(ROUND(NULLIF(s.ot_lance_prev,'')::NUMERIC)::INT,0) +
                   COALESCE(ROUND(NULLIF(s.ot_lance_cura,'')::NUMERIC)::INT,0)) AS lances,
               SUM(COALESCE(ROUND(NULLIF(s.ot_honore_prev,'')::NUMERIC)::INT,0) +
                   COALESCE(ROUND(NULLIF(s.ot_honore_cura,'')::NUMERIC)::INT,0)) AS honores
        FROM stg_situation_mensuelle s WHERE UPPER(s.entite)='SG'
        GROUP BY s.annee, s.mois
    """)
    if df_ot.empty:
        return
    df_ot["annee_mois"] = df_ot.apply(
        lambda r: f"{int(r.annee):04d}-{int(r.mois_num):02d}", axis=1)
    if not df_sit.empty:
        df_sit = df_sit.dropna(subset=["mois_num"])
        df_sit["annee_mois"]  = df_sit.apply(
            lambda r: f"{int(r.annee):04d}-{int(r.mois_num):02d}", axis=1)
        df_sit["nb_ot_honore"]= df_sit["honores"]
        df_ot = df_ot.merge(df_sit[["annee_mois","nb_ot_honore"]], on="annee_mois", how="left")
        df_ot["taux_realisation_pct"] = df_ot.apply(
            lambda r: round(r.nb_ot_honore/r.nb_ot_total*100,2)
                      if pd.notna(r.nb_ot_honore) and r.nb_ot_total > 0
                      else None, axis=1)
    else:
        df_ot["nb_ot_honore"] = df_ot["taux_realisation_pct"] = None

    dt  = dw_read(engine_dw,
        "SELECT temps_id, annee_mois FROM dim_temps WHERE annee_mois IS NOT NULL")
    dt_u = dt.drop_duplicates(subset=["annee_mois"])
    df_ot = df_ot.merge(dt_u, on="annee_mois", how="inner")
    df_ot["nb_ot_autre"] = (df_ot["nb_ot_total"].fillna(0).astype(int)
                            - df_ot["nb_ot_curatif"].fillna(0).astype(int)
                            - df_ot["nb_ot_preventif"].fillna(0).astype(int)).clip(lower=0)
    dw_write(df_ot[["temps_id","nb_ot_total","nb_ot_curatif",
                    "nb_ot_preventif","nb_ot_autre","nb_ot_honore",
                    "taux_realisation_pct","ratio_preventif_pct"]], "fact_ot_global", engine_dw)

    # Supplement: interventions depuis eleonetech_db pour les mois non couverts par staging
    if engine_app is not None:
        df_int = app(engine_app, """
            SELECT TO_CHAR(date_intervention, 'YYYY-MM') AS annee_mois,
                   COUNT(*)::INTEGER AS nb_ot_total,
                   COUNT(*) FILTER (WHERE type_intervention = 'Curative')::INTEGER  AS nb_ot_curatif,
                   COUNT(*) FILTER (WHERE type_intervention = 'Preventive')::INTEGER AS nb_ot_preventif,
                   COUNT(*) FILTER (WHERE statut = 'Terminee')::INTEGER AS nb_ot_honore
            FROM interventions
            WHERE date_intervention IS NOT NULL
            GROUP BY TO_CHAR(date_intervention, 'YYYY-MM')
            ORDER BY annee_mois
        """)
        if not df_int.empty:
            dt2 = dw_read(engine_dw, "SELECT temps_id, annee_mois FROM dim_temps WHERE annee_mois IS NOT NULL")
            already = dw_read(engine_dw, "SELECT t.annee_mois FROM fact_ot_global f JOIN dim_temps t ON t.temps_id = f.temps_id")
            dt2_u = dt2.drop_duplicates(subset=["annee_mois"])
            df_int = df_int[~df_int["annee_mois"].isin(already["annee_mois"])]
            df_int = df_int.merge(dt2_u, on="annee_mois", how="inner")
            if not df_int.empty:
                df_int["nb_ot_autre"] = (df_int["nb_ot_total"] - df_int["nb_ot_curatif"] - df_int["nb_ot_preventif"]).clip(lower=0)
                df_int["taux_realisation_pct"] = (df_int["nb_ot_honore"] / df_int["nb_ot_total"].replace(0, np.nan) * 100).round(2)
                df_int["ratio_preventif_pct"]  = (df_int["nb_ot_preventif"] / df_int["nb_ot_total"].replace(0, np.nan) * 100).round(2)
                dw_write(df_int[["temps_id","nb_ot_total","nb_ot_curatif","nb_ot_preventif",
                                 "nb_ot_autre","nb_ot_honore","taux_realisation_pct",
                                 "ratio_preventif_pct"]], "fact_ot_global", engine_dw)


def load_fact_intervention(engine_stg, engine_dw):
    dt  = dw_read(engine_dw, "SELECT temps_id, annee_mois FROM dim_temps WHERE annee_mois IS NOT NULL")
    de  = dw_read(engine_dw, "SELECT employe_id, matricule FROM dim_employe")
    deq = dw_read(engine_dw, "SELECT equip_id, code_equipement FROM dim_equipement")
    di  = dw_read(engine_dw, "SELECT id_inter, numero_ot FROM dim_intervention")
    df  = stg(engine_stg, """
        SELECT numero_ot, matricule, code_equipement,
               type_intervention,
               annee_mois,
               COALESCE(hrs_travaux,0) AS duree_h
        FROM stg_clean_charges
        WHERE numero_ot IS NOT NULL AND matricule IS NOT NULL
          AND annee_mois IS NOT NULL
    """)
    if df.empty:
        return
    dt_u = dt.drop_duplicates(subset=["annee_mois"])
    # deq contient les 710 codes longs (EOT...) + 8 codes courts (ESD/ELECT...)
    # merge left → equip_id NULL si code pas dans dim_equipement
    df = df.merge(dt_u, on="annee_mois",     how="inner")
    df = df.merge(de,   on="matricule",       how="inner")
    df = df.merge(deq,  on="code_equipement", how="left")
    df = df.merge(di,   on="numero_ot",       how="left")
    df = df.rename(columns={"duree_h":"duree_intervention_h"})
    # zone depuis dim_equipement (inclus dans deq déjà chargé)
    deq_full = dw_read(engine_dw, "SELECT equip_id, zone_id FROM dim_equipement")
    df = df.merge(deq_full.rename(columns={"zone_id":"zone_eq","equip_id":"eid2"}),
                  left_on="equip_id", right_on="eid2", how="left")
    df["zone_id"] = df["zone_eq"]
    df = df.dropna(subset=["id_inter"]).drop_duplicates(subset=["id_inter"])
    dw_write(df[["temps_id","equip_id","employe_id","zone_id","id_inter",
                 "type_intervention","duree_intervention_h"]], "fact_intervention", engine_dw)


def load_fact_pdr(engine_stg, engine_dw):
    """
    fact_pdr : 1 ligne/mouvement PDR
    Clés : temps_id, prc_id (pas de zone_id ni equip_id - PDR pas lié à équipement spécifique)
    Mesures : quantite_sortie INTEGER, stock_final INTEGER, valeur_consommee_tnd
    """
    df = stg(engine_stg, """
        SELECT m.annee_mois, m.code_prc,
               SUM(CASE WHEN m.direction='sortie'
                   THEN ABS(COALESCE(m.qtypcu,0)) ELSE 0 END) AS qtite_sortie,
               MAX(COALESCE(m.aftsto,0))                       AS stock_final
        FROM stg_clean_prc_mouvements m
        WHERE m.annee_mois IS NOT NULL AND m.code_prc IS NOT NULL
          AND m.qtypcu IS NOT NULL
        GROUP BY m.annee_mois, m.code_prc
    """)
    if df.empty:
        return
    dt = dw_read(engine_dw, "SELECT temps_id, annee_mois FROM dim_temps WHERE annee_mois IS NOT NULL")
    dp = dw_read(engine_dw, "SELECT prc_id, code_prc, cout_unitaire_tnd FROM dim_prc")
    dt_u = dt.drop_duplicates(subset=["annee_mois"])
    df = df.merge(dt_u, on="annee_mois", how="inner")
    df = df.merge(dp,   on="code_prc",   how="inner")
    df["quantite_sortie"]      = df["qtite_sortie"].fillna(0).round(0).astype(int)
    df["stock_final"]          = df["stock_final"].fillna(0).round(0).astype(int)
    df["valeur_consommee_tnd"] = (df["quantite_sortie"] * df["cout_unitaire_tnd"].fillna(0)).round(3)
    dw_write(df[["temps_id","prc_id","quantite_sortie","stock_final","valeur_consommee_tnd"]],
             "fact_pdr", engine_dw)

def diagnose_code_mapping(engine_stg):
    """
    Diagnostic query: find all code_ligne values in stg_clean_taux_dispo
    that have NO matching code_equipement in stg_clean_charges.
    Also reports OTs with NULL code_equipement (unresolved regex).
    """
    print("\n    ── Diagnostic code_ligne / code_equipement ──────────")

    lines = stg(engine_stg,
        "SELECT DISTINCT code_ligne FROM stg_clean_taux_dispo WHERE code_ligne IS NOT NULL")
    equips = stg(engine_stg,
        "SELECT DISTINCT code_equipement FROM stg_clean_charges WHERE code_equipement IS NOT NULL")

    matched   = set(lines["code_ligne"]) & set(equips["code_equipement"])
    unmatched = set(lines["code_ligne"]) - set(equips["code_equipement"])

    print(f"    code_ligne total        : {len(lines)}")
    print(f"    code_equipement total   : {len(equips)}")
    print(f"    Direct matches          : {len(matched)}")
    print(f"    Unmatched code_ligne    : {len(unmatched)}")
    if unmatched:
        for code in sorted(unmatched):
            print(f"      NO_MATCH → {code}")

    # OTs with NULL code_equipement (unresolved regex mapping)
    df_null = stg(engine_stg, """
        SELECT annee_mois,
               COUNT(*)                          AS nb_ots_null_code,
               SUM(COALESCE(hrs_travaux, 0))     AS hrs_perdue
        FROM stg_clean_charges
        WHERE code_equipement IS NULL
          AND type_intervention = 'CURA'
        GROUP BY annee_mois
        ORDER BY annee_mois
    """)
    if not df_null.empty:
        print(f"\n    OTs CURA avec code_equipement NULL (heures non allouées) :")
        for _, r in df_null.iterrows():
            print(f"      {r.annee_mois}  →  {int(r.nb_ots_null_code)} OTs  "
                  f"({float(r.hrs_perdue):.1f} h perdues)")
    else:
        print("    ✓ Aucun OT CURA avec code_equipement NULL")

    return unmatched


def audit_fact_arret(engine_dw):
    """
    Audit NULLs in fact_arret and return count of rows needing fix.
    """
    print("\n    ── Audit fact_arret ──────────────────────────────────")
    df = dw_read(engine_dw, """
        SELECT
            COUNT(*)                                                         AS total,
            COUNT(*) FILTER (WHERE nb_arrets > 0)                           AS with_arrets,
            COUNT(*) FILTER (WHERE t_arret         IS NULL)                 AS null_ttr,
            COUNT(*) FILTER (WHERE mttr_h          IS NULL)                 AS null_mttr,
            COUNT(*) FILTER (WHERE mtbf_h          IS NULL)                 AS null_mtbf,
            COUNT(*) FILTER (WHERE disponibilite_pct IS NULL)               AS null_dispo,
            COUNT(*) FILTER (WHERE nb_arrets > 0 AND t_arret IS NULL)       AS arrets_null_ttr
        FROM fact_arret
    """)
    row = df.iloc[0]
    print(f"    Total rows          : {int(row['total'])}")
    print(f"    Rows nb_arrets > 0  : {int(row['with_arrets'])}")
    print(f"    NULL t_arret        : {int(row['null_ttr'])}")
    print(f"    NULL mttr_h         : {int(row['null_mttr'])}")
    print(f"    NULL mtbf_h         : {int(row['null_mtbf'])}")
    print(f"    NULL dispo          : {int(row['null_dispo'])}")
    print(f"    nb_arrets>0 & NULL  : {int(row['arrets_null_ttr'])}  ← rows to fix")
    return int(row['null_ttr']) + int(row['null_mttr']) + int(row['null_mtbf'])


def fix_fact_arret_nulls(engine_dw):
    """
    Fix existing NULL rows in fact_arret using data already stored in the table.
    When t_arret IS NULL → set to 0,
    then recompute MTTR / MTBF / disponibilite_pct.
    Mathematical identity: dispo = (t_ouv - ttr) / t_ouv * 100
    (holds because MTBF/(MTBF+MTTR) = (t-ttr)/nb / (t/nb) = (t-ttr)/t)
    """
    print("\n    ── Fixing NULL rows in fact_arret ────────────────────")
    with engine_dw.begin() as c:
        result = c.execute(text("""
            UPDATE fact_arret
            SET
                t_arret = COALESCE(t_arret, 0),

                nb_ot_curatif = COALESCE(nb_ot_curatif, 0),

                mttr_h = CASE
                    WHEN nb_arrets <= 0 THEN 0.0
                    ELSE ROUND(
                        COALESCE(t_arret, 0)::NUMERIC / NULLIF(nb_arrets, 0),
                        4)
                END,

                mtbf_h = CASE
                    WHEN nb_arrets <= 0 THEN duree_ouverture_h
                    ELSE ROUND(
                        GREATEST(duree_ouverture_h - COALESCE(t_arret, 0), 0)::NUMERIC
                        / NULLIF(nb_arrets, 0),
                        4)
                END,

                disponibilite_pct = CASE
                    WHEN nb_arrets <= 0      THEN 100.0
                    WHEN duree_ouverture_h IS NULL
                      OR duree_ouverture_h = 0 THEN 0.0
                    ELSE ROUND(
                        GREATEST(duree_ouverture_h - COALESCE(t_arret, 0), 0)
                        / duree_ouverture_h * 100,
                        2)
                END

            WHERE t_arret         IS NULL
               OR mttr_h          IS NULL
               OR mtbf_h          IS NULL
               OR disponibilite_pct IS NULL
        """))
        fixed = result.rowcount
    print(f"    ✓ {fixed} rows fixed in fact_arret")
    return fixed


def load_fact_arret(engine_stg, engine_dw):
    # ── 1. Load taux_dispo (source of truth for lines, t_ouverture, nb_arret)
    df_taux = stg(engine_stg, """
        SELECT td.code_ligne,
               td.annee_mois,
               td.t_ouverture::NUMERIC AS t_ouverture,
               COALESCE(td.t_arret, 0)::NUMERIC AS t_arret,
               COALESCE(td.nb_arret, 0)::NUMERIC AS nb_arret
        FROM stg_clean_taux_dispo td
        WHERE td.code_ligne   IS NOT NULL
          AND td.t_ouverture  IS NOT NULL
          AND td.annee_mois   IS NOT NULL
    """)
    if df_taux.empty:
        print("    ⚠  fact_arret: stg_clean_taux_dispo vide, abandon")
        return

    df_taux = df_taux.dropna(subset=["annee_mois", "t_ouverture"])

    # ── 2. Load curative hours (only rows with non-NULL code_equipement)
    # nb_ot_curatif uniquement — sum_ttr_h écarté (mapping code_ligne/code_equipement
    # incompatible : codes courts PDF vs codes longs charges → t_arret du PDF utilisé à la place)
    df_ttr = stg(engine_stg, """
        SELECT code_equipement,
               annee_mois,
               COUNT(*)::INTEGER AS nb_ot_curatif
        FROM stg_clean_charges
        WHERE type_intervention = 'CURA'
          AND annee_mois        IS NOT NULL
          AND code_equipement   IS NOT NULL
        GROUP BY code_equipement, annee_mois
    """)

    # ── 3. Log OTs with NULL code_equipement (unresolved regex — hours lost)
    df_null_codes = stg(engine_stg, """
        SELECT annee_mois,
               COUNT(*)                       AS nb_ots,
               SUM(COALESCE(hrs_travaux, 0))  AS hrs_non_allouees
        FROM stg_clean_charges
        WHERE type_intervention = 'CURA'
          AND code_equipement   IS NULL
          AND annee_mois        IS NOT NULL
        GROUP BY annee_mois
    """)
    if not df_null_codes.empty:
        total_lost = df_null_codes["hrs_non_allouees"].sum()
        print(f"    ⚠  {len(df_null_codes)} mois avec OTs CURA sans code_equipement "
              f"({total_lost:.1f} h non allouées — vérifier le mapping regex dans extract.py)")

    # ── 4. Merge: LEFT JOIN so every line/month row is kept even with no curative OT
    df = df_taux.merge(
        df_ttr,
        left_on=["code_ligne", "annee_mois"],
        right_on=["code_equipement", "annee_mois"],
        how="left"
    )

    # ── 5. Detect and log unmatched code_ligne values
    unmatched_mask = df["code_equipement"].isna() & (df["nb_arret"] > 0)
    if unmatched_mask.any():
        unmatched_codes = df.loc[unmatched_mask, "code_ligne"].unique()
        print(f"    ⚠  {len(unmatched_codes)} code_ligne sans correspondance dans "
              f"stg_clean_charges (nb_ot_curatif = 0 par défaut) :")
        for code in sorted(unmatched_codes):
            print(f"         NO_MATCH → {code}")

    # ── 6. COALESCE safety: any NULL after the LEFT JOIN → 0
    df["nb_ot_curatif"] = pd.to_numeric(df["nb_ot_curatif"], errors="coerce").fillna(0).astype(int)
    df["nb_arret"]      = pd.to_numeric(df["nb_arret"],      errors="coerce").fillna(0.0)
    df["nb_arrets"]     = df["nb_arret"].round(0).astype(int)
    df["t_arret"]       = pd.to_numeric(df["t_arret"],       errors="coerce").fillna(0.0)

    # ── 7. Calcul MTBF / MTTR / disponibilité depuis les données réelles
    #       t_arret  → durée totale d'arrêt depuis stg_clean_taux_dispo (PDF Coswin)
    #       MTTR     → t_arret / nb_arret
    #       MTBF     → (t_ouverture - t_arret) / nb_arret
    #       dispo    → (t_ouverture - t_arret) / t_ouverture × 100
    t   = df["t_ouverture"].astype(float)
    nb  = df["nb_arret"].astype(float)
    ttr = df["t_arret"].astype(float)

    has_arret = nb > 0

    # MTTR = t_arret / nb_arret · 0 si aucun arrêt
    df["mttr_h"] = np.where(
        has_arret,
        np.round(ttr / nb.replace(0, np.nan), 4),
        0.0
    )

    # MTBF = (t_ouverture - t_arret) / nb_arret · = t_ouverture si aucun arrêt
    df["mtbf_h"] = np.where(
        has_arret,
        np.round(np.maximum(t - ttr, 0) / nb.replace(0, np.nan), 4),
        np.round(t, 2)
    )

    # disponibilité = (t_ouverture - t_arret) / t_ouverture × 100
    # 100% si aucun arrêt · 0% uniquement si t_ouverture = 0
    df["disponibilite_pct"] = np.where(
        ~has_arret,
        100.0,
        np.where(
            t > 0,
            np.round(np.maximum(t - ttr, 0) / t * 100, 2),
            0.0
        )
    )

    # ── 8. Resolve DW foreign keys
    dt = dw_read(engine_dw,
        "SELECT temps_id, annee_mois FROM dim_temps WHERE annee_mois IS NOT NULL")
    dl = dw_read(engine_dw,
        "SELECT ligne_id, code_ligne, zone_id, equip_id FROM dim_ligne")

    dt_u = dt.sort_values("temps_id").drop_duplicates(subset=["annee_mois"], keep="first")

    df = df.merge(dt_u, on="annee_mois", how="inner")
    df = df.merge(dl,   on="code_ligne",  how="inner")
    df = df.rename(columns={"t_ouverture": "duree_ouverture_h"})

    cols = ["temps_id", "ligne_id", "zone_id", "equip_id",
            "duree_ouverture_h", "t_arret", "nb_arrets", "nb_ot_curatif",
            "mttr_h", "mtbf_h", "disponibilite_pct"]
    df = df[cols].drop_duplicates(subset=["temps_id", "ligne_id"])

    # ── 9. ROOT CAUSE 1 FIX: force-delete existing rows for these months
    #       so re-runs always produce fresh data (no incremental skip)
    months_to_reload = df["temps_id"].unique().tolist()
    if months_to_reload:
        with engine_dw.begin() as c:
            c.execute(text(
                "DELETE FROM fact_arret WHERE temps_id = ANY(:ids)"),
                {"ids": months_to_reload}
            )
        print(f"    → fact_arret: {len(months_to_reload)} temps_id purgés avant re-insert")

    print(f"    → fact_arret: {len(df)} lignes à insérer")
    dw_write(df, "fact_arret", engine_dw)


def load_fact_energie(engine_stg, engine_dw, engine_app=None):
    """
    fact_energie_elec : mesures conso_jour_kwh, cout_jour_tnd
    fact_energie_eau  : mesure conso_jour_m3 (cout GENERATED)
    fact_energie_pv   : mesures production_kwh, heures_equiv_h (valeur GENERATED)
    Jointure via dim_* sur la date (TEXT comparaison pour éviter type mismatch)
    temps_id optionnel (LEFT JOIN)
    """
    sg_id = int(dw_read(engine_dw,
        "SELECT zone_id FROM dim_zone WHERE code_zone='BAT'")["zone_id"].iloc[0])

    # dim_temps journalier (passe C) pour temps_id optionnel
    dt_day = dw_read(engine_dw, """
        SELECT temps_id,
               DATE(date_debut)::TEXT AS jour_str
        FROM dim_temps
        WHERE date_debut IS NOT NULL
    """).drop_duplicates(subset=["jour_str"])

    # ── fact_energie_elec — staging (données historiques) ────────────────────
    df_e = stg(engine_stg, """
        SELECT date_releve::TEXT AS date_releve,
               SUM(consommation_jour_kwh) AS conso_jour_kwh,
               SUM(cout_jour_tnd)         AS cout_jour_tnd
        FROM stg_energie_electricite
        WHERE date_releve IS NOT NULL AND consommation_jour_kwh IS NOT NULL
        GROUP BY date_releve ORDER BY date_releve
    """)
    if not df_e.empty:
        dee = dw_read(engine_dw, "SELECT elec_id, date_releve::TEXT AS date_releve FROM dim_electricite")
        df_e = df_e.merge(dee, on="date_releve", how="inner")
        df_e = df_e.merge(dt_day, left_on="date_releve", right_on="jour_str", how="left")
        df_e["zone_id"] = sg_id
        dw_write(df_e[["elec_id","temps_id","zone_id",
                        "conso_jour_kwh","cout_jour_tnd"]], "fact_energie_elec", engine_dw)

    # ── fact_energie_elec — eleonetech_db (nouvelles saisies web) ────────────
    if engine_app is not None:
        already_elec = set(dw_read(engine_dw,
            "SELECT de.date_releve::TEXT FROM fact_energie_elec f JOIN dim_electricite de ON de.elec_id = f.elec_id"
        )["date_releve"].tolist())
        df_e2 = app(engine_app, """
            SELECT date_releve::TEXT AS date_releve,
                   consommation_jour AS conso_jour_kwh,
                   cout_total        AS cout_jour_tnd
            FROM consommation_electricite
            WHERE date_releve IS NOT NULL AND consommation_jour IS NOT NULL
            ORDER BY date_releve
        """)
        if not df_e2.empty:
            df_e2 = df_e2[~df_e2["date_releve"].isin(already_elec)]
            if not df_e2.empty:
                dee2 = dw_read(engine_dw, "SELECT elec_id, date_releve::TEXT AS date_releve FROM dim_electricite")
                df_e2 = df_e2.merge(dee2, on="date_releve", how="inner")
                df_e2 = df_e2.merge(dt_day, left_on="date_releve", right_on="jour_str", how="left")
                df_e2["zone_id"] = sg_id
                dw_write(df_e2[["elec_id","temps_id","zone_id",
                                "conso_jour_kwh","cout_jour_tnd"]], "fact_energie_elec", engine_dw)

    # ── fact_energie_eau — staging (données historiques) ─────────────────────
    df_w = stg(engine_stg, """
        SELECT date_releve::TEXT AS date_releve,
               SUM(consommation_jour_m3) AS conso_jour_m3
        FROM stg_energie_eau
        WHERE date_releve IS NOT NULL AND consommation_jour_m3 IS NOT NULL
        GROUP BY date_releve ORDER BY date_releve
    """)
    if not df_w.empty:
        dew = dw_read(engine_dw, "SELECT eau_id, date_releve::TEXT AS date_releve FROM dim_eau")
        df_w = df_w.merge(dew, on="date_releve", how="inner")
        df_w = df_w.merge(dt_day, left_on="date_releve", right_on="jour_str", how="left")
        df_w["zone_id"] = sg_id
        dw_write(df_w[["eau_id","temps_id","zone_id","conso_jour_m3"]],
                 "fact_energie_eau", engine_dw)

    # ── fact_energie_eau — eleonetech_db (nouvelles saisies web) ─────────────
    if engine_app is not None:
        already_eau = set(dw_read(engine_dw,
            "SELECT deau.date_releve::TEXT FROM fact_energie_eau f JOIN dim_eau deau ON deau.eau_id = f.eau_id"
        )["date_releve"].tolist())
        df_w2 = app(engine_app, """
            SELECT date_releve::TEXT AS date_releve,
                   consommation_jour AS conso_jour_m3
            FROM consommation_eau
            WHERE date_releve IS NOT NULL AND consommation_jour IS NOT NULL AND consommation_jour >= 0
            ORDER BY date_releve
        """)
        if not df_w2.empty:
            df_w2 = df_w2[~df_w2["date_releve"].isin(already_eau)]
            if not df_w2.empty:
                dew2 = dw_read(engine_dw, "SELECT eau_id, date_releve::TEXT AS date_releve FROM dim_eau")
                df_w2 = df_w2.merge(dew2, on="date_releve", how="inner")
                df_w2 = df_w2.merge(dt_day, left_on="date_releve", right_on="jour_str", how="left")
                df_w2["zone_id"] = sg_id
                dw_write(df_w2[["eau_id","temps_id","zone_id","conso_jour_m3"]],
                         "fact_energie_eau", engine_dw)

    # ── fact_energie_pv — staging (données historiques) ──────────────────────
    df_p = stg(engine_stg, """
        SELECT date::TEXT AS date_jour,
               NULLIF(production_journaliere_kwh,'')::NUMERIC AS production_kwh,
               NULLIF(heures_equivalentes_h,'')::NUMERIC      AS heures_equiv_h
        FROM stg_energie_photovoltaique
        WHERE date IS NOT NULL
          AND NULLIF(production_journaliere_kwh,'')::NUMERIC > 0
        ORDER BY date
    """)
    if not df_p.empty:
        dpv = dw_read(engine_dw, "SELECT pv_id, date_jour::TEXT AS date_jour FROM dim_pv")
        df_p = df_p.merge(dpv, on="date_jour", how="inner")
        df_p = df_p.merge(dt_day, left_on="date_jour", right_on="jour_str", how="left")
        df_p["zone_id"] = sg_id
        dw_write(df_p[["pv_id","temps_id","zone_id",
                        "production_kwh","heures_equiv_h"]], "fact_energie_pv", engine_dw)

    # ── fact_energie_pv — eleonetech_db (nouvelles saisies web) ──────────────
    if engine_app is not None:
        already_pv = set(dw_read(engine_dw,
            "SELECT dpv.date_jour::TEXT FROM fact_energie_pv f JOIN dim_pv dpv ON dpv.pv_id = f.pv_id"
        )["date_jour"].tolist())
        df_p2 = app(engine_app, """
            SELECT date::TEXT AS date_jour,
                   production_journaliere_kwh AS production_kwh,
                   heures_equivalentes_h      AS heures_equiv_h
            FROM production_photovoltaique
            WHERE date IS NOT NULL AND production_journaliere_kwh > 0
            ORDER BY date
        """)
        if not df_p2.empty:
            df_p2 = df_p2[~df_p2["date_jour"].isin(already_pv)]
            if not df_p2.empty:
                dpv2 = dw_read(engine_dw, "SELECT pv_id, date_jour::TEXT AS date_jour FROM dim_pv")
                df_p2 = df_p2.merge(dpv2, on="date_jour", how="inner")
                df_p2 = df_p2.merge(dt_day, left_on="date_jour", right_on="jour_str", how="left")
                df_p2["zone_id"] = sg_id
                dw_write(df_p2[["pv_id","temps_id","zone_id",
                                "production_kwh","heures_equiv_h"]], "fact_energie_pv", engine_dw)

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 65)
    print("  LOAD DW — Eleonetech  (architecture 7 faits)")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    engine_stg = get_engine(DB_STAGING)
    engine_dw  = get_engine(DB_DW)
    engine_app = get_engine(DB_APP)

    for eng, name in [(engine_stg, DB_STAGING), (engine_dw, DB_DW)]:
        try:
            with eng.connect() as c:
                c.execute(text("SELECT 1"))
            print(f"  ✓  Connexion {name}")
        except Exception as e:
            print(f"  ✗  {name}: {e}"); return

    # Connexion eleonetech_db optionnelle (non bloquante)
    try:
        with engine_app.connect() as c:
            c.execute(text("SELECT 1"))
        print(f"  ✓  Connexion {DB_APP}")
    except Exception as e:
        print(f"  ⚠  {DB_APP} indisponible — données web ignorées: {e}")
        engine_app = None

    print("\n  ── DDL ─────────────────────────────────────────────")
    run_sql(engine_dw, DW_DROP, "DROP")
    _, err = run_sql(engine_dw, DW_DDL, "DDL")
    print(f"  DDL : {'✓' if err==0 else f'⚠ {err} erreurs'}")
    run_sql(engine_dw, DW_SEED, "SEED")
    print("  Zones : ✓")

    print("\n  ── DIMENSIONS ──────────────────────────────────────")
    print("  [1] dim_employe");        load_dim_employe(engine_stg, engine_dw, engine_app)
    print("  [2] dim_equipement");     load_dim_equipement(engine_stg, engine_dw, engine_app)
    print("  [3] dim_prc");            load_dim_prc(engine_stg, engine_dw, engine_app)
    print("  [4] dim_intervention");   load_dim_intervention(engine_stg, engine_dw)
    print("  [5] dim_temps");          load_dim_temps(engine_stg, engine_dw, engine_app)
    print("  [6] dim_ligne");          load_dim_ligne(engine_stg, engine_dw)
    print("  [7] dim_electricite / dim_pv / dim_eau")
    load_dim_energie(engine_stg, engine_dw, engine_app)

    print("\n  ── FAITS ───────────────────────────────────────────")
    print("  [8]  fact_ot_global");          load_fact_ot_global(engine_stg, engine_dw, engine_app)
    print("  [9]  fact_intervention");       load_fact_intervention(engine_stg, engine_dw)
    print("  [10] fact_pdr");                load_fact_pdr(engine_stg, engine_dw)
    print("  [11] fact_arret")
    print("  [11a] diagnose_code_mapping"); diagnose_code_mapping(engine_stg)
    load_fact_arret(engine_stg, engine_dw)
    print("  [11b] audit_fact_arret");      audit_fact_arret(engine_dw)
    print("  [11c] fix_fact_arret_nulls");  fix_fact_arret_nulls(engine_dw)
    print("  [12] fact_energie_elec/eau/pv");load_fact_energie(engine_stg, engine_dw, engine_app)

    print("\n  ── VUES ────────────────────────────────────────────")
    _, err_v = run_sql(engine_dw, DW_VIEWS, "VIEWS")
    print(f"  Vues : {'✓' if err_v==0 else f'⚠ {err_v} erreurs'}")

    # Vérification finale
    print("\n" + "=" * 65)
    print("  VÉRIFICATION FINALE")
    print("=" * 65)
    tables = [
        "dim_temps","dim_zone","dim_equipement","dim_ligne",
        "dim_prc","dim_employe","dim_intervention",
        "dim_electricite","dim_pv","dim_eau",
        "fact_ot_global","fact_intervention","fact_pdr","fact_arret",
        "fact_energie_elec","fact_energie_eau","fact_energie_pv",
    ]
    with engine_dw.connect() as c:
        for t in tables:
            try:
                n = c.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
                print(f"  {'✓' if n>0 else '⚠'}  {t:<40} {n:>6}")
            except Exception as ex:
                print(f"  ✗  {t}: {str(ex)[:50]}")

        # Vérification intégrité référentielle
        print("\n  Intégrité référentielle :")
        checks = [
            ("fact_intervention","equip_id","dim_equipement","equip_id"),
            ("fact_intervention","employe_id","dim_employe","employe_id"),
            ("fact_intervention","temps_id","dim_temps","temps_id"),
            ("fact_arret","temps_id","dim_temps","temps_id"),
            ("fact_arret","ligne_id","dim_ligne","ligne_id"),
            ("fact_energie_elec","elec_id","dim_electricite","elec_id"),
            ("fact_energie_eau","eau_id","dim_eau","eau_id"),
            ("fact_energie_pv","pv_id","dim_pv","pv_id"),
        ]
        for fact, fk, dim, pk in checks:
            try:
                n = c.execute(text(f"""
                    SELECT COUNT(*) FROM {fact} f
                    WHERE f.{fk} IS NOT NULL
                      AND NOT EXISTS (
                          SELECT 1 FROM {dim} d WHERE d.{pk} = f.{fk})
                """)).scalar()
                icon = "✓" if n == 0 else "✗"
                print(f"  {icon}  {fact}.{fk} → {dim} : {n} orphelins")
            except Exception as ex:
                print(f"  ?  {fact}.{fk}: {str(ex)[:50]}")

    print(f"\n  Terminé : {datetime.now().strftime('%H:%M:%S')}")


if __name__ == "__main__":
    main()