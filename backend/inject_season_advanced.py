#!/usr/bin/env python3
"""
inject_season_advanced.py — Erweitert season_lines um Advanced Rates pro Saison
================================================================================
Liest barttorvik_complete_final.csv, joined per (player_id|name, yr) und schreibt
fehlende Felder (astP, toP, stlP, blkP, orbP, drbP, ftr, threePAr, dunkR) in
JEDE Saison-Zeile innerhalb des season_lines BLOB.

WHY: seasonLines werden im Pipeline-Schritt 11 aus per-game-Counting-Stats erzeugt
und enthalten nur ts, usg, bpm + Counting-Stats. Frontend-Tabellen (Development-Tab,
Mind-Tab) brauchen aber AST% / TO% / etc. pro Saison für vernünftige Darstellung.

Tobias 2026-05-09: Quick fix — wir patchen die season_lines-BLOBs in-place,
ohne komplette Pipeline-Re-Run.
"""
from __future__ import annotations
import sqlite3, zlib, json, sys, re, unicodedata
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent
DB = BASE / "data" / "processed" / "prospecttheory.db"
BART_CSV = BASE / "data" / "raw" / "barttorvik_complete_final.csv"

# Felder die wir aus Bart in seasonLines hinzufügen
# Tobias 2026-05-09: Bart 'yr' Spalte ist NCAA-Klasse (Fr/So/Jr/Sr) — wir nutzen
# 'season_year' für das Saisonjahr-Match.
EXTRA_FIELDS = {
    "astP": "AST_per",
    "toP":  "TO_per",
    "stlP": "stl_per",
    "blkP": "blk_per",
    "orbP": "ORB_per",
    "drbP": "DRB_per",
    "ftr":  "ftr",            # FT rate (FTA/FGA)
    "threePAr": "TPA",        # 3-pt attempts (per game proxy — better than nothing)
}

SUFFIX_RX = re.compile(r"\s+(jr\.?|sr\.?|i+v?|ii+)\.?\s*$", re.IGNORECASE)

def norm_name(s):
    if not isinstance(s, str): return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace(".", "").replace("'", "").replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = SUFFIX_RX.sub("", s).strip()
    return s

def safe_num(v):
    if v is None or pd.isna(v):
        return None
    try:
        f = float(v)
        if f != f or f in (float("inf"), float("-inf")):
            return None
        return round(f, 2)
    except (TypeError, ValueError):
        return None


def main():
    if not BART_CSV.exists():
        sys.exit(f"ERROR: {BART_CSV} not found — needed for season-by-season AST%/TO%")

    print(f"Loading Bart-CSV: {BART_CSV}")
    # Use 'season_year' (numeric year) instead of 'yr' (which is NCAA class Fr/So/Jr/Sr)
    cols = ["player_name", "season_year"] + [c for c in EXTRA_FIELDS.values() if c]
    bart = pd.read_csv(BART_CSV, usecols=lambda c: c in cols, low_memory=False)
    bart = bart.dropna(subset=["player_name", "season_year"])
    bart["season_year"] = pd.to_numeric(bart["season_year"], errors="coerce")
    bart = bart.dropna(subset=["season_year"])
    bart["season_year"] = bart["season_year"].astype(int)
    bart["_nname"] = bart["player_name"].apply(norm_name)
    print(f"  {len(bart):,} player-season rows from Bart")

    # Build (nname, season_year) → row dict
    season_lookup = {}
    for _, r in bart.iterrows():
        key = (r["_nname"], int(r["season_year"]))
        if key not in season_lookup:
            season_lookup[key] = {dst: safe_num(r.get(src)) for dst, src in EXTRA_FIELDS.items()}
    print(f"  Lookup-keys: {len(season_lookup):,} unique (name+season_year)")

    # Iterate season_lines
    if not DB.exists():
        sys.exit(f"ERROR: DB not found at {DB}")
    conn = sqlite3.connect(DB)
    rows = conn.execute("SELECT player_id, data FROM season_lines").fetchall()
    print(f"\nDB season_lines: {len(rows):,}")

    # Need name lookup from profiles
    name_by_pid = dict(conn.execute("SELECT player_id, name FROM profiles").fetchall())

    updated, n_seasons_filled, n_pid_no_match = 0, 0, 0
    update_rows = []
    for player_id, blob in rows:
        try:
            seasons = json.loads(zlib.decompress(blob).decode("utf-8"))
        except Exception:
            continue
        if not isinstance(seasons, list):
            continue

        nname = norm_name(name_by_pid.get(player_id, ""))
        any_changed = False
        for s in seasons:
            yr = s.get("yr")
            try:
                yr_int = int(float(yr)) if yr is not None else None
            except (TypeError, ValueError):
                yr_int = None
            if yr_int is None:
                continue
            extras = season_lookup.get((nname, yr_int))
            if not extras:
                continue
            for k, v in extras.items():
                if v is not None and s.get(k) is None:
                    s[k] = v
                    any_changed = True
            if any_changed:
                n_seasons_filled += 1
        if any_changed:
            new_blob = zlib.compress(json.dumps(seasons, separators=(",", ":")).encode("utf-8"), level=9)
            update_rows.append((new_blob, player_id))
            updated += 1
        if not any_changed and nname not in [norm_name(name_by_pid.get(pid, "")) for pid in [player_id]]:
            n_pid_no_match += 1

    print(f"  Updated profiles: {updated:,}  ({n_seasons_filled:,} season-rows enriched)")

    # Bulk write
    if update_rows:
        print(f"\nWriting back...")
        conn.execute("BEGIN TRANSACTION")
        try:
            conn.executemany("UPDATE season_lines SET data=? WHERE player_id=?", update_rows)
            conn.commit()
        except Exception as e:
            conn.rollback()
            sys.exit(f"ERROR during commit: {e}")
        print(f"✅ {len(update_rows):,} season_lines BLOBs updated")

    # Verification: read back Cooper Flagg + Trae Young
    print(f"\nVerification:")
    for name in ["Cooper Flagg", "Trae Young", "Cooper Flagg"]:
        r = conn.execute(
            "SELECT s.data FROM season_lines s JOIN profiles p ON s.player_id=p.player_id WHERE LOWER(p.name)=LOWER(?) LIMIT 1",
            (name,)
        ).fetchone()
        if r is None:
            print(f"  {name:<20} — not in DB")
            continue
        seasons = json.loads(zlib.decompress(r[0]).decode("utf-8"))
        latest = seasons[-1] if seasons else {}
        print(f"  {name:<20}  yr={latest.get('yr')} usg={latest.get('usg')} astP={latest.get('astP')} toP={latest.get('toP')} stlP={latest.get('stlP')} blkP={latest.get('blkP')} ftr={latest.get('ftr')}")
    conn.close()


if __name__ == "__main__":
    main()
