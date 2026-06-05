import re
import csv
import calendar
import warnings
from pathlib import Path
from datetime import datetime

import pdfplumber
import pandas as pd

warnings.filterwarnings("ignore")

BASE_DIR   = Path(__file__).parent
OUTPUT_DIR = BASE_DIR / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

CREATED_AT = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

DIR_COUT      = BASE_DIR / "Cout_materiel"
DIR_DIVERS    = BASE_DIR / "Divers"
DIR_ENERGY    = BASE_DIR / "energy"
DIR_MASTERS   = BASE_DIR / "masters"
DIR_SITUATION = BASE_DIR / "Situation_mensuelle"
DIR_TAUX      = BASE_DIR / "Taux disponbilite"

MOIS_MAP = {
    "janvier":1, "février":2, "fevrier":2, "mars":3, "avril":4,
    "mai":5, "juin":6, "juillet":7, "août":8, "aout":8,
    "septembre":9, "octobre":10, "novembre":11, "décembre":12, "decembre":12,
}

MOIS_FILENAME = {
    "Janvier":1, "Fevrier":2, "Mars":3, "Avril":4, "Mai":5,
    "Juin":6, "Juillet":7, "Aout":8, "Septembre":9,
    "Octobre":10, "Novembre":11, "Decembre":12,
}

ZONES = {"BAT", "CMS", "MAG", "MEZ", "SEP", "THT", "UAP4", "UAP1", "UAP2", "UAP3"}


def fr_float(s):
    if s is None:
        return None
    try:
        return float(str(s).replace(" ", "").replace(",", ".").strip("%"))
    except (ValueError, AttributeError):
        return None


def write_csv(path, rows, headers):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    print(f"  ✓  {path.name:<55} {len(rows):>5} lignes")


def pdf_lines(path):
    lines = []
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            lines.extend(l.strip() for l in text.split("\n") if l.strip())
    return lines


def mois_from_taux_filename(name):
    for mois_str, mois_num in MOIS_FILENAME.items():
        if mois_str in name:
            m = re.search(r"(\d{4})", name)
            if m:
                return int(m.group(1)), mois_num, mois_str.upper()
    return None, None, None


def print_diagnostic():
    print("\n  Fichiers détectés :")
    checks = [
        (DIR_DIVERS,  "Charges_employes*.pdf",         "Charges employés"),
        (DIR_COUT,    "Cout_materiel*.pdf",            "Coût matériel"),
        (DIR_SITUATION,"Situation_mensuelle_*.pdf",    "Situation mensuelle"),
        (DIR_TAUX,    "TauxDisponibilit*.pdf",         "Taux disponibilité"),
        (DIR_ENERGY,  "energie_eau.csv",               "Energie eau"),
        (DIR_ENERGY,  "energie_electricite.csv",       "Energie electricite"),
        (DIR_ENERGY,  "energie_photovoltaique.csv",    "Energie photovoltaique"),
        (DIR_MASTERS, "prc.xlsx",                      "Catalogue PRC"),
        (DIR_MASTERS, "Mouvements par article*.csv",   "Mouvements stock"),
    ]
    all_ok = True
    for folder, pattern, label in checks:
        if not folder.exists():
            print(f"    [!!] {label:<35} DOSSIER INTROUVABLE : {folder.name}")
            all_ok = False
            continue
        files = sorted(folder.glob(pattern))
        if files:
            print(f"    [OK] {label:<35} {len(files)} fichier(s)")
        else:
            print(f"    [!!] {label:<35} AUCUN FICHIER (pattern: {pattern})")
            all_ok = False
    if not all_ok:
        print(f"\n  ⚠  BASE_DIR = {BASE_DIR.resolve()}")
    print()


