"""
transformation.py
===transform===============
stg_* → stg_clean_* dans eleonetech_staging

Tables :
  stg_cout_materiel              → stg_clean_cout_materiel
  stg_pieces_rechange_catalogue  → stg_clean_prc_catalogue
  stg_situation_mensuelle        → stg_clean_situation
  stg_taux_disponibilite         → stg_clean_taux_dispo
  stg_charges_employes           → stg_clean_charges
  stg_pieces_rechange_mouvements → stg_clean_prc_mouvements

Usage : python transformation.py
"""

import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import os
import numpy as np
import pandas as pd
from pathlib import Path
from datetime import datetime
from urllib.parse import quote_plus
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

_env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=_env_path)

# ── Config ────────────────────────────────────────────────────────────────────
DB_HOST = os.getenv("DB_HOST",         "localhost")
DB_PORT = int(os.getenv("DB_PORT",     "5432"))
DB_USER = os.getenv("DB_USER",         "postgres")
DB_PWD  = os.getenv("DB_PASSWORD",     "")
DB_NAME = os.getenv("DB_STAGING_NAME", "eleonetech_staging")

MOIS_MAP = {
    'JANVIER':1,'FEVRIER':2,'FÉVRIER':2,'MARS':3,'AVRIL':4,
    'MAI':5,'JUIN':6,'JUILLET':7,'AOUT':8,'AOÛT':8,
    'SEPTEMBRE':9,'OCTOBRE':10,'NOVEMBRE':11,'DECEMBRE':12,'DÉCEMBRE':12,
}

# ── DDL ───────────────────────────────────────────────────────────────────────
DDL = """
DROP TABLE IF EXISTS stg_clean_cout_materiel   CASCADE;
DROP TABLE IF EXISTS stg_clean_prc_catalogue   CASCADE;
DROP TABLE IF EXISTS stg_clean_situation       CASCADE;
DROP TABLE IF EXISTS stg_clean_taux_dispo      CASCADE;
DROP TABLE IF EXISTS stg_clean_charges         CASCADE;
DROP TABLE IF EXISTS stg_clean_prc_mouvements  CASCADE;

-- 1. Coûts matériel : sans EOT, sans Total, sans dates
CREATE TABLE stg_clean_cout_materiel (
    id                SERIAL        PRIMARY KEY,
    annee             SMALLINT      NOT NULL,
    mois              SMALLINT      NOT NULL,
    annee_mois        VARCHAR(7)    NOT NULL,
    zone              VARCHAR(10)   NOT NULL,
    type_intervention VARCHAR(10)   NOT NULL,
    cout_tnd          NUMERIC(12,3),
    UNIQUE (annee, mois, zone, type_intervention)
);

-- 2. Catalogue PDR : code_prc_format comme code canonique, sans code_prc original
CREATE TABLE stg_clean_prc_catalogue (
    id                 SERIAL        PRIMARY KEY,
    code_prc           VARCHAR(15)   NOT NULL UNIQUE,
    designation        TEXT,
    famille_equipement TEXT,
    cout_unitaire_tnd  NUMERIC(12,3)
);

-- 3. Situation mensuelle : sans EOT, sans pct_real_*, sans mois_num
CREATE TABLE stg_clean_situation (
    id                   SERIAL       PRIMARY KEY,
    annee                SMALLINT     NOT NULL,
    mois                 VARCHAR(20)  NOT NULL,
    annee_mois           VARCHAR(7)   NOT NULL,
    entite               VARCHAR(10)  NOT NULL,
    ot_lance_prev        INTEGER      DEFAULT 0,
    ot_lance_cura        INTEGER      DEFAULT 0,
    ot_lance_autre       INTEGER      DEFAULT 0,
    ot_honore_prev       INTEGER      DEFAULT 0,
    ot_honore_cura       INTEGER      DEFAULT 0,
    ot_honore_autre      INTEGER      DEFAULT 0,
    ot_lance_total       INTEGER      DEFAULT 0,
    ot_honore_total      INTEGER      DEFAULT 0,
    taux_realisation_pct NUMERIC(5,2),
    UNIQUE (annee, mois, entite)
);

-- 4. Taux dispo : SG seulement, sans dates/mtbf/mttr/dispo bruts
CREATE TABLE stg_clean_taux_dispo (
    id           SERIAL        PRIMARY KEY,
    annee        SMALLINT      NOT NULL,
    mois_libelle VARCHAR(20),
    annee_mois   VARCHAR(7)    NOT NULL,
    code_ligne   VARCHAR(20)   NOT NULL,
    description  TEXT,
    t_ouverture  NUMERIC(10,2),
    t_arret      NUMERIC(10,2) DEFAULT 0,
    nb_arret     NUMERIC(10,2) DEFAULT 0,
    UNIQUE (annee_mois, code_ligne)
);

-- 5. Charges employés : type classifié CURA/PREV/AUTRE, dates typées
CREATE TABLE stg_clean_charges (
    id                SERIAL       PRIMARY KEY,
    matricule         VARCHAR(20),
    nom_prenom        TEXT,
    numero_ot         VARCHAR(50)  NOT NULL,
    UNIQUE (numero_ot, matricule),
    type_intervention VARCHAR(10)  NOT NULL DEFAULT 'AUTRE',
    code_equipement   VARCHAR(100),
    date_debut        TIMESTAMP,
    annee             SMALLINT,
    mois_num          SMALLINT,
    annee_mois        VARCHAR(7),
    hrs_travaux       NUMERIC(10,3) DEFAULT 0
);

-- 6. Mouvements PDR : colonnes inutiles supprimées
CREATE TABLE stg_clean_prc_mouvements (
    id         SERIAL        PRIMARY KEY,
    code_prc   VARCHAR(15),
    annee_mois VARCHAR(7),
    annee      SMALLINT,
    mois_num   SMALLINT,
    iptdat     DATE,
    direction  VARCHAR(10),
    qtypcu     NUMERIC(10,3),
    befsto     NUMERIC(10,3),
    aftsto     NUMERIC(10,3)
);
"""

