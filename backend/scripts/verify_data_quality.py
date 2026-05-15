#!/usr/bin/env python3
"""
verify_data_quality.py — Datenqualitäts-Audit für ProspectTheory.
================================================================

Läuft systematisch durch die wichtigsten Spielerprofile und prüft:
  1. Bekannte 2025/2026 Top-Prospects haben sinnvolle Tier-Wahrscheinlichkeiten
  2. Historische All-Stars (Tatum, Brunson, Doncic etc.) haben passende peak_pie
  3. Intl-Spieler haben (post-Pipeline-Re-Run) ts_pct, efg_pct, two_pct gesetzt
  4. Position-Klassifikation passt zu Stats (height + astP plausibel)
  5. Combine-2026 verifizierte Daten sind drin wo erwartet

Output: Konsolen-Report. Exit-Code 0 wenn alles passt, 1 bei Warnungen.

Tobias 2026-05-09: Post-Launch Verifikations-Tool.
"""
from __future__ import annotations
import json
import glob
import sys
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent
PROCESSED = BASE / "data" / "processed"

warnings = []
infos = []


def _load_all_profiles():
    all_p = {}
    for f in sorted(glob.glob(str(PROCESSED / "api_profiles_part*.json"))):
        with open(f, "r", encoding="utf-8") as fp:
            data = json.load(fp)
        profiles = data.get("profiles", data) if isinstance(data, dict) else data
        if isinstance(profiles, dict):
            all_p.update(profiles)
    return all_p


def _find_by_name(profiles, name, yr=None):
    for p in profiles.values():
        if (p.get("name", "") or "").lower() == name.lower():
            if yr is None or int(p.get("yr") or 0) == yr:
                return p
    return None


# ─────────────────────────────────────────────────────────────────────
# Test 1: 2026 Top Prospects
# ─────────────────────────────────────────────────────────────────────
def test_2026_top_prospects(profiles):
    print("\n══ Test 1: 2026 Top Prospects ══")
    expected = [
        ("Cameron Boozer", "Wing",      "should be top prospect, P(S+A) ≥ 20%"),
        ("Kingston Flemings", "Playmaker", "Combo-Guard, P(Starter+) ≥ 25%"),
        ("AJ Dybantsa", "Wing",         "Top-3 mock pick, P(Starter+) ≥ 20%"),
        ("Darryn Peterson", "Wing",     "Top-5 mock, P(Starter+) ≥ 20%"),
    ]
    for name, exp_pos, comment in expected:
        p = _find_by_name(profiles, name, 2026)
        if not p:
            warnings.append(f"Missing 2026 profile: {name}")
            print(f"  ✗ {name}: MISSING")
            continue
        pos = p.get("pos")
        pos_ok = pos == exp_pos or (exp_pos == "Wing" and pos in ("Wing", "Big"))
        p_sa = (p.get("prob_super") or 0) + (p.get("prob_allstar") or 0)
        p_starter_plus = p_sa + (p.get("prob_starter") or 0)
        flag = "✓" if pos_ok and p_starter_plus > 0.20 else "⚠"
        if flag == "⚠":
            warnings.append(f"{name}: pos={pos}, P(Starter+)={p_starter_plus:.2f}")
        print(f"  {flag} {name:<22} pos={pos:<10} P(S+A)={p_sa:.2f} P(Starter+)={p_starter_plus:.2f}")


# ─────────────────────────────────────────────────────────────────────
# Test 2: Historical All-Stars peak_pie
# ─────────────────────────────────────────────────────────────────────
def test_historical_allstars(profiles):
    print("\n══ Test 2: Historical All-Stars peak_pie ══")
    expected = [
        ("Stephen Curry", 50, "Superstar tier"),
        ("Anthony Davis", 40, "Superstar tier"),
        ("Jayson Tatum", 50, "Superstar via peak_pie"),
        ("Karl-Anthony Towns", 25, "All-Star"),
        ("Donovan Mitchell", 25, "All-Star"),
        ("Jalen Brunson", 25, "All-Star (NEW playmaker)"),
        ("Trae Young", 25, "All-Star"),
        ("Devin Booker", 25, "All-Star scorer"),
        ("Mikal Bridges", 15, "Starter floor"),
    ]
    for name, min_pie, comment in expected:
        p = _find_by_name(profiles, name)
        if not p or not p.get("made_nba"):
            warnings.append(f"Missing NBA profile: {name}")
            print(f"  ✗ {name}: MISSING or no-NBA")
            continue
        pie = p.get("peak_pie") or 0
        flag = "✓" if pie >= min_pie else "⚠"
        if flag == "⚠":
            warnings.append(f"{name}: peak_pie={pie} below expected {min_pie}")
        print(f"  {flag} {name:<22} peak_pie={pie:>5.1f} (expected ≥{min_pie})  [{comment}]")


