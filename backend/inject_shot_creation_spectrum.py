"""
inject_shot_creation_spectrum.py
================================
Enriches prospecttheory.db profile blobs with zone-level shot creation data
from pbp_shot_creation.csv.

New fields added to each profile (under key "shotCreation"):
{
  "rim":  {"fga": int, "pct": float, "selfPct": float, "selfFgPct": float, "astFgPct": float},
  "mid":  {"fga": int, "pct": float, "selfPct": float, "selfFgPct": float, "astFgPct": float},
  "three":{"fga": int, "pct": float, "selfPct": float, "selfFgPct": float, "astFgPct": float},
  "dunk": {"fga": int, "pct": float, "selfPct": float},
  "overall": {"fga": int, "selfPct": float, "n": int},
}

Where:
  - fga: field goal attempts in that zone
  - pct: FG% in that zone
  - selfPct: % of MAKES that were self-created (unassisted)
  - selfFgPct: FG% on self-created attempts only
  - astFgPct: FG% on assisted attempts only
  - n: total FGA (sample size flag)

Run from data-pipeline/:
  python scripts/inject_shot_creation_spectrum.py
"""

import json
import sqlite3
import zlib
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent  # backend/ on Render
PBP_CSV = BASE / "data/processed/pbp_shot_creation.csv"
DB = BASE / "data/processed/prospecttheory.db"

MIN_FGA_ZONE = 10    # minimum FGA in a zone to report zone-level stats
MIN_FGA_TOTAL = 30   # minimum total FGA to report any shot creation data


def compress(obj: dict) -> bytes:
    return zlib.compress(json.dumps(obj).encode("utf-8"))


def decompress(blob) -> dict:
    if blob is None:
        return {}
    try:
        return json.loads(zlib.decompress(blob).decode("utf-8"))
    except Exception:
        if isinstance(blob, (str, bytes)):
            try:
                return json.loads(blob)
            except Exception:
                pass
        return {}


def safe_pct(num, denom, decimals=1):
    """Safe percentage: returns None if denom too small."""
    if denom is None or pd.isna(denom) or denom < 1:
        return None
    if num is None or pd.isna(num):
        return None
    return round(float(num) / float(denom) * 100, decimals)


def build_zone(made, missed, assisted, min_fga=MIN_FGA_ZONE):
    """Build zone-level shot creation dict from raw counts."""
    fga = int(made + missed) if not (pd.isna(made) or pd.isna(missed)) else 0
    made = int(made) if not pd.isna(made) else 0
    assisted = int(assisted) if not pd.isna(assisted) else 0

    if fga < min_fga:
        return None

    self_created_makes = made - assisted
    # Self-created attempts: estimate from self-creation rate applied to total FGA
    # Since we only know assisted makes, not assisted misses, we use:
    # selfPct = % of makes that were self-created
    # For FG% split: self-created FG% ≈ self_created_makes / estimated_self_created_attempts
    # Best available: assume assist rate on misses ≈ assist rate on makes (conservative)
    assist_rate_on_makes = assisted / made if made > 0 else 0
    est_assisted_fga = round(fga * assist_rate_on_makes)
    est_self_fga = fga - est_assisted_fga

    zone = {
        "fga": fga,
        "pct": safe_pct(made, fga),
        "selfPct": safe_pct(self_created_makes, made),
    }
    # Note: we do NOT compute self-created FG% vs assisted FG% because
    # the PBP data only records assisted MAKES, not assisted MISSES.
    # Any split would collapse to overall FG% under equiprobable assumption.

    return zone


def build_shot_creation(row):
    """Build full shotCreation dict from a pbp_shot_creation.csv row."""
    total_fga = row.get("total_fga", 0)
    if pd.isna(total_fga) or total_fga < MIN_FGA_TOTAL:
        return None

    sc = {}

    # Rim (excluding dunks)
    rim = build_zone(row["rim_made"], row["rim_missed"], row["rim_assisted"])
    if rim:
        sc["rim"] = rim

    # Mid-range
    mid = build_zone(row["mid_made"], row["mid_missed"], row["mid_assisted"])
    if mid:
        sc["mid"] = mid

    # Three-point
    three = build_zone(row["tp_made"], row["tp_missed"], row["tp_assisted"])
    if three:
        sc["three"] = three

    # Dunks (smaller min threshold)
    dunk = build_zone(row["dunk_made"], row["dunk_missed"], row["dunk_assisted"], min_fga=3)
    if dunk:
        sc["dunk"] = dunk

    # Overall
    overall_self = row.get("overall_self_creation")
    sc["overall"] = {
        "fga": int(total_fga),
        "selfPct": round(float(overall_self), 1) if not pd.isna(overall_self) else None,
    }

    return sc if len(sc) > 1 else None  # need at least overall + one zone


