import numpy as np
import pandas as pd
import warnings
from pathlib import Path
from datetime import datetime
from sqlalchemy import create_engine, text

warnings.filterwarnings("ignore")

# ── Config ────────────────────────────────────────────────────────────────────
DB_HOST     = "localhost"
DB_PORT     = 5432
DB_USER     = "postgres"
DB_PASSWORD = "postgres123@"
DB_STAGING  = "eleonetech_staging"

BASE_DIR = Path(__file__).parent
RAW_DIR  = BASE_DIR / "output"


def get_engine():
    if DB_PASSWORD:
        url = f"postgresql+psycopg2://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_STAGING}"
    else:
        url = f"postgresql+psycopg2://{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_STAGING}"
    return create_engine(url)


# ── DDL staging ───────────────────────────────────────────────────────────────

STAGING_SQL = """
CREATE TABLE IF NOT EXISTS stg_charges_employes (
    id TEXT,matricule TEXT,nom_prenom TEXT,numero_ot TEXT,
    type_intervention TEXT,code_equipement TEXT,
    description_equipement TEXT,date_debut TEXT,hrs_travaux TEXT,
    periode_debut TEXT,periode_fin TEXT,annee TEXT,
    total_hrs_employe TEXT,created_at TEXT);

CREATE TABLE IF NOT EXISTS stg_ratio_intervention (
    id TEXT,annee TEXT,mois TEXT,mois_num TEXT,nb_ot_total TEXT,
    temp_intervention_total TEXT,nb_curatif TEXT,temp_curatif TEXT,
    ratio_curatif_pct TEXT,nb_preventif TEXT,temp_preventif TEXT,
    ratio_preventif_pct TEXT,created_at TEXT);

CREATE TABLE IF NOT EXISTS stg_situation_mensuelle (
    id TEXT,annee TEXT,mois TEXT,mois_num TEXT,entite TEXT,
    ot_lance_prev TEXT,ot_lance_cura TEXT,ot_lance_autre TEXT,
    ot_honore_prev TEXT,ot_honore_cura TEXT,ot_honore_autre TEXT,
    pct_real_prev TEXT,pct_real_cura TEXT,pct_real_autre TEXT,created_at TEXT);

CREATE TABLE IF NOT EXISTS stg_cout_materiel (
    id TEXT,date_debut TEXT,date_fin TEXT,annee TEXT,mois TEXT,
    entite TEXT,zone TEXT,type_intervention TEXT,cout_tnd TEXT,created_at TEXT);

CREATE TABLE IF NOT EXISTS stg_taux_disponibilite (
    id TEXT,date_debut TEXT,date_fin TEXT,annee TEXT,mois TEXT,
    mois_libelle TEXT,entite TEXT,num_ligne TEXT,code_ligne TEXT,
    description TEXT,t_ouverture TEXT,t_arret TEXT,nb_arret TEXT,
    tbf TEXT,mtbf TEXT,mttr TEXT,disponibilite_pct TEXT,created_at TEXT);

-- ── ÉNERGIE : nouvelles colonnes alignées avec les CSV de l'app web ──────────
CREATE TABLE IF NOT EXISTS stg_energie_eau (
    id                   TEXT,
    date_releve          DATE,
    compteur_m3          NUMERIC(12,3),
    consommation_jour_m3 NUMERIC(10,3),
    cout_jour_tnd        NUMERIC(10,3),
    created_at           TEXT);
CREATE SEQUENCE IF NOT EXISTS stg_energie_eau_id_seq;
ALTER TABLE stg_energie_eau
    ALTER COLUMN id SET DEFAULT nextval('stg_energie_eau_id_seq')::text;

CREATE TABLE IF NOT EXISTS stg_energie_electricite (
    id                    TEXT,
    date_releve           DATE,
    phase1_kwh            NUMERIC(12,3),
    phase2_kwh            NUMERIC(12,3),
    phase3_kwh            NUMERIC(12,3),
    consommation_jour_kwh NUMERIC(12,3),
    cout_jour_tnd         NUMERIC(12,3),
    created_at            TEXT);
CREATE SEQUENCE IF NOT EXISTS stg_energie_electricite_id_seq;
ALTER TABLE stg_energie_electricite
    ALTER COLUMN id SET DEFAULT nextval('stg_energie_electricite_id_seq')::text;

CREATE TABLE IF NOT EXISTS stg_energie_pv (
    id                         TEXT,
    date                       DATE,
    mois                       TEXT,
    puissance_installee_kwp    NUMERIC(8,2),
    production_journaliere_kwh NUMERIC(12,3),
    production_cumulee_kwh     NUMERIC(12,3),
    heures_equivalentes_h      NUMERIC(8,3),
    created_at                 TEXT);
CREATE SEQUENCE IF NOT EXISTS stg_energie_pv_id_seq;
ALTER TABLE stg_energie_pv
    ALTER COLUMN id SET DEFAULT nextval('stg_energie_pv_id_seq')::text;

CREATE TABLE IF NOT EXISTS stg_pieces_rechange_catalogue (
    id TEXT,equipement TEXT,code_prc TEXT,code_prc_format TEXT,
    designation TEXT,cout_tnd TEXT,created_at TEXT);

CREATE TABLE IF NOT EXISTS stg_pieces_rechange_mouvements (
    id TEXT,code_prc TEXT,nom_article TEXT,direction TEXT,
    annee_mois TEXT,stofcy TEXT,iptdat TEXT,lot TEXT,pcu TEXT,
    qtypcu TEXT,stu TEXT,qtystu TEXT,sta TEXT,loc TEXT,slo TEXT,
    sernum TEXT,befsto TEXT,serfin TEXT,aftsto TEXT,qlyctldem TEXT,
    trstyp TEXT,mvtdes TEXT,pjt TEXT,dludat TEXT,newltidat TEXT,
    bprnum TEXT,vcrtyptxt TEXT,vcrnum TEXT,vcrlin TEXT,
    vcrtyporit TEXT,vcrnumori TEXT,vcrlinori TEXT,bpslot TEXT,
    shldat TEXT,actqty TEXT,pot TEXT,owner TEXT,pcuori TEXT,
    betcpy TEXT,pcustuori TEXT,acccur TEXT,amtord TEXT,amtval TEXT,
    varord TEXT,varval TEXT,priord TEXT,prival TEXT,prinat TEXT,
    amtdev TEXT,trsfam TEXT,numvcr TEXT,gte TEXT,creusr TEXT,
    credat TEXT,cretim TEXT,cce1 TEXT,palnum TEXT,ctrnum TEXT,
    created_at TEXT);
"""

