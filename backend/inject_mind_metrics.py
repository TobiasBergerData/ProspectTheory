#!/usr/bin/env python3
"""
inject_mind_metrics.py — Mind-Tab Daten in API-Profile einspeisen
==================================================================
Liest data/processed/pbp_mind_metrics_all.csv (38.883 player-seasons über
9 NCAA-Saisons 2017-18 bis 2025-26) und injiziert pro Spieler die
Pre-Draft-Mind-Metrics in das DB-Profil.

KEY DESIGN
----------
- Match auf normalized name (Lowercase, Punkte raus, Suffix-strip).
- Pro Spieler: latest-Season-Datensatz wird genommen (= seine letzte NCAA-Saison
  vor dem NBA-Wechsel; bei aktuellen Prospects = laufende Saison).
- Felder: 4 Resilience-Indizes mit 95%-CI + Z-Scores + Pressure-Splits + FT.
- Sample-Size-Flags: "limited_sample" wenn n_streaks < 25.

FRAMING
-------
Mind-Tab-Daten sind als Tendenz-Hinweise zu verstehen, nicht als deterministische
Aussagen. Im Frontend werden sie mit explizitem "verify with film"-Disclaimer
präsentiert.

INJECTED FIELD: mindMetrics (in profile.data)
---------------------------------------------
{
  "season":         "2024-25",       // welche Saison ist das?
  "n_streaks":      43,              // Sample-Size
  "limited_sample": false,           // True wenn < MIN_STREAKS_FOR_RELIABLE
  "n_actions":      743,             // total non-cooldown actions

  // Resilience indices: point estimate + 95% CI + position-z-score
  "aggressor":  {"idx": 0.86, "lo": 0.68, "hi": 1.10, "z": -0.4},
  "overdriver": {"idx": 2.34, "lo": 1.32, "hi": 4.14, "z": +0.8},
  "hothead":    {"idx": 0.52, "lo": 0.19, "hi": 1.42, "z": -1.2},
  "passive":    {"idx": 0.85},       // no CI (proportion-of-expected)
  "bounceback": {"idx": 1.04, "lo": 0.85, "hi": 1.27, "z": +0.1},

  // Pressure splits — Field Goals
  "clutch_time":   {"fga": 18, "efg": 64.2, "delta_efg":  +8.3},
  "clutch_wp":     {"fga": 32, "efg": 58.1, "delta_efg":  +5.0},
  "late_clock":    {"fga": 91, "efg": 41.2, "delta_efg": -19.1},

  // Free throws
  "ft":            {"fta": 156, "pct": 83.3,
                    "clutch_fta": 22, "clutch_pct": 81.8, "clutch_delta": -1.6},

  // Sensitivity (robustness signal): Pearson correlation der Indizes mit
  // alternativen Streak-Definitionen. r > 0.85 = robust.
  "sensitivity":   {"aggressor_wider":  0.98,   // robust under wider window
                    "aggressor_looser": 0.37,   // fragile under looser thresh
                    "overdriver_wider": 0.96,
                    "overdriver_looser":0.43}
}
"""
from __future__ import annotations
import sqlite3, zlib, json, sys, re, unicodedata
from pathlib import Path
import pandas as pd
import numpy as np

BASE = Path(__file__).resolve().parent
DB = BASE / "data" / "processed" / "prospecttheory.db"

# Master-CSV liegt im data-pipeline Repo. Auf Render ist die data-pipeline NICHT
# verfügbar — wir kopieren das CSV nach backend/data/processed/ vor dem Deploy.
CSV_LOCAL = BASE / "data" / "processed" / "pbp_mind_metrics_all.csv"
CSV_PIPELINE = BASE.parent.parent / "data-pipeline" / "data" / "processed" / "pbp_mind_metrics_all.csv"

MIN_STREAKS_FOR_RELIABLE = 25
MIN_CLUTCH_FT_SAMPLE = 5      # only show clutch FT if n_attempts >= 5

# ── Name-Normalisierung (matches the spike script's logic) ──
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
    """Convert to float, return None for NaN/inf/None."""
    if v is None or (isinstance(v, float) and (pd.isna(v) or not np.isfinite(v))):
        return None
    try:
        f = float(v)
        return f if np.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def round_or_none(v, d=2):
    n = safe_num(v)
    return round(n, d) if n is not None else None