def main():
    print(f"Loading PBP shot creation from: {PBP_CSV}")
    pbp = pd.read_csv(PBP_CSV)
    print(f"  Total rows: {len(pbp)}")

    # Build lookup: (name_lower, year) → row
    # For each player, pick the row with highest total_fga (most recent / most complete)
    pbp["_key"] = pbp["player_name"].str.strip().str.lower()

    # Group by player name + season_year, take row with most FGA
    lookup = {}
    for _, row in pbp.iterrows():
        key = (row["_key"], int(row["season_year"]) if not pd.isna(row["season_year"]) else 0)
        existing = lookup.get(key)
        if existing is None or row["total_fga"] > existing["total_fga"]:
            lookup[key] = row

    # Also build a name-only lookup (latest season for each player)
    name_lookup = {}
    for (name, year), row in lookup.items():
        if name not in name_lookup or year > name_lookup[name]["season_year"]:
            name_lookup[name] = row

    print(f"  Unique player-seasons: {len(lookup)}")
    print(f"  Unique players (latest): {len(name_lookup)}")

    # Patch DB
    # Tobias 2026-05-06 PERF-FIX: synchronous=OFF + expliziter Transaction
    # + Progress-Print alle 5000 Iterationen. Vermeidet stillen Hang auf Render.
    conn = sqlite3.connect(str(DB))
    cursor = conn.cursor()
    cursor.execute("PRAGMA synchronous=OFF")
    # Tobias 2026-05-06 IDENTITY-FIX: SELECT player_id (PK!) statt name.
    # Vorher: WHERE name = ? hat Profile mit gleichem Namen alle gleich-gepatcht
    # (Tre Johnson Texas + Montana St. wurden überschrieben).
    rows = cursor.execute("SELECT player_id, name, data FROM profiles").fetchall()
    cursor.execute("BEGIN TRANSACTION")

    patched = 0
    skipped_no_pbp = 0
    skipped_small = 0

    for i, (player_id, db_name, blob) in enumerate(rows, 1):
        profile = decompress(blob)
        yr = profile.get("yr") or profile.get("draft_year") or profile.get("year") or 0
        name_lower = db_name.strip().lower()

        # Try exact (name, year) match first, then name-only
        pbp_row = lookup.get((name_lower, int(yr))) if yr else None
        if pbp_row is None:
            pbp_row = name_lookup.get(name_lower)

        if pbp_row is None:
            skipped_no_pbp += 1
            if i % 5000 == 0:
                print(f"  ... {i:,} / {len(rows):,} processed (patched={patched:,})")
            continue

        sc = build_shot_creation(pbp_row)
        if sc is None:
            skipped_small += 1
            continue

        profile["shotCreation"] = sc
        cursor.execute(
            "UPDATE profiles SET data = ? WHERE player_id = ?",
            (compress(profile), player_id),
        )
        patched += 1
        if i % 5000 == 0:
            print(f"  ... {i:,} / {len(rows):,} processed (patched={patched:,})")

    conn.commit()
    cursor.execute("PRAGMA synchronous=NORMAL")
    conn.close()

    print(f"\n{'='*55}")
    print(f"  Patched       : {patched}")
    print(f"  No PBP data   : {skipped_no_pbp}")
    print(f"  Too few shots : {skipped_small}")
    print(f"{'='*55}")

    # Verify
    print("\n--- Verification ---")
    conn = sqlite3.connect(str(DB))
    for name in ["Cameron Boozer", "Cooper Flagg", "Tre Johnson"]:
        row = conn.execute(
            "SELECT data FROM profiles WHERE name LIKE ?", (f"%{name}%",)
        ).fetchone()
        if row:
            p = decompress(row[0])
            sc = p.get("shotCreation")
            if sc:
                print(f"\n{name}:")
                print(f"  Overall: {sc['overall']['fga']} FGA, {sc['overall']['selfPct']}% self-created")
                for zone in ["rim", "mid", "three"]:
                    z = sc.get(zone)
                    if z:
                        print(f"  {zone:6s}: {z['fga']} FGA, {z['pct']}% FG, "
                              f"{z['selfPct']}% self-created"
                              f"{', self FG%=' + str(z.get('selfFgPct')) if z.get('selfFgPct') else ''}"
                              f"{', ast FG%=' + str(z.get('astFgPct')) if z.get('astFgPct') else ''}")
            else:
                print(f"{name}: no shotCreation data")
    conn.close()


if __name__ == "__main__":
    main()