def extract_charges_employes():
    print("[1/7] Charges employés")

    RE_EMPLOYEE = re.compile(r"^([A-Z0-9]{2,6})\s+(.+?)\s+(\d+[,]\d+)$")
    RE_OT_START = re.compile(r"^(20\d{8})\s")
    RE_DATE_HRS = re.compile(r"(\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2})\s+([\d,]+)$")
    RE_EQUIP = re.compile(
        r"\b([A-Z]{2,}(?:[-_][A-Z0-9]+)+)\b"  # pattern normal : EOT010153, INF-ASP-01
)
    RE_FOOTER   = re.compile(r"^\d{2}/\d{2}/\d{4}\s+\d{2}:\d{2}:\d{2}")
    SKIP        = ["Charges des Employés", "Du ", "Au ", "Matricule Nom",
                   "OT Interventio", "Page ", "Total Hrs", "Nbr OT"]

    def parse_pdf(path):
        lines = pdf_lines(path)
        periode_debut = periode_fin = ""
        for line in lines[:10]:
            m = re.search(r"Du\s+(\d{2}/\d{2}/\d{4})", line)
            if m: periode_debut = m.group(1)
            m = re.search(r"Au\s+(\d{2}/\d{2}/\d{4})", line)
            if m: periode_fin = m.group(1)
        annee_m = re.search(r"(202\d)", path.name)
        annee = int(annee_m.group(1)) if annee_m else None

        records = []
        matricule = nom = total_hrs = None
        for line in lines:
            if RE_FOOTER.match(line) or any(line.startswith(p) for p in SKIP):
                continue
            m = RE_EMPLOYEE.match(line)
            if m and not re.match(r"^20[2-9]\d{7}$", m.group(1)):
                matricule = m.group(1)
                nom       = m.group(2).strip()
                total_hrs = fr_float(m.group(3))
                continue
            if RE_OT_START.match(line) and matricule:
                m_date = RE_DATE_HRS.search(line)
                if not m_date:
                    continue
                tokens = line[:m_date.start()].split()
                numero = tokens[0]
                rest   = " ".join(tokens[1:])
                m_eq   = RE_EQUIP.search(rest)
                if m_eq:
                    equip  = m_eq.group(1)
                    interv = rest[:m_eq.start()].strip() or "Intervention"
                    desc   = rest[m_eq.end():].strip() or equip
                else:
                    equip = ""; interv = "Intervention"; desc = rest
                records.append({
                    "matricule": matricule, "nom_prenom": nom,
                    "numero_ot": numero, "type_intervention": interv,
                    "code_equipement": equip, "description_equipement": desc,
                    "date_debut": m_date.group(1),
                    "hrs_travaux": fr_float(m_date.group(2)),
                    "periode_debut": periode_debut, "periode_fin": periode_fin,
                    "annee": annee, "created_at": CREATED_AT,
                    "total_hrs_employe": total_hrs,
                })
        return records

    all_rows = []
    for pdf in sorted(DIR_DIVERS.glob("Charges_employes*.pdf")):
        rows = parse_pdf(pdf)
        all_rows.extend(rows)
        print(f"     {pdf.name}: {len(rows)} OTs")

    for i, r in enumerate(all_rows, 1):
        r["id"] = i

    headers = ["id", "matricule", "nom_prenom", "numero_ot", "type_intervention",
               "code_equipement", "description_equipement", "date_debut",
               "hrs_travaux", "periode_debut", "periode_fin", "annee",
               "created_at", "total_hrs_employe"]
    write_csv(OUTPUT_DIR / "charges_employes.csv", all_rows, headers)


