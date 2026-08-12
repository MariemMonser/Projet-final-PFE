"""
load_staging.py
===============
Charge les CSVs produits par extract.py dans eleonetech_staging.

Ordre d'exécution du pipeline :
  1. python extract.py          → output/*.csv
  2. python load_staging.py     ← ce script
  3. python transformation.py
  4. python load_dw.py
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import os
import pandas as pd
import warnings
from pathlib import Path
from datetime import datetime
from urllib.parse import quote_plus
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

warnings.filterwarnings("ignore")

# Charger .env du backend — même config que le serveur Node.js
_env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=_env_path)

# ── Config ────────────────────────────────────────────────────────────────────
DB_HOST     = os.getenv("DB_HOST",         "localhost")
DB_PORT     = int(os.getenv("DB_PORT",     "5432"))
DB_USER     = os.getenv("DB_USER",         "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD",     "")
DB_STAGING  = os.getenv("DB_STAGING_NAME", "eleonetech_staging")

BASE_DIR = Path(__file__).parent
RAW_DIR  = BASE_DIR / "output"


def get_engine():
    pwd = DB_PASSWORD
    url = (f"postgresql+psycopg2://{DB_USER}:{quote_plus(pwd)}@{DB_HOST}:{DB_PORT}/{DB_STAGING}"
           if pwd else
           f"postgresql+psycopg2://{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_STAGING}")
    return create_engine(url, pool_pre_ping=True)


# ── DDL ───────────────────────────────────────────────────────────────────────
# Toutes les colonnes TEXT : le staging est une zone de transit brute.
# Les types sont appliqués dans transformation.py (stg_clean_*).

STAGING_SQL = """
CREATE TABLE IF NOT EXISTS stg_charges_employes (
    id                     TEXT,
    matricule              TEXT,
    nom_prenom             TEXT,
    numero_ot              TEXT,
    type_intervention      TEXT,
    code_equipement        TEXT,
    description_equipement TEXT,
    date_debut             TEXT,
    hrs_travaux            TEXT,
    periode_debut          TEXT,
    periode_fin            TEXT,
    annee                  TEXT,
    total_hrs_employe      TEXT,
    created_at             TEXT
);

CREATE TABLE IF NOT EXISTS stg_situation_mensuelle (
    id               TEXT,
    annee            TEXT,
    mois             TEXT,
    mois_num         TEXT,
    entite           TEXT,
    ot_lance_prev    TEXT,
    ot_lance_cura    TEXT,
    ot_lance_autre   TEXT,
    ot_honore_prev   TEXT,
    ot_honore_cura   TEXT,
    ot_honore_autre  TEXT,
    pct_real_prev    TEXT,
    pct_real_cura    TEXT,
    pct_real_autre   TEXT,
    created_at       TEXT
);

CREATE TABLE IF NOT EXISTS stg_cout_materiel (
    id                TEXT,
    date_debut        TEXT,
    date_fin          TEXT,
    annee             TEXT,
    mois              TEXT,
    entite            TEXT,
    zone              TEXT,
    type_intervention TEXT,
    cout_tnd          TEXT,
    created_at        TEXT
);

CREATE TABLE IF NOT EXISTS stg_taux_disponibilite (
    id               TEXT,
    date_debut       TEXT,
    date_fin         TEXT,
    annee            TEXT,
    mois             TEXT,
    mois_libelle     TEXT,
    entite           TEXT,
    num_ligne        TEXT,
    code_ligne       TEXT,
    description      TEXT,
    t_ouverture      TEXT,
    t_arret          TEXT,
    nb_arret         TEXT,
    tbf              TEXT,
    mtbf             TEXT,
    mttr             TEXT,
    disponibilite_pct TEXT,
    created_at       TEXT
);

CREATE TABLE IF NOT EXISTS stg_energie_eau (
    id                   TEXT,
    date_releve          DATE,
    annee_mois           TEXT,
    index_compteur_m3    NUMERIC(12,3),
    consommation_jour_m3 NUMERIC(10,3),
    cout_jour_tnd        NUMERIC(10,3),
    created_at           TEXT
);

CREATE TABLE IF NOT EXISTS stg_energie_electricite (
    id                    TEXT,
    date_releve           DATE,
    annee_mois            TEXT,
    index_ph1_kwh         NUMERIC(12,3),
    index_ph2_kwh         NUMERIC(12,3),
    index_ph3_kwh         NUMERIC(12,3),
    consommation_jour_kwh NUMERIC(12,3),
    cout_jour_tnd         NUMERIC(12,3),
    created_at            TEXT
);