# ── Map CSV → table staging ───────────────────────────────────────────────────
# csv         = nom du fichier dans output/
# table       = nom de la table staging
# dtype_str   = si True, charge tout en TEXT (tables PDF brutes)
#               si False, pandas infère les types (tables énergie typées)

STAGING_TABLES = [
    {"csv": "charges_employes.csv",          "table": "stg_charges_employes",          "dtype_str": True},
    {"csv": "ratio_intervention.csv",         "table": "stg_ratio_intervention",         "dtype_str": True},
    {"csv": "situation_mensuelle.csv",        "table": "stg_situation_mensuelle",        "dtype_str": True},
    {"csv": "cout_materiel.csv",              "table": "stg_cout_materiel",              "dtype_str": True},
    {"csv": "taux_disponibilite.csv",         "table": "stg_taux_disponibilite",         "dtype_str": True},
    # ── énergie : CSV renommés produits par extract.py ──────────────────────
    {"csv": "stg_energie_eau.csv",            "table": "stg_energie_eau",                "dtype_str": False},
    {"csv": "stg_energie_electricite.csv",    "table": "stg_energie_electricite",        "dtype_str": False},
    {"csv": "stg_energie_pv.csv",             "table": "stg_energie_pv",                 "dtype_str": False},
    # ────────────────────────────────────────────────────────────────────────
    {"csv": "pieces_rechange_catalogue.csv",  "table": "stg_pieces_rechange_catalogue",  "dtype_str": True},
    {"csv": "pieces_rechange_mouvements.csv", "table": "stg_pieces_rechange_mouvements", "dtype_str": True},
]


def load_csv(engine, cfg):
    p = RAW_DIR / cfg["csv"]
    if not p.exists():
        return 0, "introuvable"

    dtype = str if cfg["dtype_str"] else None
    df = pd.read_csv(p, encoding="utf-8-sig", low_memory=False, dtype=dtype)
    df.columns = [c.strip().lower() for c in df.columns]
    df = df.where(pd.notna(df), other=None)


    with engine.connect() as c:
        db_cols = [r[0] for r in c.execute(text(
            f"SELECT column_name FROM information_schema.columns "
            f"WHERE table_name='{cfg['table']}' ORDER BY ordinal_position"))]

    keep = [c for c in df.columns if c in db_cols]
    df   = df[keep]

    if df.empty:
        return 0, "vide"

    df.to_sql(cfg["table"], engine, if_exists="append",
              index=False, method="multi", chunksize=500)
    return len(df), "ok"


def main():
    print("=" * 65)
    print("  LOAD STAGING — Eleonetech")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    engine = get_engine()
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        print(f"  ✓  Connexion {DB_STAGING}\n")
    except Exception as e:
        print(f"  ✗  {e}"); return

    # Drop + recréer toutes les tables staging
    print("  ── Recréation tables stg_* ─────────────────────────")
    with engine.begin() as c:
        for cfg in STAGING_TABLES:
            c.execute(text(f"DROP TABLE IF EXISTS {cfg['table']} CASCADE"))

    for stmt in STAGING_SQL.split(";"):
        stmt = stmt.strip()
        if stmt:
            try:
                with engine.begin() as c:
                    c.execute(text(stmt))
            except Exception as e:
                print(f"    ↳ DDL: {str(e)[:80]}")
    print("  ✓  Tables stg_* créées\n")

    # Charger les CSV
    print("  ── Chargement CSV ──────────────────────────────────")
    for cfg in STAGING_TABLES:
        try:
            n, status = load_csv(engine, cfg)
            icon = "✓" if n > 0 else "⚠"
            print(f"  {icon}  {cfg['table']:<45} {n:>5} lignes")
        except Exception as e:
            print(f"  ✗  {cfg['table']:<45} {str(e)[:60]}")

    # Vérification
    print("\n  ── Vérification ────────────────────────────────────")
    with engine.connect() as c:
        for cfg in STAGING_TABLES:
            try:
                n = c.execute(text(f"SELECT COUNT(*) FROM {cfg['table']}")).scalar()
                print(f"  {'✓' if n>0 else '⚠'}  {cfg['table']:<45} {n:>6}")
            except Exception as e:
                print(f"  ✗  {cfg['table']}: {str(e)[:40]}")

    print(f"\n  Terminé : {datetime.now().strftime('%H:%M:%S')}")


if __name__ == "__main__":
    main()