# ─────────────────────────────────────────────────────────────────────
# Test 3: Intl Shooting completeness (post-Pipeline-Re-Run)
# ─────────────────────────────────────────────────────────────────────
def test_intl_shooting(profiles):
    print("\n══ Test 3: Intl Shooting Data ══")
    intl_recent = [p for p in profiles.values()
                   if p.get("source") == "intl" and int(p.get("yr") or 0) >= 2018]
    n = len(intl_recent)
    n_ts = sum(1 for p in intl_recent if p.get("ts_pct") is not None)
    n_efg = sum(1 for p in intl_recent if p.get("efg_pct") is not None)
    n_two = sum(1 for p in intl_recent if p.get("two_pct") is not None)
    print(f"  Total intl 2018+: {n:,}")
    print(f"  ts_pct populated:  {n_ts:>5,} ({100*n_ts/max(n,1):.0f}%)")
    print(f"  efg_pct populated: {n_efg:>5,} ({100*n_efg/max(n,1):.0f}%)")
    print(f"  two_pct populated: {n_two:>5,} ({100*n_two/max(n,1):.0f}%)")
    if n_ts < 0.5 * n:
        infos.append("Intl ts_pct < 50% — Pipeline-Re-Run needed for 05c shooting fix")
    if n_two < 0.5 * n:
        infos.append("Intl two_pct < 50% — Pipeline-Re-Run needed for 05c shooting fix")


# ─────────────────────────────────────────────────────────────────────
# Test 4: Position Sanity Checks
# ─────────────────────────────────────────────────────────────────────
def test_position_classification(profiles):
    print("\n══ Test 4: Position Sanity (Frontend resolvePosition applies after fetch) ══")
    # These should be Playmakers after frontend fix; backend may still say Wing
    expected_pm = [
        ("Russell Westbrook", 75, "Combo-Guard"),
        ("Jrue Holiday", 75, "Combo-Guard"),
        ("Cade Cunningham", 80, "Tall lead PG"),
    ]
    for name, ht_exp, comment in expected_pm:
        p = _find_by_name(profiles, name)
        if not p:
            print(f"  ⚠ {name}: not found")
            continue
        bk_pos = p.get("pos")
        ht = p.get("ht") or 0
        astP = p.get("ast_p") or 0
        # Apply frontend logic to check
        is_pm = (ht < 79 and astP > 22 and (p.get("usg") or 0) >= 22) or \
                (ht < 79 and astP > 28) or \
                (ht < 81 and astP >= 20 and (p.get("usg") or 0) >= 26) or \
                (ht <= 75)
        flag = "✓" if is_pm else "⚠"
        print(f"  {flag} {name:<22} backend_pos={bk_pos:<10} → frontend_pm={is_pm}  ({comment})")


# ─────────────────────────────────────────────────────────────────────
# Test 5: Combine 2026 Verified Data
# ─────────────────────────────────────────────────────────────────────
def test_combine_2026(profiles):
    print("\n══ Test 5: Combine 2026 Verified Data ══")
    combine_csv = BASE / "data" / "raw" / "combine_2026_verified.csv"
    if not combine_csv.exists():
        print(f"  ℹ {combine_csv.name} not yet present — Combine data not imported.")
        infos.append(f"Combine 2026 data not yet imported. Run import_combine_2026.py.")
        return
    import csv
    with open(combine_csv, "r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"  ✓ {len(rows)} verified players in combine_2026_verified.csv")


# ─────────────────────────────────────────────────────────────────────
# Test 6: Data Completeness Summary
# ─────────────────────────────────────────────────────────────────────
def test_data_completeness(profiles):
    print("\n══ Test 6: Data Completeness Summary ══")
    counts_per_yr = defaultdict(int)
    for p in profiles.values():
        y = p.get("yr")
        if y is not None:
            counts_per_yr[int(y)] += 1
    print(f"  Total profiles: {len(profiles):,}")
    print(f"  Years covered: {min(counts_per_yr):d} – {max(counts_per_yr):d}")
    print(f"  2025: {counts_per_yr.get(2025, 0):>5,}  2026: {counts_per_yr.get(2026, 0):>5,}")


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────
def main():
    print("=" * 70)
    print("ProspectTheory Data Quality Audit")
    print("=" * 70)

    profiles = _load_all_profiles()
    if not profiles:
        print("ERROR: no profiles loaded.")
        sys.exit(2)

    test_2026_top_prospects(profiles)
    test_historical_allstars(profiles)
    test_intl_shooting(profiles)
    test_position_classification(profiles)
    test_combine_2026(profiles)
    test_data_completeness(profiles)

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    if warnings:
        print(f"\n⚠ {len(warnings)} Warnings:")
        for w in warnings:
            print(f"  - {w}")
    if infos:
        print(f"\nℹ {len(infos)} Info:")
        for i in infos:
            print(f"  - {i}")
    if not warnings:
        print("\n✅ All critical tests passed.")
    sys.exit(1 if warnings else 0)


if __name__ == "__main__":
    main()