# ── Helpers ───────────────────────────────────────────────────────────────────

def get_engine():
    if DB_PWD:
        url = f"postgresql+psycopg2://{DB_USER}:{quote_plus(DB_PWD)}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    else:
        url = f"postgresql+psycopg2://{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    return create_engine(url, pool_pre_ping=True)


def read(engine, table):
    with engine.connect() as c:
        return pd.read_sql(text(f"SELECT * FROM {table}"), c)


def write(engine, table, df):
    if df is None or df.empty:
        return 0
    df = df.where(pd.notna(df), other=None)
    df.to_sql(table, engine, if_exists='append', index=False, method='multi', chunksize=200)
    return len(df)


def to_float(v):
    if v is None or (isinstance(v, float) and np.isnan(v)):
        return None
    try:
        return float(str(v).strip().replace(' ', '').replace(',', '.').replace('%', ''))
    except (ValueError, TypeError):
        return None


def to_int(v):
    f = to_float(v)
    return None if f is None else int(round(f))


def make_annee_mois(annee, mois):
    try:
        return f"{int(annee):04d}-{int(mois):02d}"
    except Exception:
        return None


def log(src, dst, n_in, n_out):
    icon = "✓" if n_out > 0 else "⚠"
    print(f"  {icon}  {src:<42} {n_in:>6} → {n_out:>6}  (−{n_in - n_out})")


# ═══════════════════════════════════════════════════════════════════════════════
# 1. stg_cout_materiel → stg_clean_cout_materiel
# ═══════════════════════════════════════════════════════════════════════════════

