#!/usr/bin/env python3
"""
inject_skill_curve.py — Offensive Skill Curve (Usage Scalability)
==================================================================
Computes per-player offensive scalability data and injects into DB profiles.

METRIC DEFINITION
-----------------
The Offensive Skill Curve addresses: "Can this player perform at different
usage levels, and does their ROLE change when they take more or fewer
possessions?"

Two analytical angles:

1. PEER CURVE POSITION (all players):
   League-wide regression: E[AdjOrtg | USG%]
   Player's residual = actual - expected → how far above/below peer average
   at their usage level. Positive = elite efficiency for this role size.
   Peer curve: AdjOrtg = -0.0052×USG² + 1.6262×USG + 69.51 (2008-2026, N=71k)

2. PERSONAL SCALABILITY (multi-season players):
   For each season: (USG%, AdjOrtg, TS%, AST%, TO%)
   Slope = ΔAdjOrtg per +1% USG (positive = grows with role)
   AST slope = ΔAST% per +1% USG (positive = playmaker, not isolation scorer)
   Key insight: r(ΔUSG, ΔAST%) = +0.42 means top players expand their
   playmaking as they take more possessions. Isolation scorers show flat/
   negative AST slope at high USG.

DATA SOURCE
-----------
barttorvik_complete_final.csv — cross-referenced with profiles by player_name+yr.
Season fields used: usg, adjoe, TS_per, AST_per, TO_per, BPM, OBPM, GP, yr.
Minimum season filter: GP >= 10, USG >= 8, adjoe in [60, 200].

INJECTED FIELD: skillCurve
--------------------------
{
  "seasons": [                          // per-season data points
    {"yr": 2026, "usg": 30.6, "adjOrtg": 157.7,
     "ts": 65.3, "astP": 25.6, "toP": 14.7, "obpm": 10.2, "gp": 31}
  ],
  "nSeasons": 1,
  "slope":    null,    // ΔAdjOrtg per +1% USG (OLS, ≥2 seasons only)
  "slopeTs":  null,    // ΔTS% per +1% USG
  "slopeAst": null,    // ΔAST% per +1% USG — role change indicator
  "scalePctl": null,   // overall slope percentile (how rare is this scalability?)
  "astSlopePctl": null,// ΔAST/ΔUSG percentile — does playmaking grow with load?
  "peerResidual": 43.3,// AdjOrtg - E[AdjOrtg|USG] = distance above peer curve
  "peerPctl":    100,  // percentile of residual across all same-year cohort
  "curUsg":     30.6,  // current season USG%
  "curAdjOrtg": 157.7, // current season AdjOrtg
}
"""

import sqlite3, zlib, json, sys, traceback
from pathlib import Path
import numpy as np
import pandas as pd

# ── Paths ──────────────────────────────────────────────────────────────────
BASE    = Path(__file__).resolve().parent  # backend/ on Render
DB      = BASE / "data" / "processed" / "prospecttheory.db"
BART_CSV = BASE / "data" / "raw" / "barttorvik_complete_final.csv"

# ── Peer Curve (pre-computed from 71k player-seasons 2008-2026) ────────────
# AdjOrtg = PEER_A*USG² + PEER_B*USG + PEER_C
PEER_COEFFS = np.array([-0.00518827,  1.62620613, 69.50561015])

MIN_GP  = 10    # minimum games to include a season
MIN_USG = 8.0   # minimum usage % to include a season
MIN_ADJOE = 60  # filter out data artifacts


def peer_expected(usg: float) -> float:
    return float(np.polyval(PEER_COEFFS, usg))


