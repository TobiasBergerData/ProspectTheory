#!/usr/bin/env python3
"""
import_combine_2026.py — Importiere offizielle NBA Combine 2025-26 Anthropometrics
====================================================================================

Quelle: https://www.nba.com/stats/draft/combine-anthro (Saison 2025-26)
NBA-Stats-API: https://stats.nba.com/stats/draftcombineplayeranthro?LeagueID=00&SeasonYear=2025-26

Workflow:
  1. User exportiert JSON von NBA Stats (Browser DevTools → Network → JSON-Response)
     ODER kopiert manuell Top-Prospects in combine_2026_input.csv
  2. Script merget die Daten in wingspan_all CSV (verified=True flag)
  3. Persistence: combine_2026_verified.csv für Longterm-Datenqualität

Input-Format combine_2026_input.csv:
    player_name,height_no_shoes_in,height_with_shoes_in,weight_lbs,wingspan_in,standing_reach_in,body_fat_pct,hand_length,hand_width
    Cameron Boozer,80.5,81.75,243,86.5,108.5,7.2,9.0,10.5

Tobias 2026-05-09: Wird vor Sunday-Launch nur als Script-Skelett deployed.
                   User kann post-launch echte Daten füttern.
"""
from __future__ import annotations
import csv
import sys
import json
from pathlib import Path
from datetime import datetime

# ── Constants (sync with backend/main.py SHOE_LIFT_INCHES) ────────────────
SHOE_LIFT_INCHES = 1.25  # NBA-Standard-Schuh-Lift (no-shoes → with-shoes)

# ── Paths ──────────────────────────────────────────────────────────────────
BASE = Path(__file__).resolve().parent.parent
RAW_DIR = BASE / "data" / "raw"
PROCESSED_DIR = BASE / "data" / "processed"

INPUT_CSV = RAW_DIR / "combine_2026_input.csv"           # User-input
INPUT_JSON = RAW_DIR / "combine_2026_nbastats.json"       # NBA-Stats API JSON
OUTPUT_CSV = RAW_DIR / "combine_2026_verified.csv"        # Persistent verified
WINGSPAN_CSV = RAW_DIR / "wingspan_all_2026-03-13.csv"   # Existing wingspan DB


# ── Conversion Helpers ─────────────────────────────────────────────────────
def feet_inches_to_inches(s: str) -> float | None:
    """'6\\' 9.25\"' or '6-9.25' or '81.25' → 81.25"""
    if not s or s in ("", "-", "—", "0", 0):
        return None
    s = str(s).strip().replace('"', '').replace("'", "-")
    try:
        if "-" in s:
            ft, inches = s.split("-")
            return float(ft) * 12 + float(inches)
        return float(s)
    except (ValueError, TypeError):
        return None


def parse_nbastats_json(path: Path) -> list[dict]:
    """Parse NBA Stats API JSON dump.
    Format: {'resultSets': [{'headers': [...], 'rowSet': [[...]]}]}"""
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    result_sets = data.get("resultSets", [])
    if not result_sets:
        return []
    rs = result_sets[0]
    headers = rs.get("headers", [])
    rows = rs.get("rowSet", [])

    parsed = []
    for row in rows:
        d = dict(zip(headers, row))
        # NBA Stats canonical column names
        parsed.append({
            "player_name": d.get("PLAYER_NAME") or f"{d.get('FIRST_NAME','')} {d.get('LAST_NAME','')}".strip(),
            "position":     d.get("POSITION") or "",
            "height_no_shoes_in": feet_inches_to_inches(d.get("HEIGHT_WO_SHOES")),
            "height_with_shoes_in": feet_inches_to_inches(d.get("HEIGHT_W_SHOES")),
            "weight_lbs": d.get("WEIGHT"),
            "wingspan_in": feet_inches_to_inches(d.get("WINGSPAN")),
            "standing_reach_in": feet_inches_to_inches(d.get("STANDING_REACH")),
            "body_fat_pct": d.get("BODY_FAT_PCT"),
            "hand_length": d.get("HAND_LENGTH"),
            "hand_width": d.get("HAND_WIDTH"),
            "source": "nba_combine_2026",
            "verified": True,
            "imported_at": datetime.utcnow().isoformat() + "Z",
        })
    return parsed


def parse_manual_csv(path: Path) -> list[dict]:
    """Parse simpler User-provided CSV.
    Required columns: player_name, height_no_shoes_in, weight_lbs, wingspan_in
    Optional: standing_reach_in, body_fat_pct, hand_length, hand_width, position"""
    if not path.exists():
        return []
    out = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            d = {k.strip(): (v.strip() if isinstance(v, str) else v) for k, v in row.items()}
            ht_ns = feet_inches_to_inches(d.get("height_no_shoes_in"))
            ht_ws = feet_inches_to_inches(d.get("height_with_shoes_in"))
            # If no shoes height missing but with-shoes given: subtract shoe-lift
            if ht_ns is None and ht_ws is not None:
                ht_ns = round(ht_ws - SHOE_LIFT_INCHES, 2)
            # If with-shoes missing but no-shoes given: add NBA-standard shoe-lift
            if ht_ws is None and ht_ns is not None:
                ht_ws = round(ht_ns + SHOE_LIFT_INCHES, 2)
            out.append({
                "player_name": d.get("player_name", "").strip(),
                "position":     d.get("position", ""),
                "height_no_shoes_in":   ht_ns,
                "height_with_shoes_in": ht_ws,
                "weight_lbs":           float(d.get("weight_lbs") or 0) or None,
                "wingspan_in":          feet_inches_to_inches(d.get("wingspan_in")),
                "standing_reach_in":    feet_inches_to_inches(d.get("standing_reach_in")),
                "body_fat_pct":         float(d.get("body_fat_pct") or 0) or None,
                "hand_length":          feet_inches_to_inches(d.get("hand_length")),
                "hand_width":           feet_inches_to_inches(d.get("hand_width")),
                "source": "manual_combine_2026",
                "verified": True,
                "imported_at": datetime.utcnow().isoformat() + "Z",
            })
    return out