def extract_situation_mensuelle():
    print("[2/7] Situation mensuelle")
    RE_DATE   = re.compile(r"Du\s+(\w+)\s+Au\s+\w+\s+(\d{4})", re.IGNORECASE)
    RE_ENTITE = re.compile(r"Entité\s*:\s*(\w+)")
    rows = []

    for path in sorted(DIR_SITUATION.glob("Situation_mensuelle_*.pdf")):
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                lines = [l.strip() for l in (page.extract_text() or "").split("\n") if l.strip()]
                mois = annee = entite = None
                for line in lines:
                    m = RE_DATE.search(line)
                    if m: mois = m.group(1).upper(); annee = int(m.group(2))
                    m = RE_ENTITE.search(line)
                    if m: entite = m.group(1)
                    if line.startswith("TOTAL") and mois:
                        p = line.split()
                        if len(p) >= 10:
                            rows.append({
                                "id": len(rows)+1, "annee": annee, "mois": mois,
                                "mois_num": MOIS_MAP.get(mois.lower()), "entite": entite,
                                "ot_lance_prev": fr_float(p[1]), "ot_lance_cura": fr_float(p[2]),
                                "ot_lance_autre": fr_float(p[3]), "ot_honore_prev": fr_float(p[4]),
                                "ot_honore_cura": fr_float(p[5]), "ot_honore_autre": fr_float(p[6]),
                                "pct_real_prev": p[7], "pct_real_cura": p[8],
                                "pct_real_autre": p[9], "created_at": CREATED_AT,
                            })

    headers = ["id", "annee", "mois", "mois_num", "entite",
               "ot_lance_prev", "ot_lance_cura", "ot_lance_autre",
               "ot_honore_prev", "ot_honore_cura", "ot_honore_autre",
               "pct_real_prev", "pct_real_cura", "pct_real_autre", "created_at"]
    write_csv(OUTPUT_DIR / "situation_mensuelle.csv", rows, headers)


def extract_cout_materiel():
    print("[3/7] Coût matériel")
    RE_DU = re.compile(r"Du\s+(\d{2}/\d{2}/\d{4})\s+Au\s+(\d{2}/\d{2}/\d{4})")
    TYPES = {"Curative", "Préventive"}
    rows  = []

    for path in sorted(DIR_COUT.glob("Cout_materiel*.pdf")):
        with pdfplumber.open(path) as pdf:
            lines = [l.strip() for l in (pdf.pages[0].extract_text() or "").split("\n") if l.strip()]
        date_debut = date_fin = entite = zone = annee = mois = None

        for line in lines:
            m = RE_DU.search(line)
            if m:
                date_debut, date_fin = m.group(1), m.group(2)
                annee = int(date_debut[-4:]); mois = int(date_debut[3:5])
            if " : " in line and date_debut:
                entite = line.split(":")[0].strip().split()[-1]
            for z in ZONES:
                if line == z or line.startswith(z + " "):
                    zone = z
                    p = line.split()
                    if len(p) == 2:
                        rows.append({"id": len(rows)+1, "date_debut": date_debut,
                            "date_fin": date_fin, "annee": annee, "mois": mois,
                            "entite": entite, "zone": zone, "type_intervention": "Total",
                            "cout_tnd": fr_float(p[1]), "created_at": CREATED_AT})
            for t in TYPES:
                if line.startswith(t) and zone and date_debut:
                    rows.append({"id": len(rows)+1, "date_debut": date_debut,
                        "date_fin": date_fin, "annee": annee, "mois": mois,
                        "entite": entite, "zone": zone, "type_intervention": t,
                        "cout_tnd": fr_float(line[len(t):].strip()),
                        "created_at": CREATED_AT})

    headers = ["id", "date_debut", "date_fin", "annee", "mois", "entite",
               "zone", "type_intervention", "cout_tnd", "created_at"]
    write_csv(OUTPUT_DIR / "cout_materiel.csv", rows, headers)