def load_barttorvik() -> pd.DataFrame:
    """Load and clean barttorvik CSV for cross-season analysis."""
    df = pd.read_csv(BART_CSV, low_memory=False)
    df["yr"] = df["season_year"].astype(int)

    # Clean numeric
    for col in ["usg", "adjoe", "TS_per", "AST_per", "TO_per", "BPM", "OBPM", "GP"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")

    # Filter valid seasons
    mask = (
        df["GP"] >= MIN_GP
    ) & (df["usg"] >= MIN_USG
    ) & (df["adjoe"] > MIN_ADJOE
    ) & (df["adjoe"] < 200)

    return df[mask].copy()


def build_skill_curve(player_seasons: list[dict]) -> dict:
    """
    Build skillCurve data from per-season records.
    player_seasons: sorted by yr, each dict has keys:
      yr, usg, adjOrtg, ts, astP, toP, obpm, gp
    """
    n = len(player_seasons)
    cur = player_seasons[-1]  # most recent season

    result = {
        "seasons":       player_seasons,
        "nSeasons":      n,
        "slope":         None,
        "slopeTs":       None,
        "slopeAst":      None,
        "scalePctl":     None,
        "astSlopePctl":  None,
        "peerResidual":  round(cur["adjOrtg"] - peer_expected(cur["usg"]), 1),
        "peerPctl":      None,  # filled in later
        "curUsg":        cur["usg"],
        "curAdjOrtg":    cur["adjOrtg"],
    }

    # Compute slopes if 2+ seasons with sufficient USG spread
    if n >= 2:
        usgs    = np.array([s["usg"]    for s in player_seasons])
        adjortgs= np.array([s["adjOrtg"] for s in player_seasons])
        tss     = np.array([s["ts"]     for s in player_seasons])
        astps   = np.array([s["astP"]   for s in player_seasons if s["astP"] is not None])

        usg_spread = usgs.max() - usgs.min()
        if usg_spread >= 2.0:
            # OLS regression: y = a + b*usg → b is the slope
            p_adj = np.polyfit(usgs, adjortgs, 1)
            p_ts  = np.polyfit(usgs, tss, 1)
            result["slope"]   = round(float(p_adj[0]), 3)
            result["slopeTs"] = round(float(p_ts[0]), 3)

            if len(astps) == n:  # all seasons have AST%
                usg_for_ast = np.array([s["usg"] for s in player_seasons])
                p_ast = np.polyfit(usg_for_ast, astps, 1)
                result["slopeAst"] = round(float(p_ast[0]), 3)

    return result


def main():
    print("=" * 65)
    print("INJECT OFFENSIVE SKILL CURVE")
    print("  Source: barttorvik cross-season data")
    print("  Peer curve: AdjOrtg = f(USG%) from 71k player-seasons")
    print("=" * 65)

    if not DB.exists():
        print(f"ERROR: DB not found at {DB}"); sys.exit(1)
    if not BART_CSV.exists():
        print(f"ERROR: barttorvik CSV not found"); sys.exit(1)

    # ── Load barttorvik data ────────────────────────────────────────────────
    print("\nLoading barttorvik CSV...")
    bt = load_barttorvik()
    print(f"  Valid player-seasons: {len(bt):,}")

    # Build lookup: {player_name: [{yr, usg, adjOrtg, ...}]}
    lookup: dict[str, list[dict]] = {}
    for _, row in bt.iterrows():
        name = str(row["player_name"]).strip()
        if not name:
            continue
        rec = {
            "yr":     int(row["yr"]),
            "usg":    round(float(row["usg"]), 1),
            "adjOrtg":round(float(row["adjoe"]), 1),
            "ts":     round(float(row["TS_per"]), 1) if pd.notna(row["TS_per"]) else None,
            "astP":   round(float(row["AST_per"]), 1) if pd.notna(row["AST_per"]) else None,
            "toP":    round(float(row["TO_per"]), 1) if pd.notna(row["TO_per"]) else None,
            "obpm":   round(float(row["OBPM"]), 2) if pd.notna(row["OBPM"]) else None,
            "gp":     int(row["GP"]),
        }
        lookup.setdefault(name, []).append(rec)

    # Sort each player's seasons by year
    for name in lookup:
        lookup[name] = sorted(lookup[name], key=lambda x: x["yr"])

    print(f"  Unique players: {len(lookup):,}")

    # ── Compute peer curve residuals for percentile ranking ────────────────
    # We'll collect all (name, yr, residual, slope, slopeAst) to percentile-rank
    all_residuals: list[dict] = []

    print("\nComputing skill curves...")
    n_single = 0
    n_multi  = 0
    n_no_bt  = 0

    # Map from DB profile name → skill curve
    skill_curves: dict[str, dict] = {}

    conn = sqlite3.connect(DB)
    profiles = conn.execute("SELECT name, data FROM profiles").fetchall()
    conn.close()

    for name_key, blob in profiles:
        try:
            p = json.loads(zlib.decompress(blob))
            p_name = p.get("name", "").strip()
            p_yr   = p.get("yr")
        except:
            continue

        seasons_bt = lookup.get(p_name)
        if not seasons_bt:
            # Try fuzzy: maybe slight name variation
            n_no_bt += 1
            skill_curves[name_key] = None
            continue

        # Only use seasons for the current player's relevant year(s)
        # If player has multiple cohorts in the CSV, use seasons up to and including p_yr
        if p_yr:
            seasons_use = [s for s in seasons_bt if s["yr"] <= p_yr]
        else:
            seasons_use = seasons_bt

        if not seasons_use:
            n_no_bt += 1
            skill_curves[name_key] = None
            continue

        sc = build_skill_curve(seasons_use)
        skill_curves[name_key] = sc

        # Collect for percentile ranking
        all_residuals.append({
            "key":      name_key,
            "yr":       seasons_use[-1]["yr"],
            "residual": sc["peerResidual"],
            "slope":    sc.get("slope"),
            "slopeAst": sc.get("slopeAst"),
        })

        if len(seasons_use) == 1:
            n_single += 1
        else:
            n_multi += 1

    print(f"  Single-season profiles: {n_single:,}")
    print(f"  Multi-season profiles:  {n_multi:,}")
    print(f"  No BartTorvik match:    {n_no_bt:,}")

    # ── Compute percentile ranks ────────────────────────────────────────────
    print("\nComputing percentile ranks...")
    res_df = pd.DataFrame(all_residuals)

    pctl_map: dict[str, dict] = {}

    for yr, grp in res_df.groupby("yr"):
        if len(grp) < 10:
            continue

        # peerPctl: percentile of residual in cohort
        res_rank = grp["residual"].rank(pct=True, method="average")

        # scalePctl: percentile of slope (only for multi-season players)
        slopes_valid = grp["slope"].dropna()
        if len(slopes_valid) >= 5:
            slope_rank = grp["slope"].rank(pct=True, method="average", na_option="keep")
        else:
            slope_rank = pd.Series([np.nan] * len(grp), index=grp.index)

        # astSlopePctl
        ast_valid = grp["slopeAst"].dropna()
        if len(ast_valid) >= 5:
            ast_rank = grp["slopeAst"].rank(pct=True, method="average", na_option="keep")
        else:
            ast_rank = pd.Series([np.nan] * len(grp), index=grp.index)

        for idx in grp.index:
            key = grp.loc[idx, "key"]
            pctl_map[key] = {
                "peerPctl":    int(round(res_rank.loc[idx] * 100)),
                "scalePctl":   int(round(slope_rank.loc[idx] * 100)) if not pd.isna(slope_rank.loc[idx]) else None,
                "astSlopePctl":int(round(ast_rank.loc[idx] * 100)) if not pd.isna(ast_rank.loc[idx]) else None,
            }

    print(f"  Percentile entries: {len(pctl_map):,}")

    # ── Inject into DB ──────────────────────────────────────────────────────
    # Tobias 2026-05-06 PERF-FIX: synchronous=OFF + expliziter Transaction-Block
    # + Progress-Print alle 5000. Vorher hing der Inject-Loop ohne sichtbaren
    # Fortschritt 5-10 Min wegen WAL+Defender.
    print(f"\nInjecting skillCurve into {len(profiles):,} profiles...")
    conn = sqlite3.connect(DB)
    conn.execute("PRAGMA synchronous=OFF")
    conn.execute("BEGIN TRANSACTION")
    patched = 0
    skipped = 0

    for i, (name_key, blob) in enumerate(profiles, 1):
        sc = skill_curves.get(name_key)
        if sc is None:
            skipped += 1
            if i % 5000 == 0:
                print(f"  ... {i:,} / {len(profiles):,} processed")
            continue

        # Merge percentiles
        pctl = pctl_map.get(name_key, {})
        sc["peerPctl"]    = pctl.get("peerPctl")
        sc["scalePctl"]   = pctl.get("scalePctl")
        sc["astSlopePctl"]= pctl.get("astSlopePctl")

        try:
            p = json.loads(zlib.decompress(blob))
        except:
            skipped += 1
            continue

        p["skillCurve"] = sc
        new_blob = zlib.compress(json.dumps(p, separators=(',', ':')).encode())
        conn.execute("UPDATE profiles SET data=? WHERE name=?", (new_blob, name_key))
        patched += 1
        if i % 5000 == 0:
            print(f"  ... {i:,} / {len(profiles):,} processed (patched={patched:,})")

    conn.commit()
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.close()

    print(f"  Patched:  {patched:,}")
    print(f"  Skipped:  {skipped:,} (no BartTorvik match)")

    # ── Validation ──────────────────────────────────────────────────────────
    print("\n" + "=" * 65)
    print("VALIDATION — Top Prospects 2026")
    print("=" * 65)

    conn = sqlite3.connect(DB)
    check = [
        "Cameron Boozer", "Cooper Flagg", "Dylan Harper",
        "Ace Bailey", "Tre Johnson", "Kasparas Jakucionis",
        "Kon Knueppel", "Derik Queen",
    ]

    for name in check:
        row = conn.execute(
            "SELECT data FROM profiles WHERE name LIKE ?", (f"%{name}%",)
        ).fetchone()
        if not row:
            print(f"  {name}: NOT FOUND"); continue
        p = json.loads(zlib.decompress(row[0]))
        sc = p.get("skillCurve")
        if not sc:
            print(f"  {name}: No skillCurve"); continue
        slope_str = f"slope={sc['slope']:+.2f}" if sc['slope'] is not None else "slope=1-season"
        ast_str   = f"astSlope={sc['slopeAst']:+.2f}" if sc['slopeAst'] is not None else ""
        print(
            f"  {name:25s} | "
            f"USG={sc['curUsg']:.1f}% "
            f"AdjOrtg={sc['curAdjOrtg']:.0f} "
            f"peer={sc['peerResidual']:+.1f}pt "
            f"peerPctl={sc['peerPctl']:>3} "
            f"{slope_str} {ast_str} "
            f"seasons={sc['nSeasons']}"
        )

    # Distribution check
    rows_all = conn.execute("SELECT data FROM profiles").fetchall()
    conn.close()

    residuals, slopes, ast_slopes = [], [], []
    for (blob,) in rows_all:
        try:
            p = json.loads(zlib.decompress(blob))
            sc = p.get("skillCurve")
            if sc:
                if sc.get("peerResidual") is not None: residuals.append(sc["peerResidual"])
                if sc.get("slope") is not None: slopes.append(sc["slope"])
                if sc.get("slopeAst") is not None: ast_slopes.append(sc["slopeAst"])
        except: pass

    print(f"\nDistribution check:")
    r = np.array(residuals)
    s = np.array(slopes)
    a = np.array(ast_slopes)
    print(f"  peerResidual (N={len(r):,}): p10={np.percentile(r,10):.1f} p50={np.percentile(r,50):.1f} p90={np.percentile(r,90):.1f} std={r.std():.1f}")
    if len(s) > 0:
        print(f"  slope AdjOrtg/USG (N={len(s):,}): p10={np.percentile(s,10):.2f} p50={np.percentile(s,50):.2f} p90={np.percentile(s,90):.2f}")
    if len(a) > 0:
        print(f"  slope AST%/USG   (N={len(a):,}): p10={np.percentile(a,10):.2f} p50={np.percentile(a,50):.2f} p90={np.percentile(a,90):.2f}")

    print(f"\n{'='*65}")
    print("Done.")
    print(f"{'='*65}")


if __name__ == "__main__":
    main()