def merge_into_wingspan_db(verified: list[dict]) -> int:
    """Update wingspan_all CSV with verified Combine values.
    Adds new players if not present, overrides existing entries (preserving original
    as backup in OUTPUT_CSV). Returns count of updated/added rows."""
    if not WINGSPAN_CSV.exists():
        print(f"WARN: {WINGSPAN_CSV} missing — skipping wingspan merge.")
        return 0

    # Read existing
    with open(WINGSPAN_CSV, "r", encoding="utf-8") as f:
        existing = list(csv.DictReader(f))
        fieldnames = list(existing[0].keys()) if existing else []
    existing_by_name = {(r.get("player") or "").lower().strip(): i for i, r in enumerate(existing)}

    n_updated, n_added = 0, 0
    for v in verified:
        name_key = (v["player_name"] or "").lower().strip()
        if not name_key:
            continue
        if name_key in existing_by_name:
            idx = existing_by_name[name_key]
            # Override only if we have verified data
            if v["height_no_shoes_in"] is not None:
                existing[idx]["height_wo_shoes_in"] = v["height_no_shoes_in"]
            if v["wingspan_in"] is not None:
                existing[idx]["wingspan_in"] = v["wingspan_in"]
            existing[idx]["verified_2026"] = "True"
            n_updated += 1
        else:
            new_row = {fn: "" for fn in fieldnames}
            new_row["player"] = v["player_name"]
            if "height_wo_shoes_in" in fieldnames:
                new_row["height_wo_shoes_in"] = v["height_no_shoes_in"] or ""
            if "wingspan_in" in fieldnames:
                new_row["wingspan_in"] = v["wingspan_in"] or ""
            if "primary_pos" in fieldnames:
                new_row["primary_pos"] = v["position"]
            if "verified_2026" in fieldnames:
                new_row["verified_2026"] = "True"
            existing.append(new_row)
            n_added += 1

    if "verified_2026" not in fieldnames:
        fieldnames.append("verified_2026")

    with open(WINGSPAN_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(existing)

    return n_updated + n_added


def write_persistent_log(verified: list[dict]):
    """Write the verified Combine 2026 data to a persistent CSV for longterm data quality."""
    if not verified:
        return
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = list(verified[0].keys())
    with open(OUTPUT_CSV, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(verified)
    print(f"✅ Persistent log: {OUTPUT_CSV} ({len(verified)} rows)")


def main():
    """Run import. Prefers JSON if available, falls back to manual CSV."""
    verified = []
    if INPUT_JSON.exists():
        print(f"→ Parsing NBA Stats JSON: {INPUT_JSON}")
        verified = parse_nbastats_json(INPUT_JSON)
    elif INPUT_CSV.exists():
        print(f"→ Parsing manual CSV: {INPUT_CSV}")
        verified = parse_manual_csv(INPUT_CSV)
    else:
        print(f"ERROR: Need either {INPUT_JSON} or {INPUT_CSV}.")
        print(f"\nManual CSV format:")
        print(f"  player_name,height_with_shoes_in,weight_lbs,wingspan_in,standing_reach_in")
        print(f"  Cameron Boozer,81.75,243,86.5,108.5")
        print(f"  Kingston Flemings,76.25,180,79.0,99.5")
        sys.exit(1)

    print(f"  → {len(verified)} verified players")
    if not verified:
        print("WARN: empty input")
        return

    # 1. Persist verified data
    write_persistent_log(verified)

    # 2. Merge into wingspan DB (so /api/combine endpoint sees it)
    merged_count = merge_into_wingspan_db(verified)
    print(f"✅ Wingspan DB: {merged_count} rows updated/added")

    # 3. Update barttorvik_with_nba_and_combine_COMPLETE.csv for weight lookup
    bt_path = RAW_DIR / "barttorvik_with_nba_and_combine_COMPLETE.csv"
    if bt_path.exists():
        with open(bt_path, "r", encoding="utf-8") as f:
            bt_rows = list(csv.DictReader(f))
            bt_fieldnames = list(bt_rows[0].keys()) if bt_rows else []
        bt_by_name = {(r.get("player_name") or r.get("combine_player_name") or "").lower().strip(): i
                      for i, r in enumerate(bt_rows)}
        n_wt_updated = 0
        for v in verified:
            name_key = (v["player_name"] or "").lower().strip()
            if name_key in bt_by_name and v["weight_lbs"]:
                idx = bt_by_name[name_key]
                if "combine_weight_lbs" in bt_fieldnames:
                    bt_rows[idx]["combine_weight_lbs"] = str(v["weight_lbs"])
                    n_wt_updated += 1
        if n_wt_updated > 0:
            with open(bt_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=bt_fieldnames)
                writer.writeheader()
                writer.writerows(bt_rows)
            print(f"✅ Weight DB: {n_wt_updated} rows updated in barttorvik CSV")

    print(f"\n✅ DONE. After backend restart, /api/combine will serve verified 2026 values.")
    print(f"   Pipeline-Re-Run optional — see CHANGES_LAUNCH_2026-05-09.md.")


if __name__ == "__main__":
    main()