def transform_cout_materiel(engine):
    df = read(engine, 'stg_cout_materiel')
    n_in = len(df)

    # Supprimer lignes EOT
    if 'entite' in df.columns:
        df = df[df['entite'].fillna('').str.strip().str.upper() != 'EOT'].copy()

    # Supprimer lignes Total
    if 'type_intervention' in df.columns:
        df = df[df['type_intervention'].fillna('').str.strip().str.upper() != 'TOTAL'].copy()

    # Supprimer colonnes
    df = df.drop(columns=[c for c in
        ['date_debut','date_fin','entite','id','created_at'] if c in df.columns])

    # Types
    df['annee']    = df['annee'].apply(to_int)
    df['mois']     = df['mois'].apply(to_int)
    df['cout_tnd'] = df['cout_tnd'].apply(to_float)

    # Normaliser type_intervention → CURA / PREV / AUTRE
    TYPE_MAP = {
        'CURATIVE':'CURA','CURATIF':'CURA','CURA':'CURA',
        'PRÉVENTIVE':'PREV','PREVENTIVE':'PREV','PRÉVENTIF':'PREV',
        'PREVENTIF':'PREV','PREV':'PREV',
        'ACTION AMÉLIORATIVE':'AUTRE','AMELIORATIVE':'AUTRE','AUTRE':'AUTRE',
    }
    if 'type_intervention' in df.columns:
        df['type_intervention'] = df['type_intervention'].apply(
            lambda x: TYPE_MAP.get(str(x).strip().upper(), 'AUTRE') if pd.notna(x) else 'AUTRE')

    # Normaliser zone
    if 'zone' in df.columns:
        df['zone'] = df['zone'].fillna('').str.strip().str.upper()
        df = df[df['zone'] != '']

    # annee_mois
    df['annee_mois'] = df.apply(lambda r: make_annee_mois(r['annee'], r['mois']), axis=1)

    # Qualité
    df = df.dropna(subset=['annee','mois','zone','type_intervention'])
    df = df.drop_duplicates(subset=['annee','mois','zone','type_intervention'])

    cols = ['annee','mois','annee_mois','zone','type_intervention','cout_tnd']
    write(engine, 'stg_clean_cout_materiel', df[[c for c in cols if c in df.columns]])
    log('stg_cout_materiel', 'stg_clean_cout_materiel', n_in,
        pd.read_sql(text("SELECT COUNT(*) FROM stg_clean_cout_materiel"),
                    engine.connect()).iloc[0,0])


# ═══════════════════════════════════════════════════════════════════════════════
# 2. stg_pieces_rechange_catalogue → stg_clean_prc_catalogue
# ═══════════════════════════════════════════════════════════════════════════════

def transform_prc_catalogue(engine):
    df = read(engine, 'stg_pieces_rechange_catalogue')
    n_in = len(df)

    # Supprimer code_prc original (garder code_prc_format)
    df = df.drop(columns=[c for c in ['code_prc','id','created_at'] if c in df.columns])

    # Renommer code_prc_format → code_prc
    if 'code_prc_format' in df.columns:
        df = df.rename(columns={'code_prc_format': 'code_prc'})

    # ffill famille_equipement (cellules fusionnées Excel)
    if 'equipement' in df.columns:
        df['equipement'] = df['equipement'].replace('', None).ffill()
        df['equipement'] = df['equipement'].fillna('').str.strip().str.capitalize()
        df['equipement'] = df['equipement'].replace('', None)
        df = df.rename(columns={'equipement': 'famille_equipement'})

    # Normaliser designation
    if 'designation' in df.columns:
        df['designation'] = df['designation'].fillna('').str.strip().str.capitalize()
        df['designation'] = df['designation'].replace('', None)

    # Types
    if 'cout_tnd' in df.columns:
        df['cout_tnd'] = df['cout_tnd'].apply(to_float)
        df = df.rename(columns={'cout_tnd': 'cout_unitaire_tnd'})

    # Qualité
    df = df.dropna(subset=['code_prc'])
    df = df[df['code_prc'].str.strip() != '']
    df = df.drop_duplicates(subset=['code_prc'])

    cols = ['code_prc','designation','famille_equipement','cout_unitaire_tnd']
    write(engine, 'stg_clean_prc_catalogue', df[[c for c in cols if c in df.columns]])
    log('stg_pieces_rechange_catalogue', 'stg_clean_prc_catalogue', n_in,
        pd.read_sql(text("SELECT COUNT(*) FROM stg_clean_prc_catalogue"),
                    engine.connect()).iloc[0,0])


# ═══════════════════════════════════════════════════════════════════════════════
# 3. stg_situation_mensuelle → stg_clean_situation
# ═══════════════════════════════════════════════════════════════════════════════

