import io, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import os
import math
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', 'backend', '.env'))

# ── Connexion ─────────────────────────────────────────────────────────────────
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', 5432))
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASS = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'eleonetech_db')

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')

def connect():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASS,
        dbname=DB_NAME
    )

def nan_to_none(v):
    if v is None:
        return None
    try:
        return None if math.isnan(v) else v
    except TypeError:
        return v

def importer_eau():
    path = os.path.join(OUTPUT_DIR, 'eau_journalier.csv')
    if not os.path.exists(path):
        print(f'  ✗  {path} introuvable')
        return

    df = pd.read_csv(path, parse_dates=['date_releve'])
    df = df.sort_values('date_releve').reset_index(drop=True)
    print(f'  CSV eau     : {len(df)} lignes')

    with connect() as conn, conn.cursor() as cur:
        # Dates déjà présentes dans la table
        cur.execute('SELECT date_releve::TEXT FROM consommation_eau')
        existing = {r[0] for r in cur.fetchall()}
        print(f'  DB eau      : {len(existing)} lignes existantes')

        rows = []
        for _, r in df.iterrows():
            date_str = r['date_releve'].strftime('%Y-%m-%d')
            if date_str in existing:
                continue
            compteur      = nan_to_none(r.get('index_compteur_m3'))
            conso_jour    = nan_to_none(r.get('consommation_jour_m3'))
            cout_total    = nan_to_none(r.get('cout_jour_tnd'))
            if compteur is None:
                continue
            rows.append((date_str, float(compteur),
                         float(conso_jour) if conso_jour is not None else None,
                         float(cout_total) if cout_total is not None else None))

        if not rows:
            print('  → Rien à importer (toutes les dates existent déjà)')
            return

        execute_values(cur,
            """INSERT INTO consommation_eau (date_releve, compteur, consommation_jour, cout_total)
               VALUES %s ON CONFLICT DO NOTHING""",
            rows
        )
        conn.commit()
        print(f'  ✓  {len(rows)} lignes importées dans consommation_eau')

# ── ÉLECTRICITÉ ───────────────────────────────────────────────────────────────
# Colonnes CSV : id, date_releve, annee_mois, index_ph1_kwh, index_ph2_kwh,
#                index_ph3_kwh, consommation_jour_kwh, cout_jour_tnd, created_at
# Table app    : id, date_releve, phase1, phase2, phase3, consommation_jour, cout_total
#
# Stratégie :
#  - phase1/2/3 = delta d'index entre la ligne courante et la précédente
#  - consommation_jour = somme des 3 deltas (ou valeur CSV si disponible)
#  - Si delta négatif ou NaN → ligne ignorée (changement de compteur, première ligne)
def importer_electricite():
    path = os.path.join(OUTPUT_DIR, 'electricite_journalier.csv')
    if not os.path.exists(path):
        print(f'  ✗  {path} introuvable')
        return

    df = pd.read_csv(path, parse_dates=['date_releve'])
    df = df.sort_values('date_releve').reset_index(drop=True)
    print(f'  CSV élec    : {len(df)} lignes')

    with connect() as conn, conn.cursor() as cur:
        cur.execute('SELECT date_releve::TEXT FROM consommation_electricite')
        existing = {r[0] for r in cur.fetchall()}
        print(f'  DB élec     : {len(existing)} lignes existantes')

        rows = []
        for i, r in df.iterrows():
            date_str = r['date_releve'].strftime('%Y-%m-%d')
            if date_str in existing:
                continue

            # Première ligne ou index précédent manquant → pas de delta possible
            if i == 0:
                continue
            prev = df.iloc[i - 1]

            idx1 = nan_to_none(r.get('index_ph1_kwh'))
            idx2 = nan_to_none(r.get('index_ph2_kwh'))
            idx3 = nan_to_none(r.get('index_ph3_kwh'))
            prev1 = nan_to_none(prev.get('index_ph1_kwh'))
            prev2 = nan_to_none(prev.get('index_ph2_kwh'))
            prev3 = nan_to_none(prev.get('index_ph3_kwh'))

            if any(v is None for v in [idx1, idx2, idx3, prev1, prev2, prev3]):
                continue

            ph1 = float(idx1) - float(prev1)
            ph2 = float(idx2) - float(prev2)
            ph3 = float(idx3) - float(prev3)

            # Delta négatif = changement de compteur ou erreur de saisie → skip
            if ph1 < 0 or ph2 < 0 or ph3 < 0:
                continue

            conso_csv = nan_to_none(r.get('consommation_jour_kwh'))
            conso_jour = float(conso_csv) if conso_csv is not None else round(ph1 + ph2 + ph3, 3)

            cout_csv  = nan_to_none(r.get('cout_jour_tnd'))
            cout_total = float(cout_csv) if cout_csv is not None else round(conso_jour * 0.291, 3)

            rows.append((date_str, round(ph1, 3), round(ph2, 3), round(ph3, 3),
                         round(conso_jour, 3), round(cout_total, 3)))

        if not rows:
            print('  → Rien à importer (toutes les dates existent déjà)')
            return

        execute_values(cur,
            """INSERT INTO consommation_electricite
                 (date_releve, phase1, phase2, phase3, consommation_jour, cout_total)
               VALUES %s ON CONFLICT DO NOTHING""",
            rows
        )
        conn.commit()
        print(f'  ✓  {len(rows)} lignes importées dans consommation_electricite')

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print('=' * 55)
    print('  IMPORT ÉNERGIE → eleonetech_db')
    print('=' * 55)

    print('\n[EAU]')
    importer_eau()

    print('\n[ÉLECTRICITÉ]')
    importer_electricite()

    print('\n' + '=' * 55)
    print('  Import terminé.')
    print('=' * 55)