def build_mind_block(row) -> dict:
    """Convert a master-CSV row into the mindMetrics dict structure."""
    n_streaks = int(safe_num(row.get("n_streaks")) or 0)
    n_actions = int(safe_num(row.get("n_actions")) or 0)

    def idx_ci_z(idx_col, lo_col=None, hi_col=None, z_col=None):
        """Build {idx, lo, hi, z} dict from explicit column names."""
        out = {}
        idx = round_or_none(row.get(idx_col), 2)
        if idx is not None:
            out["idx"] = idx
        if lo_col:
            lo = round_or_none(row.get(lo_col), 2)
            if lo is not None: out["lo"] = lo
        if hi_col:
            hi = round_or_none(row.get(hi_col), 2)
            if hi is not None: out["hi"] = hi
        if z_col:
            z = round_or_none(row.get(z_col), 2)
            if z is not None: out["z"] = z
        return out if out else None

    block = {
        "season":         str(row.get("season", "")),
        "n_streaks":      n_streaks,
        "n_actions":      n_actions,
        "limited_sample": n_streaks < MIN_STREAKS_FOR_RELIABLE,
        "pos_group":      row.get("pos_group") if pd.notna(row.get("pos_group")) else None,

        "aggressor":      idx_ci_z("adverse_aggressor_idx",  "adverse_aggressor_lo",  "adverse_aggressor_hi",  "adverse_aggressor_z"),
        "overdriver":     idx_ci_z("adverse_overdriver_idx", "adverse_overdriver_lo", "adverse_overdriver_hi", "adverse_overdriver_z"),
        "hothead":        idx_ci_z("adverse_hothead_idx",    "adverse_hothead_lo",    "adverse_hothead_hi",    "adverse_hothead_z"),
        "passive":        idx_ci_z("adverse_passive_idx",    z_col="adverse_passive_z"),
        # Bounceback hat das _efg-Suffix (Carryover from spike-script naming)
        "bounceback":     idx_ci_z("adverse_bounceback_efg", "adverse_bounceback_lo", "adverse_bounceback_hi", "adverse_bounceback_efg_z"),

        "clutch_time": {
            "fga":         int(safe_num(row.get("clutch_fga")) or 0),
            "efg":         round_or_none(row.get("clutch_efg"), 1),
            "delta_efg":   round_or_none(row.get("clutch_delta_efg"), 1),
        },
        "clutch_wp": {
            "fga":         int(safe_num(row.get("clutch_wp_fga")) or 0),
            "efg":         round_or_none(row.get("clutch_wp_efg"), 1),
            "delta_efg":   round_or_none(row.get("clutch_wp_delta_efg"), 1),
        },
        "late_clock": {
            "fga":         int(safe_num(row.get("late_clock_fga")) or 0),
            "efg":         round_or_none(row.get("late_clock_efg"), 1),
            "delta_efg":   round_or_none(row.get("late_clock_delta_efg"), 1),
        },
    }

    # Free throws — clutch only if sample size sufficient
    fta_total = int(safe_num(row.get("fta_total")) or 0)
    clutch_fta = int(safe_num(row.get("clutch_fta")) or 0)
    ft_block = {
        "fta":         fta_total,
        "pct":         round_or_none(row.get("ft_pct_overall"), 1),
    }
    if clutch_fta >= MIN_CLUTCH_FT_SAMPLE:
        ft_block.update({
            "clutch_fta":   clutch_fta,
            "clutch_pct":   round_or_none(row.get("clutch_ft_pct"), 1),
            "clutch_delta": round_or_none(row.get("clutch_ft_delta"), 1),
        })
    block["ft"] = ft_block

    # Sensitivity sample (only the wider/looser default-comparable values)
    sens = {}
    for src, dst in [
        ("sens_aggressor_wider",   "aggressor_wider"),
        ("sens_aggressor_looser",  "aggressor_looser"),
        ("sens_overdriver_wider",  "overdriver_wider"),
        ("sens_overdriver_looser", "overdriver_looser"),
    ]:
        v = round_or_none(row.get(src), 2)
        if v is not None:
            sens[dst] = v
    if sens:
        block["sensitivity_pt"] = sens

    # Strip empty leaf-dicts
    return {k: v for k, v in block.items() if v not in (None, {})}