def transform_situation(engine):
    df = read(engine, 'stg_situation_mensuelle')
    n_in = len(df)

    # Supprimer lignes EOT
    if 'entite' in df.columns:
        df = df[df['entite'].fillna('').str.strip().str.upper() != 'EOT'].copy()

    # Supprimer colonnes
    drop_cols = ['pct_real_prev','pct_real_cura','pct_real_autre',
                 'mois_num','id','created_at']
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    # Types
    df['annee'] = df['annee'].apply(to_int)
    for col in ['ot_lance_prev','ot_lance_cura','ot_lance_autre',
                'ot_honore_prev','ot_honore_cura','ot_honore_autre']:
        if col in df.columns:
            df[col] = df[col].apply(to_int).fillna(0).astype(int)

    # Totaux calculés
    df['ot_lance_total'] = (
        df.get('ot_lance_prev', pd.Series(0, index=df.index)).fillna(0).astype(int) +
        df.get('ot_lance_cura', pd.Series(0, index=df.index)).fillna(0).astype(int) +
        df.get('ot_lance_autre', pd.Series(0, index=df.index)).fillna(0).astype(int))
    df['ot_honore_total'] = (
        df.get('ot_honore_prev', pd.Series(0, index=df.index)).fillna(0).astype(int) +
        df.get('ot_honore_cura', pd.Series(0, index=df.index)).fillna(0).astype(int) +
        df.get('ot_honore_autre', pd.Series(0, index=df.index)).fillna(0).astype(int))
    df['taux_realisation_pct'] = (
        df['ot_honore_total'] /
        df['ot_lance_total'].replace(0, np.nan) * 100).round(2)

    # annee_mois
    if 'mois' in df.columns:
        df['mois_num_calc'] = df['mois'].str.strip().str.upper().map(MOIS_MAP)
        df['annee_mois'] = df.apply(
            lambda r: make_annee_mois(r['annee'], r['mois_num_calc'])
            if pd.notna(r.get('mois_num_calc')) else None, axis=1)

    df['entite'] = df['entite'].fillna('').str.strip().str.upper()

    # Qualité
    df = df.dropna(subset=['annee','mois','annee_mois'])
    df = df[df['entite'] != '']
    df = df.drop_duplicates(subset=['annee','mois','entite'])

    cols = ['annee','mois','annee_mois','entite',
            'ot_lance_prev','ot_lance_cura','ot_lance_autre',
            'ot_honore_prev','ot_honore_cura','ot_honore_autre',
            'ot_lance_total','ot_honore_total','taux_realisation_pct']
    write(engine, 'stg_clean_situation', df[[c for c in cols if c in df.columns]])
    log('stg_situation_mensuelle', 'stg_clean_situation', n_in,
        pd.read_sql(text("SELECT COUNT(*) FROM stg_clean_situation"),
                    engine.connect()).iloc[0,0])


# ═══════════════════════════════════════════════════════════════════════════════
# 4. stg_taux_disponibilite → stg_clean_taux_dispo
# ═══════════════════════════════════════════════════════════════════════════════