def extract_taux_disponibilite():
    print("[4/7] Taux de disponibilité")
    RE_DU     = re.compile(r"DU\s*:\s*(\d{2}/\d{2}/\d{4})\s+AU\s*:\s*(\d{2}/\d{2}/\d{4})")
    RE_ENTITE = re.compile(r"Entité\s*:\s*(.+)")
    rows = []

    for path in sorted(DIR_TAUX.glob("TauxDisponibilit*.pdf")):
        annee_fn, mois_fn, mois_name_fn = mois_from_taux_filename(path.name)

        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                lines = [l.strip() for l in (page.extract_text() or "").split("\n") if l.strip()]
                date_debut = date_fin = entite = None

                for line in lines:
                    m = RE_DU.search(line)
                    if m: date_debut, date_fin = m.group(1), m.group(2)
                    m = RE_ENTITE.search(line)
                    if m: entite = m.group(1).strip()

                # Fallback depuis nom fichier si dates non trouvées dans le PDF
                if not date_debut and annee_fn and mois_fn:
                    last_day = calendar.monthrange(annee_fn, mois_fn)[1]
                    date_debut = f"01/{mois_fn:02d}/{annee_fn}"
                    date_fin   = f"{last_day:02d}/{mois_fn:02d}/{annee_fn}"

                annee = int(date_debut[-4:]) if date_debut else annee_fn
                mois  = int(date_debut[3:5]) if date_debut else mois_fn

                for line in lines:
                    parts = line.split()
                    if not (parts and parts[0].isdigit() and len(parts) >= 9 and "%" in parts[-1]):
                        continue
                    if not re.match(r"^[A-Z]{2,}[A-Z0-9]*$", parts[1]):
                        continue
                    try:
                        dispo = fr_float(parts[-1])
                        if dispo is None or not (0 <= dispo <= 100):
                            continue
                        code = parts[1]
                        if len(code) < 3:
                            continue
                        rows.append({
                            "id": len(rows)+1, "date_debut": date_debut,
                            "date_fin": date_fin, "annee": annee, "mois": mois,
                            "mois_libelle": mois_name_fn or "", "entite": entite or "",
                            "num_ligne": int(parts[0]), "code_ligne": code,
                            "description": " ".join(parts[2:-7]),
                            "t_ouverture": fr_float(parts[-7]), "t_arret": fr_float(parts[-6]),
                            "nb_arret": fr_float(parts[-5]), "tbf": fr_float(parts[-4]),
                            "mtbf": fr_float(parts[-3]), "mttr": fr_float(parts[-2]),
                            "disponibilite_pct": dispo, "created_at": CREATED_AT,
                        })
                    except Exception:
                        pass

    headers = ["id", "date_debut", "date_fin", "annee", "mois", "mois_libelle",
               "entite", "num_ligne", "code_ligne", "description",
               "t_ouverture", "t_arret", "nb_arret", "tbf", "mtbf", "mttr",
               "disponibilite_pct", "created_at"]
    write_csv(OUTPUT_DIR / "taux_disponibilite.csv", rows, headers)


# ═══════════════════════════════════════════════════════════════════════════════
# 6. ÉNERGIE
# ═══════════════════════════════════════════════════════════════════════════════

def extract_energie():
    print("[5/7] Énergie")

    # Lecture des CSV exportes depuis l'application web et generation directe
    # des fichiers stg_energie_*.

    print("     [1/3] Eau")
    eau_src = DIR_ENERGY / "energie_eau.csv"
    if not eau_src.exists():
        print(f"  ! {eau_src.name} introuvable")
    else:
        df = pd.read_csv(eau_src, encoding="utf-8-sig")
        df = df.rename(columns={
            "compteur": "compteur_m3",
            "consommation_jour": "consommation_jour_m3",
            "cout_total": "cout_jour_tnd",
        })
        keep = ["id", "date_releve", "compteur_m3", "consommation_jour_m3", "cout_jour_tnd"]
        df = df[[c for c in keep if c in df.columns]]
        if "consommation_jour_m3" in df.columns:
            df = df[df["consommation_jour_m3"].notna()]
        df = df.reset_index(drop=True)
        df["id"] = range(1, len(df) + 1)
        df["created_at"] = CREATED_AT
        df.to_csv(OUTPUT_DIR / "stg_energie_eau.csv", index=False, encoding="utf-8-sig")
        print(f"  [OK] stg_energie_eau.csv{'':<31} {len(df):>5} lignes")

    print("     [2/3] Electricite")
    elec_src = DIR_ENERGY / "energie_electricite.csv"
    if not elec_src.exists():
        print(f"  ! {elec_src.name} introuvable")
    else:
        df = pd.read_csv(elec_src, encoding="utf-8-sig")
        df = df.rename(columns={
            "phase1": "phase1_kwh",
            "phase2": "phase2_kwh",
            "phase3": "phase3_kwh",
            "consommation_jour": "consommation_jour_kwh",
            "cout_total": "cout_jour_tnd",
        })
        keep = [
            "id", "date_releve", "phase1_kwh", "phase2_kwh", "phase3_kwh",
            "consommation_jour_kwh", "cout_jour_tnd",
        ]
        df = df[[c for c in keep if c in df.columns]]
        if "date_releve" in df.columns:
            df = df[df["date_releve"].notna()]
        df = df.reset_index(drop=True)
        df["id"] = range(1, len(df) + 1)
        df["created_at"] = CREATED_AT
        df.to_csv(OUTPUT_DIR / "stg_energie_electricite.csv", index=False, encoding="utf-8-sig")
        print(f"  [OK] stg_energie_electricite.csv{'':<23} {len(df):>5} lignes")

    print("     [3/3] Photovoltaique")
    pv_src = DIR_ENERGY / "energie_photovoltaique.csv"
    if not pv_src.exists():
        print(f"  ! {pv_src.name} introuvable")
    else:
        df = pd.read_csv(pv_src, encoding="utf-8-sig")
        keep = [
            "id", "date", "mois", "puissance_installee_kwp",
            "production_journaliere_kwh", "production_cumulee_kwh",
            "heures_equivalentes_h",
        ]
        df = df[[c for c in keep if c in df.columns]]
        if "date" in df.columns:
            df = df[df["date"].notna()]
        df = df.reset_index(drop=True)
        df["id"] = range(1, len(df) + 1)
        df["created_at"] = CREATED_AT
        df.to_csv(OUTPUT_DIR / "stg_energie_pv.csv", index=False, encoding="utf-8-sig")
        print(f"  [OK] stg_energie_pv.csv{'':<32} {len(df):>5} lignes")