def main():
    # ── Load source CSV ──
    csv_path = CSV_LOCAL if CSV_LOCAL.exists() else CSV_PIPELINE
    if not csv_path.exists():
        print(f"ERROR: pbp_mind_metrics_all.csv not found in either location:")
        print(f"  {CSV_LOCAL}")
        print(f"  {CSV_PIPELINE}")
        print(f"  → Run: cd data-pipeline && python scripts/pbp_mind_metrics_all_seasons.py")
        sys.exit(1)
    print(f"Loading: {csv_path}")
    master = pd.read_csv(csv_path, low_memory=False)
    print(f"  {len(master):,} rows × {len(master.columns)} cols")
    print(f"  Seasons: {sorted(master['season'].dropna().unique().tolist())}")

    # Normalize names + sort by season ascending so groupby-last picks LATEST
    master["_nname"] = master["player_name"].apply(norm_name)
    master = master.sort_values("season")
    # Per normalized-name keep latest season
    latest = master.groupby("_nname", as_index=False).tail(1)
    print(f"  Unique players (latest-season): {len(latest):,}")

    # Build name → row dict
    metrics_by_nname = {}
    for _, r in latest.iterrows():
        if r["_nname"]:
            metrics_by_nname[r["_nname"]] = r

    # ── Walk DB profiles ──
    if not DB.exists():
        sys.exit(f"ERROR: DB not found at {DB} — run build_db.py first")
    conn = sqlite3.connect(DB)
    profiles = conn.execute("SELECT player_id, name, data FROM profiles").fetchall()
    print(f"\nDB profiles: {len(profiles):,}")

    matched, not_matched, written = 0, 0, 0
    sample_match = []
    update_rows = []

    for player_id, name, blob in profiles:
        nn = norm_name(name)
        row = metrics_by_nname.get(nn)
        if row is None:
            not_matched += 1
            continue
        matched += 1
        if len(sample_match) < 5:
            sample_match.append((name, row.get("season"), int(row.get("n_streaks") or 0)))

        # Decompress, attach mindMetrics, recompress
        try:
            obj = json.loads(zlib.decompress(blob).decode("utf-8"))
        except Exception:
            continue
        obj["mindMetrics"] = build_mind_block(row)
        new_blob = zlib.compress(json.dumps(obj, separators=(",", ":")).encode("utf-8"), level=9)
        update_rows.append((new_blob, player_id))
        written += 1

    print(f"  Matched: {matched:,}  Not-matched: {not_matched:,}")
    print(f"  Sample matches: {sample_match}")

    # Bulk-update
    print(f"\nWriting {len(update_rows):,} updates to DB...")
    conn.execute("BEGIN TRANSACTION")
    try:
        conn.executemany("UPDATE profiles SET data=? WHERE player_id=?", update_rows)
        conn.commit()
    except Exception as e:
        conn.rollback()
        sys.exit(f"ERROR during commit: {e}")
    conn.close()
    print(f"✅ Mind-Metrics injected into {written:,} profiles")

    # ── Verification: load 3 known prospects back from DB ──
    print(f"\n{'═'*70}")
    print("VERIFICATION — sample profiles read back from DB")
    print(f"{'═'*70}")
    conn = sqlite3.connect(DB)
    # Pull all profiles, build name-normalized lookup for fuzzy match
    all_profiles = conn.execute("SELECT name, data FROM profiles").fetchall()
    profile_by_nname = {norm_name(n): blob for n, blob in all_profiles}

    for name in ["Cooper Flagg", "Dylan Harper", "VJ Edgecombe", "Trae Young", "Chet Holmgren",
                 "Cade Cunningham", "Reed Sheppard", "Brandon Miller"]:
        blob = profile_by_nname.get(norm_name(name))
        if blob is None:
            print(f"  {name:<20} not in DB")
            continue
        r = (blob,)
        obj = json.loads(zlib.decompress(r[0]).decode("utf-8"))
        mm = obj.get("mindMetrics")
        if not mm:
            print(f"  {name:<20} mindMetrics missing")
            continue
        agg = mm.get("aggressor", {}).get("idx", "—")
        over = mm.get("overdriver", {}).get("idx", "—")
        hot = mm.get("hothead", {}).get("idx", "—")
        bb = mm.get("bounceback", {}).get("idx", "—")
        cltwp = mm.get("clutch_wp", {}).get("delta_efg", "—")
        late = mm.get("late_clock", {}).get("delta_efg", "—")
        ft = mm.get("ft", {}).get("clutch_pct", "—")
        n_str = mm.get("n_streaks", 0)
        ltd = "[LIMITED]" if mm.get("limited_sample") else ""
        print(f"  {name:<20} season={mm.get('season'):<8} n={n_str:>3}  "
              f"Agg={agg} Over={over} Hot={hot} BB={bb}  "
              f"CltWP={cltwp} Late={late} CltFT%={ft} {ltd}")
    conn.close()


if __name__ == "__main__":
    main()