CREATE TABLE IF NOT EXISTS stg_energie_pv (
    id                         TEXT,
    date                       DATE,
    mois                       TEXT,
    puissance_installee_kwp    NUMERIC(8,2),
    production_journaliere_kwh NUMERIC(12,3),
    production_cumulee_kwh     NUMERIC(12,3),
    heures_equivalentes_h      NUMERIC(8,3),
    created_at                 TEXT
);

CREATE TABLE IF NOT EXISTS stg_pieces_rechange_catalogue (
    id              TEXT,
    equipement      TEXT,
    code_prc        TEXT,
    code_prc_format TEXT,
    designation     TEXT,
    cout_tnd        TEXT,
    created_at      TEXT
);

CREATE TABLE IF NOT EXISTS stg_pieces_rechange_mouvements (
    id         TEXT, code_prc   TEXT, nom_article TEXT, direction  TEXT,
    annee_mois TEXT, stofcy     TEXT, iptdat      TEXT, lot        TEXT,
    pcu        TEXT, qtypcu     TEXT, stu         TEXT, qtystu     TEXT,
    sta        TEXT, loc        TEXT, slo         TEXT, sernum     TEXT,
    befsto     TEXT, serfin     TEXT, aftsto      TEXT, qlyctldem  TEXT,
    trstyp     TEXT, mvtdes     TEXT, pjt         TEXT, dludat     TEXT,
    newltidat  TEXT, bprnum     TEXT, vcrtyptxt   TEXT, vcrnum     TEXT,
    vcrlin     TEXT, vcrtyporit TEXT, vcrnumori   TEXT, vcrlinori  TEXT,
    bpslot     TEXT, shldat     TEXT, actqty      TEXT, pot        TEXT,
    owner      TEXT, pcuori     TEXT, betcpy      TEXT, pcustuori  TEXT,
    acccur     TEXT, amtord     TEXT, amtval      TEXT, varord     TEXT,
    varval     TEXT, priord     TEXT, prival      TEXT, prinat     TEXT,
    amtdev     TEXT, trsfam     TEXT, numvcr      TEXT, gte        TEXT,
    creusr     TEXT, credat     TEXT, cretim      TEXT, cce1       TEXT,
    palnum     TEXT, ctrnum     TEXT, created_at  TEXT
);
"""

# ── Map CSV → table ───────────────────────────────────────────────────────────
# dtype_str=True  → tout TEXT   (données brutes PDF, types appliqués dans transformation.py)
# dtype_str=False → pandas infère (énergie : colonnes numériques/date typées en staging)

# Tables rechargées entièrement à chaque ETL (sources PDF — full reload)
FULL_RELOAD_TABLES = [
    {"csv": "charges_employes.csv",          "table": "stg_charges_employes",          "dtype_str": True},
    {"csv": "situation_mensuelle.csv",        "table": "stg_situation_mensuelle",        "dtype_str": True},
    {"csv": "cout_materiel.csv",             "table": "stg_cout_materiel",             "dtype_str": True},
    {"csv": "taux_disponibilite.csv",        "table": "stg_taux_disponibilite",        "dtype_str": True},
    {"csv": "pieces_rechange_catalogue.csv", "table": "stg_pieces_rechange_catalogue", "dtype_str": True},
    {"csv": "pieces_rechange_mouvements.csv","table": "stg_pieces_rechange_mouvements","dtype_str": True},
]

# Tables énergie : chargement incrémental — on n'insère que les nouvelles lignes
INCREMENTAL_TABLES = [
    {"csv": "eau_journalier.csv",         "table": "stg_energie_eau",         "date_col": "date_releve", "dtype_str": False},
    {"csv": "electricite_journalier.csv", "table": "stg_energie_electricite", "date_col": "date_releve", "dtype_str": False},
    {"csv": "pv_journalier.csv",          "table": "stg_energie_pv",          "date_col": "date",        "dtype_str": False},
]

STAGING_TABLES = FULL_RELOAD_TABLES + [
    {k: v for k, v in t.items() if k != "date_col"} for t in INCREMENTAL_TABLES
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_db_cols(engine, table):
    with engine.connect() as c:
        return [r[0] for r in c.execute(text(
            "SELECT column_name FROM information_schema.columns "
            f"WHERE table_name='{table}' ORDER BY ordinal_position"))]

def load_csv(engine, cfg):
    """Chargement complet (full reload) — utilisé pour les tables texte issues de PDF."""
    p = RAW_DIR / cfg["csv"]
    if not p.exists():
        return 0, "introuvable"

    dtype = str if cfg["dtype_str"] else None
    df = pd.read_csv(p, encoding="utf-8-sig", low_memory=False, dtype=dtype)
    df.columns = [c.strip().lower() for c in df.columns]
    df = df.where(pd.notna(df), other=None)

    keep = [col for col in df.columns if col in _get_db_cols(engine, cfg["table"])]
    df   = df[keep]

    if df.empty:
        return 0, "vide"

    df.to_sql(cfg["table"], engine, if_exists="append",
              index=False, method="multi", chunksize=500)
    return len(df), "ok"


def load_csv_incremental(engine, cfg):
    """Chargement incrémental — n'insère que les lignes plus récentes que la dernière date en DB."""
    p = RAW_DIR / cfg["csv"]
    if not p.exists():
        return 0, "introuvable"

    df = pd.read_csv(p, encoding="utf-8-sig", low_memory=False)
    df.columns = [c.strip().lower() for c in df.columns]
    df = df.where(pd.notna(df), other=None)

    date_col = cfg["date_col"]
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df.dropna(subset=[date_col])

    # Trouver la dernière date déjà chargée dans la staging
    try:
        with engine.connect() as c:
            last = c.execute(text(f"SELECT MAX({date_col}) FROM {cfg['table']}")).scalar()
        if last:
            df = df[df[date_col] > pd.Timestamp(last)]
    except Exception:
        pass  # Table vide ou inexistante — tout charger

    if df.empty:
        return 0, "rien de nouveau"

    keep = [col for col in df.columns if col in _get_db_cols(engine, cfg["table"])]
    df   = df[keep]

    df.to_sql(cfg["table"], engine, if_exists="append",
              index=False, method="multi", chunksize=500)
    return len(df), "ok (incrémental)"


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print("  LOAD STAGING — Eleonetech")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  DB : {DB_STAGING} @ {DB_HOST}:{DB_PORT}")
    print(f"  CSV: {RAW_DIR.resolve()}")
    print("=" * 65)

    # Vérifier les CSV sources avant de toucher la DB
    print("\n  ── Fichiers CSV sources ────────────────────────────")
    all_ok = True
    for cfg in STAGING_TABLES:
        p = RAW_DIR / cfg["csv"]
        if p.exists():
            n = sum(1 for _ in open(p, encoding="utf-8-sig")) - 1
            print(f"  ✓  {cfg['csv']:<45} {n:>6} lignes")
        else:
            print(f"  ✗  {cfg['csv']:<45} INTROUVABLE")
            all_ok = False
    if not all_ok:
        print(f"\n  ⚠  Certains CSV manquent. Lancez d'abord : python extract.py")
        return

    engine = get_engine()
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        print(f"\n  ✓  Connexion {DB_STAGING}")
    except Exception as e:
        print(f"\n  ✗  Connexion impossible : {e}")
        return

    # Drop uniquement les tables full-reload (pas les tables énergie incrémentales)
    print("\n  ── Recréation tables stg_* (full reload) ───────────")
    with engine.begin() as c:
        for cfg in FULL_RELOAD_TABLES:
            c.execute(text(f"DROP TABLE IF EXISTS {cfg['table']} CASCADE"))

    errors = 0
    for stmt in STAGING_SQL.split(";"):
        stmt = stmt.strip()
        if not stmt:
            continue
        try:
            with engine.begin() as c:
                c.execute(text(stmt))
        except Exception as e:
            print(f"    ↳ DDL erreur : {str(e)[:80]}")
            errors += 1
    print(f"  {'✓' if errors == 0 else '⚠'}  {len(STAGING_TABLES)} tables créées"
          + (f" ({errors} erreurs DDL)" if errors else ""))

    # Chargement : full reload pour les tables PDF, incrémental pour l'énergie
    print("\n  ── Chargement CSV → staging ────────────────────────")
    total_rows = 0
    incr_names = {t["table"] for t in INCREMENTAL_TABLES}
    for cfg in STAGING_TABLES:
        try:
            if cfg["table"] in incr_names:
                icfg = next(t for t in INCREMENTAL_TABLES if t["table"] == cfg["table"])
                n, status = load_csv_incremental(engine, icfg)
            else:
                n, status = load_csv(engine, cfg)
            total_rows += n
            icon = "✓" if n > 0 else "⚠"
            print(f"  {icon}  {cfg['table']:<45} {n:>6} lignes  [{status}]")
        except Exception as e:
            print(f"  ✗  {cfg['table']:<45} {str(e)[:60]}")

    # Vérification finale
    print("\n  ── Vérification DB ─────────────────────────────────")
    with engine.connect() as c:
        for cfg in STAGING_TABLES:
            try:
                n = c.execute(text(f"SELECT COUNT(*) FROM {cfg['table']}")).scalar()
                print(f"  {'✓' if n>0 else '⚠'}  {cfg['table']:<45} {n:>6}")
            except Exception as e:
                print(f"  ✗  {cfg['table']}: {str(e)[:40]}")

    print(f"\n  Total chargé : {total_rows} lignes")
    print(f"  Terminé      : {datetime.now().strftime('%H:%M:%S')}")
    print("=" * 65)


if __name__ == "__main__":
    main()