# ═══════════════════════════════════════════════════════════════════════════════
# 7. CATALOGUE PRC
# ═══════════════════════════════════════════════════════════════════════════════

def extract_prc_catalogue():
    print("[6/7] Catalogue PRC")
    prc_path = DIR_MASTERS / "prc.xlsx"
    if not prc_path.exists():
        print("  ! prc.xlsx introuvable"); return

    df = pd.read_excel(prc_path)
    df.columns = ["equipement", "code_prc", "designation", "cout_tnd"]
    df["equipement"]     = df["equipement"].ffill()
    df = df.dropna(subset=["code_prc"])
    df["code_prc"]        = df["code_prc"].astype(str).str.strip()
    df["code_prc_format"] = "PRC" + df["code_prc"].str.zfill(8)
    df["designation"]     = df["designation"].astype(str).str.strip().str.capitalize()
    df["cout_tnd"]        = df["cout_tnd"].apply(fr_float)
    df.insert(0, "id", range(1, len(df)+1))
    df["created_at"]      = CREATED_AT

    df.to_csv(OUTPUT_DIR / "pieces_rechange_catalogue.csv", index=False, encoding="utf-8-sig")
    print(f"  ✓  pieces_rechange_catalogue.csv{'':<24} {len(df):>5} lignes")


# ═══════════════════════════════════════════════════════════════════════════════
# 8. MOUVEMENTS DE STOCK
# ═══════════════════════════════════════════════════════════════════════════════