def transform_taux_dispo(engine):
    df = read(engine, 'stg_taux_disponibilite')
    n_in = len(df)

    # Filtre SG uniquement
    if 'entite' in df.columns:
        df = df[df['entite'].fillna('').str.strip().str.upper() == 'SG'].copy()

    # Supprimer colonnes
    drop_cols = ['mois','date_debut','date_fin','mttr','mtbf','tbf',
                 'disponibilite_pct','num_ligne','entite','id','created_at']
    # t_arret est conservé — nécessaire pour calculer MTTR et disponibilité dans load_dw.py
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    # Types
    df['annee'] = df['annee'].apply(to_int)
    for col in ['t_ouverture','t_arret','nb_arret']:
        if col in df.columns:
            df[col] = df[col].apply(to_float)

    # nb_arret et t_arret NULL → 0
    df['nb_arret'] = df['nb_arret'].fillna(0.0)
    if 't_arret' in df.columns:
        df['t_arret'] = df['t_arret'].fillna(0.0)

    # annee_mois depuis mois_libelle
    if 'mois_libelle' in df.columns:
        df['mois_num_calc'] = df['mois_libelle'].fillna('').str.strip().str.upper().map(MOIS_MAP)
        df['annee_mois'] = df.apply(
            lambda r: make_annee_mois(r['annee'], r['mois_num_calc'])
            if pd.notna(r.get('mois_num_calc')) else None, axis=1)

    # Normaliser code_ligne
    if 'code_ligne' in df.columns:
        df['code_ligne'] = df['code_ligne'].fillna('').str.strip().str.upper()
        df = df[df['code_ligne'] != '']

    if 'description' in df.columns:
        df['description'] = df['description'].fillna('').str.strip().str.capitalize()
        df['description'] = df['description'].replace('', None)

    # Qualité
    df = df.dropna(subset=['annee','code_ligne','annee_mois','t_ouverture'])
    df = df[df['t_ouverture'] > 0]
    df = df.drop_duplicates(subset=['annee_mois','code_ligne'])

    cols = ['annee','mois_libelle','annee_mois','code_ligne','description',
            't_ouverture','t_arret','nb_arret']
    write(engine, 'stg_clean_taux_dispo', df[[c for c in cols if c in df.columns]])
    log('stg_taux_disponibilite', 'stg_clean_taux_dispo', n_in,
        pd.read_sql(text("SELECT COUNT(*) FROM stg_clean_taux_dispo"),
                    engine.connect()).iloc[0,0])


# ═══════════════════════════════════════════════════════════════════════════════
# 5. stg_charges_employes → stg_clean_charges
# ═══════════════════════════════════════════════════════════════════════════════

def transform_charges(engine):
    df = read(engine, 'stg_charges_employes')
    n_in = len(df)

    # Supprimer colonnes inutiles (garder type_intervention pour classifier)
    drop_cols = ['periode_debut','periode_fin','annee',
                 'description_equipement','id','created_at']
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    # Classifier type_intervention → CURA / PREV / AUTRE
    def classify(v):
        v = str(v).upper().strip() if pd.notna(v) else ''
        if any(k in v for k in ['INTERVENTION','REPARATION','RÉPARATION',
                                  'PB','PANNE','CURATIF','CURA']):
            return 'CURA'
        if any(k in v for k in ['PREVENTIF','PRÉVENTIF','PREVENTIVE','PRÉVENTIVE',
                                  'ENTRETIEN','VERIFICATION','VÉRIFICATION',
                                  'TOUR','MENSUEL','HEBDO','PREV']):
            return 'PREV'
        return 'AUTRE'

    if 'type_intervention' in df.columns:
        df['type_intervention'] = df['type_intervention'].apply(classify)
    else:
        df['type_intervention'] = 'AUTRE'

    # date_debut → TIMESTAMP (filtre dates invalides)
    if 'date_debut' in df.columns:
        # Valider jour/mois avant conversion
        def safe_ts(v):
            if not isinstance(v, str) or v.strip() == '':
                return None
            parts = v.strip().split('/')
            if len(parts) < 3:
                return None
            try:
                if int(parts[0]) < 1 or int(parts[0]) > 31:
                    return None
                if int(parts[1]) < 1 or int(parts[1]) > 12:
                    return None
            except ValueError:
                return None
            try:
                return pd.to_datetime(v.strip(), format='%d/%m/%Y %H:%M', errors='coerce')
            except Exception:
                return None
        df['date_debut'] = df['date_debut'].apply(safe_ts)
        df['date_debut'] = pd.to_datetime(df['date_debut'], errors='coerce')

    # Types numériques
    if 'hrs_travaux' in df.columns:
        df['hrs_travaux'] = df['hrs_travaux'].apply(to_float).fillna(0.0)

    # Supprimer total_hrs_employe (redondant - calculé dans load_dw depuis hrs_travaux)
    df = df.drop(columns=[c for c in ['total_hrs_employe'] if c in df.columns])

    # Calculer annee, mois_num, annee_mois depuis date_debut
    if 'date_debut' in df.columns:
        df['annee']    = df['date_debut'].dt.year.astype('Int64')
        df['mois_num'] = df['date_debut'].dt.month.astype('Int64')
        df['annee_mois'] = df['date_debut'].apply(
            lambda d: f"{d.year:04d}-{d.month:02d}" if pd.notna(d) else None)

    # Nettoyer nom_prenom
    if 'nom_prenom' in df.columns:
        import re
        # Supprimer chiffres en fin de nom  ("Gaith CHAMKHI 1" → "Gaith CHAMKHI")
        df['nom_prenom'] = df['nom_prenom'].apply(
            lambda x: re.sub(r'\s+\d+\s*$', '', str(x).strip()) if pd.notna(x) else None
        )
        # Supprimer les lignes "Service XXX" — ce sont des entités, pas des employés
        df = df[~df['nom_prenom'].fillna('').str.strip().str.upper().str.startswith('SERVICE')]
        df['nom_prenom'] = df['nom_prenom'].replace('', None)

    # Nettoyer code_equipement
    if 'code_equipement' in df.columns:
        df['code_equipement'] = df['code_equipement'].replace('', None)
        df['code_equipement'] = df['code_equipement'].apply(
            lambda x: None if pd.isna(x) or str(x).lower() in ('nan','none','') else str(x).strip())

        equipement_manuel_par_ot = {
            '2025096688': 'F42215',
            '2025096690': 'F41852',
            '2025096691': 'F42298',
            '2026112965': 'VAL-I-26',
        }
        mask_sans_equipement = df['code_equipement'].isna()
        df.loc[mask_sans_equipement, 'code_equipement'] = (
            df.loc[mask_sans_equipement, 'numero_ot']
              .astype(str)
              .str.strip()
              .map(equipement_manuel_par_ot)
        )

    # Qualité — numero_ot obligatoire et unique
    df = df.dropna(subset=['numero_ot'])
    df = df[df['numero_ot'].astype(str).str.strip() != '']
    df['numero_ot'] = df['numero_ot'].astype(str).str.strip()
    df = df.drop_duplicates(subset=['numero_ot', 'matricule'])

    cols = ['matricule','nom_prenom','numero_ot','type_intervention',
            'code_equipement','date_debut','annee','mois_num','annee_mois',
            'hrs_travaux']
    write(engine, 'stg_clean_charges', df[[c for c in cols if c in df.columns]])
    log('stg_charges_employes', 'stg_clean_charges', n_in,
        pd.read_sql(text("SELECT COUNT(*) FROM stg_clean_charges"),
                    engine.connect()).iloc[0,0])


