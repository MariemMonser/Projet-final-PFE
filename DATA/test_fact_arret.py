"""
test_fact_arret.py  —  Test the 4 fact_arret functions in isolation
====================================================================
Runs WITHOUT dropping or rebuilding the DW.

Steps:
  1. diagnose_code_mapping  → show unmatched codes (read-only)
  2. audit_fact_arret       → count NULLs before fix (read-only)
  3. fix_fact_arret_nulls   → patch existing NULL rows
  4. audit_fact_arret       → count NULLs after fix (should be 0)
  5. load_fact_arret        → full reload with force-delete + re-insert
  6. audit_fact_arret       → final check

Usage:
    cd DATA
    python test_fact_arret.py
"""

from load_dwtest import (
    get_engine,
    diagnose_code_mapping,
    audit_fact_arret,
    fix_fact_arret_nulls,
    load_fact_arret,
)
from sqlalchemy import text

DB_STAGING = "eleonetech_staging"
DB_DW      = "eleonetech_dw"

def separator(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)

def main():
    engine_stg = get_engine(DB_STAGING)
    engine_dw  = get_engine(DB_DW)

    # Verify connections
    for eng, name in [(engine_stg, DB_STAGING), (engine_dw, DB_DW)]:
        try:
            with eng.connect() as c:
                c.execute(text("SELECT 1"))
            print(f"✓ Connected to {name}")
        except Exception as e:
            print(f"✗ Cannot connect to {name}: {e}")
            return

    # ── Step 1: diagnostic (read-only, no changes)
    separator("STEP 1 — Diagnostic: code_ligne vs code_equipement")
    diagnose_code_mapping(engine_stg)

    # ── Step 2: audit BEFORE fix
    separator("STEP 2 — Audit: NULLs in fact_arret BEFORE fix")
    n_before = audit_fact_arret(engine_dw)

    # ── Step 3: fix existing NULL rows
    separator("STEP 3 — Fix existing NULL rows (patch in-place)")
    if n_before == 0:
        print("  Nothing to fix — no NULLs found.")
    else:
        fix_fact_arret_nulls(engine_dw)

    # ── Step 4: audit AFTER fix
    separator("STEP 4 — Audit: NULLs in fact_arret AFTER fix")
    n_after = audit_fact_arret(engine_dw)
    if n_after == 0:
        print("\n  ✓ All NULLs patched successfully.")
    else:
        print(f"\n  ⚠  {n_after} NULL columns remain — will be resolved by full reload (Step 5).")

    # ── Step 5: full reload (DELETE existing rows + re-insert from staging)
    separator("STEP 5 — Full reload: load_fact_arret (force-refresh)")
    load_fact_arret(engine_stg, engine_dw)

    # ── Step 6: final audit
    separator("STEP 6 — Final audit after full reload")
    n_final = audit_fact_arret(engine_dw)
    if n_final == 0:
        print("\n  ✓ fact_arret is clean — no NULLs in any metric column.")
    else:
        print(f"\n  ⚠  {n_final} NULL columns still present.")
        print("     Check the NO_MATCH codes logged in Step 1 and Step 5.")
        print("     Those lines have no curative OTs → sum_ttr_h = 0 is correct,")
        print("     but mttr_h/mtbf_h/dispo should still be computed.")
        print("     Re-run fix_fact_arret_nulls() to patch them.")
        fix_fact_arret_nulls(engine_dw)
        audit_fact_arret(engine_dw)

    separator("DONE")

if __name__ == "__main__":
    main()