def extract_mouvements():
    print("[7/7] Mouvements de stock PRC")

    def parse_line(line):
        """Parse ligne CSV Coswin — gère format avec ou sans guillemets."""
        line = line.strip().rstrip('\r')
        if line.startswith('"'):
            cells = line.split('";"')
            cells[0]  = cells[0].lstrip('"')
            cells[-1] = cells[-1].rstrip('"').rstrip(';')
        else:
            cells = line.split(';')
        return [c.strip().strip('"') for c in cells]

    mouv_rows = []

    for path in sorted(DIR_MASTERS.glob("Mouvements par article PRC*.csv")):
        # ── Code PRC depuis nom fichier ──────────────────────────
        prc_m    = re.search(r"PRC(\d+)", path.name)
        code_prc = f"PRC{prc_m.group(1).zfill(8)}" if prc_m else "PRC00000000"

        # ── Lecture encodage auto (utf-8-sig gère le BOM) ────────
        for enc in ["utf-8-sig", "utf-8", "latin-1"]:
            try:
                content = path.read_text(encoding=enc, errors="replace")
                break
            except Exception:
                continue

        lines = content.split("\n")

        # ── Nom article depuis ligne ZITMREF ─────────────────────
        nom_article = ""
        for l in lines:
            if "ZITMREF" in l:
                parts = parse_line(l)
                if len(parts) >= 3:
                    nom_article = parts[2].strip()
                break

        # ── Ligne header technique (STOFCY + IPTDAT) ─────────────
        header_idx = next(
            (i for i, l in enumerate(lines)
             if "STOFCY" in l and "IPTDAT" in l),
            None
        )
        if header_idx is None:
            print(f"     WARNING {path.name}: header introuvable")
            continue

        # ── Indexer TOUTES les colonnes en MAJUSCULES ─────────────
        raw_cols = parse_line(lines[header_idx])
        col_idx  = {
            col.strip().upper(): idx
            for idx, col in enumerate(raw_cols)
            if col.strip() and col.strip() not in ('', ';')
        }

        # ── Données : header_idx + 2 (sauter ligne labels FR) ────
        file_rows = 0
        for line in lines[header_idx + 2:]:
            line = line.strip().rstrip('\r')
            if not line or line.replace('"','').replace(';','').strip() == '':
                continue

            cells = parse_line(line)
            if len(cells) < 5:
                continue

            # Quantité obligatoire
            qty_idx = col_idx.get("QTYPCU")
            qty_raw = cells[qty_idx].strip() \
                if qty_idx is not None and qty_idx < len(cells) else None
            try:
                qty = float(qty_raw.replace(",", ".")) if qty_raw else None
            except (ValueError, AttributeError):
                qty = None
            if qty is None:
                continue

            # Date DD/MM/YYYY → YYYY-MM-DD
            date_idx = col_idx.get("IPTDAT")
            date_raw = cells[date_idx].strip() \
                if date_idx is not None and date_idx < len(cells) else None
            try:
                date_iso = datetime.strptime(
                    date_raw, "%d/%m/%Y").strftime("%Y-%m-%d") if date_raw else None
            except (ValueError, TypeError):
                date_iso = date_raw

            annee_mois = date_iso[:7] if date_iso and len(date_iso) >= 7 else None
            direction  = "sortie" if qty < 0 else "entree"

            # ── Colonnes fixes ────────────────────────────────────
            row = {
                "id":          len(mouv_rows) + 1,
                "code_prc":    code_prc,
                "nom_article": nom_article,
                "direction":   direction,
                "annee_mois":  annee_mois,
            }

            # ── Toutes les colonnes Coswin en minuscules ──────────
            for col, idx in col_idx.items():
                val = cells[idx].strip() if idx < len(cells) else ""
                row[col.lower()] = val if val not in ("", "nan") else None

            row["created_at"] = CREATED_AT
            mouv_rows.append(row)
            file_rows += 1

        print(f"     {path.name}: {file_rows} mouvements")

    if mouv_rows:
        fixed   = ["id", "code_prc", "nom_article", "direction", "annee_mois"]
        tech    = [c for c in mouv_rows[0] if c not in fixed + ["created_at"]]
        headers = fixed + tech + ["created_at"]
        write_csv(OUTPUT_DIR / "pieces_rechange_mouvements.csv", mouv_rows, headers)
    else:
        print("  ! Aucun mouvement extrait")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 62)
    print("  ETL EXTRACT  —  Eleonetech")
    print(f"  {CREATED_AT}")
    print(f"  BASE_DIR : {BASE_DIR.resolve()}")
    print("=" * 62)
    print_diagnostic()

    extract_charges_employes()
    extract_situation_mensuelle()
    extract_cout_materiel()
    extract_taux_disponibilite()
    extract_energie()
    extract_prc_catalogue()
    extract_mouvements()

    print("\n" + "=" * 62)
    print(f"  CSVs générés dans : {OUTPUT_DIR.resolve()}")
    print("=" * 62)
    for c in sorted(OUTPUT_DIR.glob("*.csv")):
        with open(c, encoding="utf-8-sig") as f:
            n = sum(1 for _ in f) - 1
        print(f"  {c.name:<55} {n:>5} lignes")
    print("=" * 62)


if __name__ == "__main__":
    main()