# ═══════════════════════════════════════════════════════════════════════════════
# 6. stg_pieces_rechange_mouvements → stg_clean_prc_mouvements
# ═══════════════════════════════════════════════════════════════════════════════

def transform_prc_mouvements(engine):
    df = read(engine, 'stg_pieces_rechange_mouvements')
    n_in = len(df)

    # Supprimer colonnes inutiles
    drop_cols = [
        'stofcy','lot','slo','stu','qtystu','sta','sernum','serfin',
        'qlyctldem','pjt','dludat','newltidat','bpslot','shldat',
        'actqty','pot','owner','pcuori','betcpy','pcustuori','acccur',
        'amtord','varord','varval','prinat','amtdev','trsfam','numvcr',
        'gte','palnum','ctrnum','cce1','vcrtyptxt','vcrtyporit',
        'vcrnumori','vcrlinori','id','created_at',
        # aussi les colonnes de valeur non nécessaires pour le DW
        'amtval','priord','prival','trstyp','nom_article',
        'mvtdes','loc','bprnum','vcrnum','vcrlin','creusr','credat','cretim',
        'pcu'
    ]
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    # iptdat → DATE
    if 'iptdat' in df.columns:
        df['iptdat'] = pd.to_datetime(
            df['iptdat'], format='%d/%m/%Y', errors='coerce').dt.date

    # Types numériques
    for col in ['qtypcu','befsto','aftsto']:
        if col in df.columns:
            df[col] = df[col].apply(to_float)

    # annee_mois depuis iptdat
    if 'iptdat' in df.columns:
        df['annee']    = df['iptdat'].apply(lambda d: d.year  if d else None)
        df['mois_num'] = df['iptdat'].apply(lambda d: d.month if d else None)
        if 'annee_mois' not in df.columns:
            df['annee_mois'] = df['iptdat'].apply(
                lambda d: f"{d.year:04d}-{d.month:02d}" if d else None)

    # Normaliser direction
    if 'direction' in df.columns:
        df['direction'] = df['direction'].fillna('').str.strip().str.lower()
        df['direction'] = df['direction'].apply(
            lambda x: 'sortie' if x == 'sortie' else ('entree' if x == 'entree' else None))

    # Qualité — qtypcu obligatoire et != 0
    df = df.dropna(subset=['qtypcu'])
    df = df[df['qtypcu'] != 0]

    cols = ['code_prc','annee_mois','annee','mois_num','iptdat',
            'direction','qtypcu','befsto','aftsto']
    write(engine, 'stg_clean_prc_mouvements', df[[c for c in cols if c in df.columns]])
    log('stg_pieces_rechange_mouvements', 'stg_clean_prc_mouvements', n_in,
        pd.read_sql(text("SELECT COUNT(*) FROM stg_clean_prc_mouvements"),
                    engine.connect()).iloc[0,0])


# ═══════════════════════════════════════════════════════════════════════════════
# RAPPORT QUALITÉ
# ═══════════════════════════════════════════════════════════════════════════════

def quality_report(engine):
    checks = [
        ('stg_clean_cout_materiel',  ['annee','mois','zone','type_intervention']),
        ('stg_clean_prc_catalogue',  ['code_prc']),
        ('stg_clean_situation',      ['annee','mois','annee_mois']),
        ('stg_clean_taux_dispo',     ['annee','code_ligne','annee_mois','t_ouverture']),
        ('stg_clean_charges',        ['numero_ot','type_intervention']),
        ('stg_clean_prc_mouvements', ['code_prc','qtypcu']),
    ]
    print(f"\n  {'Table':<40} {'Lignes':>8}  Qualité")
    print("  " + "-" * 60)
    with engine.connect() as c:
        for tbl, keys in checks:
            try:
                n = c.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
                nulls = []
                for col in keys:
                    nc = c.execute(text(
                        f"SELECT COUNT(*) FROM {tbl} WHERE {col} IS NULL")).scalar()
                    if nc > 0:
                        nulls.append(f"{col}={nc}NULL")
                info = ', '.join(nulls) if nulls else 'OK'
                icon = "✓" if n > 0 and not nulls else "⚠"
                print(f"  {icon}  {tbl:<38} {n:>8}  {info}")
            except Exception as e:
                print(f"  ✗  {tbl:<38} {str(e)[:40]}")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 65)
    print("  TRANSFORMATION — Staging ELEONETECH")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"  Base : {DB_NAME} @ {DB_HOST}:{DB_PORT}")
    print("=" * 65)

    engine = get_engine()
    try:
        with engine.connect() as c:
            c.execute(text("SELECT 1"))
        print("\n  ✓  Connexion réussie")
    except Exception as e:
        print(f"\n  ✗  {e}")
        sys.exit(1)

    print("\n  Création des tables stg_clean_* ...")
    with engine.begin() as c:
        for stmt in DDL.split(';'):
            stmt = stmt.strip()
            if stmt:
                try:
                    c.execute(text(stmt))
                except Exception as e:
                    print(f"    DDL: {str(e)[:80]}")
    print("  ✓  6 tables stg_clean_* créées\n")

    print(f"  {'Source':<42} {'Avant':>6}   {'Après':>6}  Supprimées")
    print("  " + "-" * 65)

    for fn in [transform_cout_materiel, transform_prc_catalogue,
               transform_situation,    transform_taux_dispo,
               transform_charges,      transform_prc_mouvements]:
        try:
            fn(engine)
        except Exception as e:
            print(f"  ✗  {fn.__name__}: {str(e)[:70]}")

    print("\n" + "=" * 65)
    print("  RAPPORT QUALITÉ")
    print("=" * 65)
    quality_report(engine)

    print(f"\n  Terminé : {datetime.now().strftime('%H:%M:%S')}")
    print("=" * 65)


if __name__ == "__main__":
    main()
