#!/usr/bin/env python3
"""
export_stats_lab.py — Sprint-4.0 (Stats Lab — Data Model + Export)
==================================================================

Wurzel:
  Plus User wollen filter+vergleichen über die ganzen Profile-Stats (Mind,
  Body, Skills, Roles, Projections, Intersections, Four Factors). Frontend
  soll alles client-side machen damit Render-Free-Tier (512MB) sicher ist —
  gleicher static-FileResponse-Pattern wie /api/board (Sprint-3.36).

Architektur:
  Plus build_db + alle inject_*.py erzeugen die DB.
  Plus DIESER script läuft einmal pro Deploy und materialisiert
    /api/stats_lab und /api/stats_lab/meta als statische JSON-Files.
  Plus uvicorn serviert sie via FileResponse → 0 MB Python-Memory pro Request.

INPUT:
  • DATA_DIR/prospecttheory.db
OUTPUT:
  • DATA_DIR/static/stats_lab.json       (compact per-player rows, gzipped on serve)
  • DATA_DIR/static/stats_lab_meta.json  (column-definitions + filter ranges + presets)
"""
from __future__ import annotations
import gzip
import json
import os
import sqlite3
import sys
import zlib
from pathlib import Path

BASE = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("DATA_DIR", BASE / "data" / "processed"))
DB_PATH = DATA_DIR / "prospecttheory.db"
STATIC_DIR = DATA_DIR / "static"

# Pool definitions
CURRENT_CLASSES = {2024, 2025, 2026}
HISTORIC_YEARS  = set(range(2008, 2021))   # 2008-2020 inclusive for compare-anchors

# Sprint-3.40: position-pool μ/σ for skill-intersection z-scores
# (same constants as App.jsx SKILL_INTERSECTIONS.pos_stats)
SKILL_INT_POS_STATS = {
    "Playmaker": {"orb_p": (3.050,  1.487), "ast_p": (27.189, 8.393), "blk_p": (0.924, 0.777)},
    "Wing":      {"orb_p": (6.269,  3.582), "ast_p": (13.227, 5.517), "blk_p": (2.244, 1.924)},
    "Big":       {"orb_p": (10.871, 3.047), "ast_p": (9.001,  4.628), "blk_p": (5.575, 3.112)},
}


def _decompress(blob):
    if blob is None:
        return None
    try:
        return json.loads(zlib.decompress(blob).decode("utf-8"))
    except Exception:
        try:
            return json.loads(blob.decode("utf-8") if isinstance(blob, bytes) else blob)
        except Exception:
            return None


def _r1(v):
    """Round to 1 decimal or None."""
    if v is None: return None
    try:
        f = float(v)
        if f != f or f in (float("inf"), float("-inf")): return None
        return round(f, 1)
    except (TypeError, ValueError):
        return None


def _r2(v):
    if v is None: return None
    try:
        f = float(v)
        if f != f or f in (float("inf"), float("-inf")): return None
        return round(f, 2)
    except (TypeError, ValueError):
        return None


def _pct(v):
    """Convert 0-1 probability to int 0-100."""
    if v is None: return None
    try:
        f = float(v)
        if f != f: return None
        return round(f * 100)
    except (TypeError, ValueError):
        return None


def _z(value, mu, sig):
    if value is None: return None
    try:
        v = float(value)
        if v != v: return None
        return round((v - mu) / sig, 2)
    except (TypeError, ValueError):
        return None


def _mind_z(mm, key):
    """Plus mindMetrics[<key>].z if available."""
    if not mm: return None
    sub = mm.get(key)
    if isinstance(sub, dict):
        return _r2(sub.get("z"))
    return None


def _mind_idx(mm, key):
    if not mm: return None
    sub = mm.get(key)
    if isinstance(sub, dict):
        return _r2(sub.get("idx"))
    return None


def build_row(profile: dict, board_row: dict) -> dict:
    """Plus compact per-player dict for the Stats Lab table."""
    mm = profile.get("mindMetrics") or {}
    pos = profile.get("pos") or board_row.get("pos")
    int_const = SKILL_INT_POS_STATS.get(pos, {})

    # Mind: adverse-rate drift (Sprint-3.24)
    h1 = mm.get("h1_adverse_rate")
    h2 = mm.get("h2_adverse_rate")
    m_drift = None
    if isinstance(h1, (int, float)) and isinstance(h2, (int, float)):
        m_drift = _r2(h2 - h1)

    # Skill intersections z (Sprint-3.40)
    zi_orb = _z(profile.get("orb_p"), *int_const["orb_p"]) if "orb_p" in int_const else None
    zi_ast = _z(profile.get("ast_p"), *int_const["ast_p"]) if "ast_p" in int_const else None
    zi_blk = _z(profile.get("blk_p"), *int_const["blk_p"]) if "blk_p" in int_const else None
    zi_cd = min(zi_orb, zi_ast) if (zi_orb is not None and zi_ast is not None) else None
    zi_tw = min(zi_ast, zi_blk) if (zi_ast is not None and zi_blk is not None) else None

    badges = profile.get("badges") or []
    redflags = profile.get("red_flags") or []
    badges_n = len(badges) if isinstance(badges, list) else profile.get("badge_count")
    redflag_n = len(redflags) if isinstance(redflags, list) else profile.get("red_flag_count")

    row = {
        # Identity
        "slug":   profile.get("slug"),
        "name":   profile.get("name"),
        "year":   int(profile.get("yr") or board_row.get("year") or 0) or None,
        "cls":    profile.get("cls"),
        "pos":    pos,
        "pos2":   profile.get("pos_detailed"),
        "source": profile.get("source"),
        "team":   profile.get("team"),
        "conf":   profile.get("conf"),
        "age":    _r1(profile.get("age")),
        "ht":     _r1(profile.get("ht")),

        # Projections (Sprint-3.11–3.20)
        "war":     _r1(profile.get("addedWins") or profile.get("war") or board_row.get("war")),
        "pie":     _r1(profile.get("pred_mu") or board_row.get("mu")),
        "ceil":    _r1(profile.get("ceiling")),
        "floor":   _r1(profile.get("floor")),
        "sigma":   _r2(profile.get("pred_sigma")),
        "p_super":   _pct(profile.get("prob_super")),
        "p_all":     _pct(profile.get("prob_allstar")),
        "p_start":   _pct(profile.get("prob_starter")),
        "p_role":    _pct(profile.get("prob_role")),
        "p_repl":    _pct(profile.get("prob_repl")),
        "p_out":     _pct(profile.get("prob_out")),
        "tier":      profile.get("tier") or board_row.get("tier"),
        "p_nba":     _pct(board_row.get("p_nba")),
        "ups":       _r1(profile.get("ups") or board_row.get("ups")),

        # 5 Pillars (Sprint-3.17 D.6)
        "feel":     _r1(profile.get("feel")),
        "shoot":    _r1(profile.get("shoot_score")),
        "def":      _r1(profile.get("def_score")),
        "athl":     _r1(profile.get("func_ath")),
        "ovr":      _r1(profile.get("overall")),
        "create":   _r1(profile.get("creation_score")),
        "box_cre":  _r2(profile.get("box_creation")),

        # Box raw
        "bpm":   _r1(profile.get("bpm")),
        "obpm":  _r1(profile.get("obpm")),
        "dbpm":  _r1(profile.get("dbpm")),
        "ts":    _r1(profile.get("ts")),
        "usg":   _r1(profile.get("usg")),
        "ast_p": _r1(profile.get("ast_p")),
        "to_p":  _r1(profile.get("to_p")),
        "orb_p": _r1(profile.get("orb_p")),
        "drb_p": _r1(profile.get("drb_p")),
        "stl_p": _r1(profile.get("stl_p")),
        "blk_p": _r1(profile.get("blk_p")),
        "ftr":   _r1(profile.get("ftr")),
        "rim_f": _r1(profile.get("rim_f")),
        "mid_f": _r1(profile.get("mid_f")),
        "three_f": _r1(profile.get("three_f")),
        "dunk_r": _r1(profile.get("dunk_r")),
        "rim_pct": _r1(profile.get("rim_pct")),
        "mid_pct": _r1(profile.get("mid_pct")),
        "tp_pct":  _r1(profile.get("tp_pct")),
        "fg_pct":  _r1(profile.get("fg_pct")),
        "ft_pct":  _r1(profile.get("ft_pct")),
        "efg":     _r1(profile.get("efg")),
        "ortg":    _r1(profile.get("ortg")),
        "fouls_40": _r1(profile.get("fouls_40")),

        # Per-game
        "pts": _r1(profile.get("pts")),
        "reb": _r1(profile.get("reb")),
        "ast": _r1(profile.get("ast")),
        "stl": _r1(profile.get("stl")),
        "blk": _r1(profile.get("blk")),
        "gp":  profile.get("gp"),
        "mp":  _r1(profile.get("min")),

        # Position-percentiles (Sprint-3.4)
        "pp_bpm":  _r1(profile.get("pctl_bpm")),
        "pp_usg":  _r1(profile.get("pctl_usg")),
        "pp_ts":   _r1(profile.get("pctl_ts")),
        "pp_ast":  _r1(profile.get("pctl_ast")),
        "pp_to":   _r1(profile.get("pctl_to")),
        "pp_orb":  _r1(profile.get("pctl_orb")),
        "pp_drb":  _r1(profile.get("pctl_drb")),
        "pp_stl":  _r1(profile.get("pctl_stl")),
        "pp_blk":  _r1(profile.get("pctl_blk")),
        "pp_ftr":  _r1(profile.get("pctl_ftr")),
        "pp_obpm": _r1(profile.get("pctl_obpm")),
        "pp_dbpm": _r1(profile.get("pctl_dbpm")),
        "pp_ast_to": _r1(profile.get("pctl_ast_to")),

        # Role Inference Matrix percentiles (Sprint-3.30, 13 roles + versatility)
        # Plus pctls are 0-100, stored at 1 decimal — frontend can z-convert if needed.
        "rz_play":    _r1(profile.get("role_playmaker")),
        "rz_score":   _r1(profile.get("role_scorer")),
        "rz_space":   _r1(profile.get("role_spacer")),
        "rz_drive":   _r1(profile.get("role_driver")),
        "rz_crash":   _r1(profile.get("role_crasher")),
        "rz_onball":  _r1(profile.get("role_onball")),
        "rz_switch":  _r1(profile.get("role_switch")),
        "rz_rim":     _r1(profile.get("role_rim_prot")),
        "rz_zone":    _r1(profile.get("role_zone")),
        "rz_connect": _r1(profile.get("role_connector")),
        "rz_helio":   _r1(profile.get("role_helio")),
        "rz_reb":     _r1(profile.get("role_rebounder")),
        "rz_micro":   _r1(profile.get("role_micro_spacer")),
        "rz_event":   _r1(profile.get("role_event")),
        "rz_versat":  profile.get("role_versatility"),

        # Four Factors / Possession Impact (CFFR)
        "ff_efg":  _r1(profile.get("ff_efg")),
        "ff_tov":  _r1(profile.get("ff_tov")),
        "ff_orb":  _r1(profile.get("ff_orb")),
        "ff_ftr":  _r1(profile.get("ff_ftr")),
        "ff_comp": _r1(profile.get("ff_comp")),

        # Skill Intersections (Sprint-3.40)
        "zi_orb": zi_orb,
        "zi_ast": zi_ast,
        "zi_blk": zi_blk,
        "zi_cd":  _r2(zi_cd),
        "zi_tw":  _r2(zi_tw),

        # Mind Metrics (Sprint-3.23–3.28)
        "m_aggr":     _mind_z(mm, "aggressor"),
        "m_aggr_idx": _mind_idx(mm, "aggressor"),
        "m_overd":    _mind_z(mm, "overdriver"),
        "m_hothead":  _mind_z(mm, "hothead"),
        "m_passive":  _mind_z(mm, "passive"),
        "m_bounce":   _mind_z(mm, "bounceback"),
        "m_stam":     _r2(mm.get("stamina_idx")),
        "m_drift":    m_drift,
        "m_clutch":   _r2(mm.get("clutch_wp")),
        "m_late":     _r2(mm.get("late_clock")),
        "m_sample":   mm.get("limited_sample"),
        "m_streaks":  mm.get("n_streaks"),

        # Archetype + Badges
        "arch":      profile.get("archetype"),
        "badges_n":  badges_n,
        "redflag_n": redflag_n,

        # Identity / risk
        "conf_lvl":  profile.get("confidence"),
        "made_nba":  board_row.get("made_nba"),

        # Validation (historical only)
        "peak_pie":  _r1(profile.get("peak_pie")),
        "peak_war":  _r1(profile.get("peak_war")),
    }
    return row


def export(verbose: bool = True):
    if not DB_PATH.exists():
        sys.exit(f"ERROR: {DB_PATH} not found")
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # Pull board rows first as a lookup (gives us year + made_nba + tier + confidence)
    cur.execute("SELECT slug, year, tier, made_nba, p_nba, ups, mu, war, pos, confidence FROM board")
    board_lookup = {r["slug"]: dict(r) for r in cur.fetchall()}
    if verbose:
        print(f"[stats_lab] board rows: {len(board_lookup):,}")

    # Pull all profiles; filter by year + Pool rules client-side after decode
    # Pool rules:
    #   - Current classes 2024-2026: confidence != 'very_low' (analog Big-Board)
    #   - Historic 2008-2020: must have peak_pie (NBA-careered reference pool)
    cur.execute("SELECT slug, data FROM profiles")
    rows = []
    n_total = 0
    n_skipped_year = 0
    n_skipped_no_year = 0
    n_skipped_lowconf = 0
    n_skipped_no_peak = 0

    for slug, blob in cur:
        n_total += 1
        profile = _decompress(blob)
        if not profile:
            continue
        board = board_lookup.get(slug, {})
        year_raw = profile.get("yr") or board.get("year")
        try:
            year = int(year_raw) if year_raw is not None else None
        except (ValueError, TypeError):
            year = None
        if year is None:
            n_skipped_no_year += 1
            continue
        is_current = year in CURRENT_CLASSES
        is_historic = year in HISTORIC_YEARS
        if not is_current and not is_historic:
            n_skipped_year += 1
            continue
        # Current cohort: drop very_low confidence (analog /api/board filter)
        if is_current:
            conf = profile.get("confidence") or board.get("confidence")
            if conf == "very_low":
                n_skipped_lowconf += 1
                continue
        # Historic cohort: only NBA-careered (peak_pie present)
        if is_historic:
            if profile.get("peak_pie") is None and profile.get("peak_war") is None:
                n_skipped_no_peak += 1
                continue
        row = build_row(profile, board)
        rows.append(row)

    if verbose:
        print(f"[stats_lab] profiles total:    {n_total:,}")
        print(f"[stats_lab] skip — no year:    {n_skipped_no_year:,}")
        print(f"[stats_lab] skip — year out:   {n_skipped_year:,}")
        print(f"[stats_lab] skip — very_low:   {n_skipped_lowconf:,}")
        print(f"[stats_lab] skip — no peak:    {n_skipped_no_peak:,}")
        print(f"[stats_lab] rows kept:         {len(rows):,}")
        from collections import Counter
        yc = Counter(r["year"] for r in rows)
        for y in sorted(yc):
            print(f"  year {y}: {yc[y]:,}")

    # Sort: current draft years first (current → past), then historic descending
    def sort_key(r):
        y = r["year"] or 0
        # current classes get priority bucket (0), historic bucket (1)
        bucket = 0 if y in CURRENT_CLASSES else 1
        return (bucket, -y, -(r.get("war") or -999))
    rows.sort(key=sort_key)

    # Plus drop null-fields per row — saves ~60% bytes (most stats have many nulls)
    # Frontend reads p[key] → undefined → falsy, same code path as null.
    compact_rows = [{k: v for k, v in r.items() if v is not None} for r in rows]

    # Write both raw + pre-gzipped — uvicorn serves the .gz with Content-Encoding: gzip
    data_path = STATIC_DIR / "stats_lab.json"
    payload = json.dumps({"rows": compact_rows, "n": len(compact_rows)}, separators=(",", ":"))
    with open(data_path, "w", encoding="utf-8") as fh:
        fh.write(payload)
    gz_path = STATIC_DIR / "stats_lab.json.gz"
    with gzip.open(gz_path, "wb", compresslevel=9) as fh:
        fh.write(payload.encode("utf-8"))
    if verbose:
        raw_mb = data_path.stat().st_size / 1024 / 1024
        gz_mb  = gz_path.stat().st_size / 1024 / 1024
        print(f"[stats_lab] wrote {data_path.name}: {raw_mb:.2f} MB raw / {gz_mb:.2f} MB gz ({len(compact_rows):,} rows)")

    # Meta file — column-definitions, presets, filter defaults
    meta = build_meta()
    meta_path = STATIC_DIR / "stats_lab_meta.json"
    with open(meta_path, "w", encoding="utf-8") as fh:
        json.dump(meta, fh, indent=2)
    if verbose:
        print(f"[stats_lab] wrote {meta_path.name}: {len(meta['cols'])} cols, {len(meta['presets'])} presets")

    conn.close()


def build_meta() -> dict:
    """Plus column-definitions: label + group + format + range."""
    G_ID, G_PROJ, G_PILL, G_BOX, G_PCTL = "identity", "projection", "pillars", "box", "pctl"
    G_ROLES, G_FF, G_SI, G_MIND, G_ARCH = "roles", "ff", "skill_int", "mind", "archetype"

    cols = [
        # Identity
        {"k": "name",   "label": "Player",     "g": G_ID, "fmt": "name", "pinned": True, "src": "pt",
         "tip": "Click to open the player's full profile."},
        {"k": "year",   "label": "Class",      "g": G_ID, "fmt": "int", "src": "pt",
         "tip": "Draft Class year — when he's eligible for the NBA Draft."},
        {"k": "cls",    "label": "Yr",         "g": G_ID, "fmt": "str", "src": "bt",
         "tip": "College class: Fr/So/Jr/Sr/5 (5th-year senior). Younger players with comparable production have higher upside."},
        {"k": "pos",    "label": "Pos",        "g": G_ID, "fmt": "str", "src": "pt",
         "tip": "Position group used across the site: Playmaker / Wing / Big. Height-based with usage + shot-block edge-case rules."},
        {"k": "pos2",   "label": "Pos Det.",   "g": G_ID, "fmt": "str", "src": "pt",
         "tip": "Detailed 5-position bucket: PG/SG/SF/PF/C. Used for Body-Tab anthropometric tier comparisons."},
        {"k": "source", "label": "Src",        "g": G_ID, "fmt": "str", "src": "pt",
         "tip": "Data source: NCAA (BartTorvik) or INTL (RealGM / Euroleague / EuroCup PBP)."},
        {"k": "team",   "label": "Team",       "g": G_ID, "fmt": "str", "src": "bt",
         "tip": "Latest school / club."},
        {"k": "conf",   "label": "Conf",       "g": G_ID, "fmt": "str", "src": "bt",
         "tip": "NCAA Conference or international league. Strong conferences = competition-adjusted box stats."},
        {"k": "age",    "label": "Age",        "g": G_ID, "fmt": "dec1", "range": [16, 24], "src": "pt",
         "tip": "Age (years) as of June 30 of draft year. Younger = bigger projection upside per equivalent stats."},
        {"k": "ht",     "label": "Ht (in)",    "g": G_ID, "fmt": "dec1", "range": [70, 90], "src": "bt",
         "tip": "Height with shoes (inches). 72\" = 6'0\", 84\" = 7'0\"."},

        # Projection
        {"k": "war",     "label": "Proj WAR",     "g": G_PROJ, "fmt": "dec1", "range": [-5, 20], "src": "pt",
         "tip": "Projected peak Wins Added — best 3-consecutive-season window in first 8 NBA years. Two-stage hurdle model: P(NBA) × E[WA | NBA]. Sober: a college profile rarely signals stardom — star upside lives in the tier probabilities."},
        {"k": "pie",     "label": "Proj PIE",     "g": G_PROJ, "fmt": "dec1", "range": [-5, 25], "src": "pt",
         "tip": "Predicted Peak PIE (Player Impact Estimate) — alternative outcome target on NBA's PIE scale."},
        {"k": "ceil",    "label": "Ceiling",      "g": G_PROJ, "fmt": "dec1"},
        {"k": "floor",   "label": "Floor",        "g": G_PROJ, "fmt": "dec1"},
        {"k": "sigma",   "label": "Sigma",        "g": G_PROJ, "fmt": "dec2"},
        {"k": "p_super", "label": "P(Super) %",   "g": G_PROJ, "fmt": "pct", "range": [0, 100]},
        {"k": "p_all",   "label": "P(All-Star) %","g": G_PROJ, "fmt": "pct", "range": [0, 100]},
        {"k": "p_start", "label": "P(Starter) %", "g": G_PROJ, "fmt": "pct", "range": [0, 100]},
        {"k": "p_role",  "label": "P(Role) %",    "g": G_PROJ, "fmt": "pct", "range": [0, 100]},
        {"k": "p_repl",  "label": "P(Repl) %",    "g": G_PROJ, "fmt": "pct", "range": [0, 100]},
        {"k": "p_out",   "label": "P(Out) %",     "g": G_PROJ, "fmt": "pct", "range": [0, 100]},
        {"k": "p_nba",   "label": "P(NBA) %",     "g": G_PROJ, "fmt": "pct", "range": [0, 100]},
        {"k": "tier",    "label": "Tier",         "g": G_PROJ, "fmt": "str"},
        {"k": "ups",     "label": "Upside",       "g": G_PROJ, "fmt": "dec1"},
        {"k": "made_nba","label": "Made NBA",     "g": G_PROJ, "fmt": "bool"},

        # 5 Pillars
        {"k": "feel",    "label": "Feel",          "g": G_PILL, "fmt": "dec1", "range": [0, 100]},
        {"k": "shoot",   "label": "Shooting",      "g": G_PILL, "fmt": "dec1", "range": [0, 100]},
        {"k": "def",     "label": "Defense",       "g": G_PILL, "fmt": "dec1", "range": [0, 100]},
        {"k": "athl",    "label": "Func. Athl",    "g": G_PILL, "fmt": "dec1", "range": [0, 100]},
        {"k": "ovr",     "label": "Overall",       "g": G_PILL, "fmt": "dec1", "range": [0, 100]},
        {"k": "create",  "label": "Creation",      "g": G_PILL, "fmt": "dec1", "range": [0, 100]},
        {"k": "box_cre", "label": "Box Creation",  "g": G_PILL, "fmt": "dec2", "range": [0, 50]},

        # Box raw
        # Sprint-4.4: Box stats — `tip` field powers the per-column header
        # tooltip in the Stats Lab UI. Kept terse (~1 sentence) so hover is
        # readable. `range` for color-coding (red→neutral→green or 0-100 warm).
        # `src`: "bt" = BartTorvik standard, "pt" = ProspectTheory proprietary.
        {"k": "bpm",   "label": "BPM",        "g": G_BOX, "fmt": "dec1", "range": [-5, 20], "src": "bt",
         "tip": "Box Plus/Minus — single-number all-in offensive+defensive value vs an average D-1 player, per 100 possessions. Higher = better. Elite ≥ 10, NBA-typical 4-9, role-player ≤ 2."},
        {"k": "obpm",  "label": "OBPM",       "g": G_BOX, "fmt": "dec1", "range": [-5, 15], "src": "bt",
         "tip": "Offensive Box Plus/Minus — offensive component of BPM. Captures scoring + playmaking impact."},
        {"k": "dbpm",  "label": "DBPM",       "g": G_BOX, "fmt": "dec1", "range": [-5, 8],  "src": "bt",
         "tip": "Defensive Box Plus/Minus — defensive component of BPM. Box-based proxy, less reliable than impact stats for guards."},
        {"k": "ts",    "label": "TS%",        "g": G_BOX, "fmt": "dec1", "range": [40, 75], "src": "bt",
         "tip": "True Shooting% — points per scoring possession including FTs (PTS / 2·(FGA + 0.44·FTA)). Captures shot quality + free-throw merit. D-1 league average ~ 53%."},
        {"k": "usg",   "label": "USG%",       "g": G_BOX, "fmt": "dec1", "range": [10, 40], "src": "bt",
         "tip": "Usage Rate — % of his team's possessions he ends (FGA + 0.44·FTA + TO) while on floor. High-usage = primary option (≥ 25%), low-usage = specialist (< 18%)."},
        {"k": "ast_p", "label": "AST%",       "g": G_BOX, "fmt": "dec1", "range": [0, 45], "src": "bt",
         "tip": "Assist Rate — % of teammate FGM he assisted while on floor. Pure playmaking volume. Lead-guard ≥ 25, wing 8-15, big < 8."},
        {"k": "to_p",  "label": "TO%",        "g": G_BOX, "fmt": "dec1", "range": [5, 30], "src": "bt",
         "tip": "Turnover Rate — turnovers per 100 possessions used. LOWER is better. High-usage initiators sit naturally higher (16-22)."},
        {"k": "orb_p", "label": "ORB%",       "g": G_BOX, "fmt": "dec1", "range": [0, 20], "src": "bt",
         "tip": "Offensive Rebound Rate — % of available ORBs he secured while on floor. Activity + positioning signal. Big ≥ 10, wing 3-8, guard ≤ 3."},
        {"k": "drb_p", "label": "DRB%",       "g": G_BOX, "fmt": "dec1", "range": [0, 30], "src": "bt",
         "tip": "Defensive Rebound Rate — % of available DRBs he secured while on floor. Big ≥ 20, wing 12-18, guard 6-10."},
        {"k": "stl_p", "label": "STL%",       "g": G_BOX, "fmt": "dec1", "range": [0, 5], "src": "bt",
         "tip": "Steal Rate — % of opp possessions ending in his steal. Anticipation + hand-activity. ≥ 3% is elite event-creator territory."},
        {"k": "blk_p", "label": "BLK%",       "g": G_BOX, "fmt": "dec1", "range": [0, 14], "src": "bt",
         "tip": "Block Rate — % of opp 2P attempts he blocked. Bigs ≥ 6 = rim-protector signal. Wing 1.5-3 = vertical contestor."},
        {"k": "ftr",   "label": "FTr",        "g": G_BOX, "fmt": "dec1", "range": [0, 100], "src": "bt",
         "tip": "Free-Throw Rate — FTA / FGA × 100. Foul-drawing skill + interior aggression. ≥ 50 = drives + plays through contact, ≤ 25 = jumpshooter."},
        {"k": "rim_f", "label": "Rim Freq",   "g": G_BOX, "fmt": "dec1", "range": [0, 80], "src": "bt",
         "tip": "Rim Frequency — % of his FGA at the rim. Shot-distribution signal."},
        {"k": "mid_f", "label": "Mid Freq",   "g": G_BOX, "fmt": "dec1", "range": [0, 60], "src": "bt",
         "tip": "Mid-range Frequency — % of his FGA from mid-range (2P, non-rim). Modern NBA discount this — high mid % is usually a red flag for translation."},
        {"k": "three_f","label": "3PAr",      "g": G_BOX, "fmt": "dec1", "range": [0, 80], "src": "bt",
         "tip": "Three-Point Attempt Rate — % of his FGA from 3. Shooting volume / range signal. ≥ 45 = modern stretch, ≤ 20 = no-range."},
        {"k": "dunk_r","label": "Dunk Rate",  "g": G_BOX, "fmt": "dec1", "range": [0, 30], "src": "bt",
         "tip": "Dunk Rate — % of his FGA that were dunks. Vertical-athlete signal for bigs + cutters."},
        {"k": "rim_pct","label": "Rim FG%",   "g": G_BOX, "fmt": "dec1", "range": [40, 90], "src": "bt",
         "tip": "Rim Finishing% — FG% on attempts at the rim. Touch + strength at the basket. ≥ 70 = elite finisher."},
        {"k": "mid_pct","label": "Mid FG%",   "g": G_BOX, "fmt": "dec1", "range": [20, 60], "src": "bt",
         "tip": "Mid-range FG% — efficiency in the mid-range zone. D-1 average ~ 38%."},
        {"k": "tp_pct","label": "3P%",        "g": G_BOX, "fmt": "dec1", "range": [20, 50], "src": "bt",
         "tip": "Three-point % — raw 3P make rate. ≥ 38 with volume = projectable shooter; ≤ 30 with volume = red flag."},
        {"k": "fg_pct","label": "FG%",        "g": G_BOX, "fmt": "dec1", "range": [30, 65], "src": "bt",
         "tip": "Overall FG% — total makes / total attempts. Less informative than eFG/TS because it doesn't credit the extra value of 3s or FTs."},
        {"k": "ft_pct","label": "FT%",        "g": G_BOX, "fmt": "dec1", "range": [50, 95], "src": "bt",
         "tip": "Free-Throw % — strong forward-looking signal for shooting translation. ≥ 80 = projectable shooter, ≤ 65 = touch concern."},
        {"k": "efg",   "label": "eFG%",       "g": G_BOX, "fmt": "dec1", "range": [40, 70], "src": "bt",
         "tip": "Effective Field Goal % — FG% adjusted for the bonus value of 3s ((FGM + 0.5·3PM) / FGA). Cleaner shot-quality lens than raw FG%."},
        {"k": "ortg",  "label": "ORtg",       "g": G_BOX, "fmt": "dec1", "range": [80, 130], "src": "bt",
         "tip": "Offensive Rating — points produced per 100 possessions used. Composite score-and-distribute lens. ≥ 115 with high usage = star territory."},
        {"k": "fouls_40","label": "PF/40",    "g": G_BOX, "fmt": "dec1", "range": [0, 7], "src": "bt",
         "tip": "Personal Fouls per 40 minutes. Discipline + defensive footwork signal. ≤ 3 = clean, ≥ 5 = foul-prone."},
        {"k": "pts",   "label": "PPG",        "g": G_BOX, "fmt": "dec1", "src": "bt",
         "tip": "Points per game — raw scoring volume. Less context-aware than per-possession metrics."},
        {"k": "reb",   "label": "RPG",        "g": G_BOX, "fmt": "dec1", "src": "bt",
         "tip": "Rebounds per game (total)."},
        {"k": "ast",   "label": "APG",        "g": G_BOX, "fmt": "dec1", "src": "bt",
         "tip": "Assists per game."},
        {"k": "stl",   "label": "SPG",        "g": G_BOX, "fmt": "dec1", "src": "bt",
         "tip": "Steals per game."},
        {"k": "blk",   "label": "BPG",        "g": G_BOX, "fmt": "dec1", "src": "bt",
         "tip": "Blocks per game."},
        {"k": "gp",    "label": "GP",         "g": G_BOX, "fmt": "int", "src": "bt",
         "tip": "Games Played in the latest season. Sample-size watchdog — single-digit GP makes rate stats noisy."},
        {"k": "mp",    "label": "MPG",        "g": G_BOX, "fmt": "dec1", "range": [0, 40], "src": "bt",
         "tip": "Minutes per Game — role-volume signal. ≥ 30 = clear starter, ≤ 18 = rotation depth."},

        # Percentiles (position-stratified)
        {"k": "pp_bpm",   "label": "Pctl BPM",   "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_usg",   "label": "Pctl USG",   "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_ts",    "label": "Pctl TS",    "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_ast",   "label": "Pctl AST",   "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_to",    "label": "Pctl TO",    "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_orb",   "label": "Pctl ORB",   "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_drb",   "label": "Pctl DRB",   "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_stl",   "label": "Pctl STL",   "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_blk",   "label": "Pctl BLK",   "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_ftr",   "label": "Pctl FTr",   "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_obpm",  "label": "Pctl OBPM",  "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_dbpm",  "label": "Pctl DBPM",  "g": G_PCTL, "fmt": "dec1", "range": [0, 100]},
        {"k": "pp_ast_to","label": "Pctl AST:TO","g": G_PCTL, "fmt": "dec1", "range": [0, 100]},

        # Role Inference — percentiles 0-100 within position (NOT z-scores).
        # Frontend role_to_z() conversion lives in App.jsx; we keep raw pctls
        # here so the Lab matches the Role-Matrix Tab numbers 1:1.
        {"k": "rz_play",    "label": "Playmaker Pctl",  "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_score",   "label": "Scorer Pctl",     "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_space",   "label": "Spacer Pctl",     "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_drive",   "label": "Driver Pctl",     "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_crash",   "label": "Crasher Pctl",    "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_onball",  "label": "On-Ball D Pctl",  "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_switch",  "label": "Switch Pctl",     "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_rim",     "label": "Rim Prot Pctl",   "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_zone",    "label": "Zone Pctl",       "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_connect", "label": "Connector Pctl",  "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_helio",   "label": "Helio Pctl",      "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_reb",     "label": "Rebounder Pctl",  "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_micro",   "label": "Micro Space Pctl","g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_event",   "label": "Event Crtr Pctl", "g": G_ROLES, "fmt": "dec1", "range": [0, 100]},
        {"k": "rz_versat",  "label": "Versatility",     "g": G_ROLES, "fmt": "int",  "range": [0, 13]},

        # Four Factors / Possession Impact
        {"k": "ff_efg",  "label": "FF eFG Pctl",  "g": G_FF, "fmt": "dec1", "range": [0, 100]},
        {"k": "ff_tov",  "label": "FF TO Pctl",   "g": G_FF, "fmt": "dec1", "range": [0, 100]},
        {"k": "ff_orb",  "label": "FF ORB Pctl",  "g": G_FF, "fmt": "dec1", "range": [0, 100]},
        {"k": "ff_ftr",  "label": "FF FTr Pctl",  "g": G_FF, "fmt": "dec1", "range": [0, 100]},
        {"k": "ff_comp", "label": "NPV (CFFR)",   "g": G_FF, "fmt": "dec1", "range": [0, 100]},

        # Skill Intersections
        {"k": "zi_orb", "label": "Z ORB% (Pos)",         "g": G_SI, "fmt": "dec2", "range": [-3, 3]},
        {"k": "zi_ast", "label": "Z AST% (Pos)",         "g": G_SI, "fmt": "dec2", "range": [-3, 3]},
        {"k": "zi_blk", "label": "Z BLK% (Pos)",         "g": G_SI, "fmt": "dec2", "range": [-3, 3]},
        {"k": "zi_cd",  "label": "Crasher+Distributor",  "g": G_SI, "fmt": "dec2", "range": [-3, 3]},
        {"k": "zi_tw",  "label": "Two-Way Skill",        "g": G_SI, "fmt": "dec2", "range": [-3, 3]},

        # Mind Metrics
        {"k": "m_aggr",     "label": "Z Aggressor",   "g": G_MIND, "fmt": "dec2", "range": [-3, 3]},
        {"k": "m_aggr_idx", "label": "Aggressor Idx", "g": G_MIND, "fmt": "dec2"},
        {"k": "m_overd",    "label": "Z Overdriver",  "g": G_MIND, "fmt": "dec2", "range": [-3, 3]},
        {"k": "m_hothead",  "label": "Z Hothead",     "g": G_MIND, "fmt": "dec2", "range": [-3, 3]},
        {"k": "m_passive",  "label": "Z Passive",     "g": G_MIND, "fmt": "dec2", "range": [-3, 3]},
        {"k": "m_bounce",   "label": "Z Bounceback",  "g": G_MIND, "fmt": "dec2", "range": [-3, 3]},
        {"k": "m_stam",     "label": "Stamina Idx",   "g": G_MIND, "fmt": "dec2", "range": [0, 2]},
        {"k": "m_drift",    "label": "Adverse Drift", "g": G_MIND, "fmt": "dec2", "range": [-0.3, 0.3]},
        {"k": "m_clutch",   "label": "Clutch WP",     "g": G_MIND, "fmt": "dec2"},
        {"k": "m_late",     "label": "Late Clock",    "g": G_MIND, "fmt": "dec2"},
        {"k": "m_streaks",  "label": "Mind Streaks",  "g": G_MIND, "fmt": "int"},
        {"k": "m_sample",   "label": "Limited Sample","g": G_MIND, "fmt": "bool"},

        # Archetype + Badges
        {"k": "arch",      "label": "Archetype",   "g": G_ARCH, "fmt": "str"},
        {"k": "badges_n",  "label": "Badges (n)",  "g": G_ARCH, "fmt": "int"},
        {"k": "redflag_n", "label": "Red Flags",   "g": G_ARCH, "fmt": "int"},
        {"k": "conf_lvl",  "label": "Confidence",  "g": G_ARCH, "fmt": "str"},

        # Validation (historical only)
        {"k": "peak_pie",  "label": "Peak PIE (act.)", "g": G_PROJ, "fmt": "dec1"},
        {"k": "peak_war",  "label": "Peak WA (act.)",  "g": G_PROJ, "fmt": "dec1"},
    ]

    groups = [
        {"id": G_ID,   "label": "Identity"},
        {"id": G_PROJ, "label": "Projections"},
        {"id": G_PILL, "label": "5 Pillars"},
        {"id": G_BOX,  "label": "Box Stats"},
        {"id": G_PCTL, "label": "Position Percentiles"},
        {"id": G_ROLES,"label": "Role Inference (z)"},
        {"id": G_FF,   "label": "Four Factors (CFFR)"},
        {"id": G_SI,   "label": "Skill Intersections (z)"},
        {"id": G_MIND, "label": "Mind Metrics"},
        {"id": G_ARCH, "label": "Archetype + Badges"},
    ]

    # Sprint-4.4 (Tobias 2026-06-23): BartTorvik-Parity-Default. Default-Preset
    # spiegelt die BartTorvik-playerstat-Spalten (Identity + Produktion + Box
    # Stats + Shooting) plus eine kurze proprietäre Tail-Section am Ende
    # (Pillars + WAR + P(All-Star)). Default-Sort: BPM descending — analog zu
    # BartTorvik "T-Rank Player Stats" Standard-View.
    presets = [
        {"id": "bt_standard", "label": "BartTorvik Standard", "cols": [
            # Identity
            "name", "year", "cls", "pos", "team", "conf",
            # Production
            "gp", "mp", "ortg", "usg",
            # Plus/Minus
            "bpm", "obpm", "dbpm",
            # Efficiency
            "ts", "efg", "ft_pct", "tp_pct",
            # Box
            "ast_p", "to_p", "orb_p", "drb_p", "stl_p", "blk_p", "ftr",
            # Shooting profile
            "three_f", "rim_pct", "mid_pct", "dunk_r",
            # Discipline
            "fouls_40",
            # ProspectTheory tail — proprietary values that we add to BartTorvik baseline
            "war", "p_all", "feel", "shoot", "def", "athl",
        ]},
        {"id": "default", "label": "Projection Lens", "cols": [
            "name", "year", "pos", "age", "ht", "war", "p_super", "p_all", "feel", "shoot", "def", "athl", "arch"
        ]},
        {"id": "shooters", "label": "Shooters Audit", "cols": [
            "name", "pos", "year", "shoot", "ts", "tp_pct", "three_f", "ftr", "p_super", "p_all"
        ]},
        {"id": "defenders", "label": "All-Defensive", "cols": [
            "name", "pos", "year", "def", "dbpm", "blk_p", "stl_p", "drb_p", "rz_rim", "rz_onball", "rz_switch"
        ]},
        {"id": "skill_int", "label": "Skill Intersections", "cols": [
            "name", "pos", "year", "zi_orb", "zi_ast", "zi_blk", "zi_cd", "zi_tw", "war"
        ]},
        {"id": "mind", "label": "Mind / Resilience", "cols": [
            "name", "pos", "year", "m_aggr", "m_overd", "m_hothead", "m_bounce", "m_stam", "m_drift", "m_clutch"
        ]},
        {"id": "roles", "label": "Role Versatility", "cols": [
            "name", "pos", "year", "rz_versat", "rz_play", "rz_score", "rz_space", "rz_drive", "rz_crash",
            "rz_onball", "rz_rim"
        ]},
        {"id": "validation", "label": "Validation (Historic)", "cols": [
            "name", "year", "pos", "war", "p_super", "p_all", "peak_pie", "peak_war"
        ]},
    ]

    filter_defaults = {
        # Default — only the current draft cycle, in line with what the user asked for.
        "year": [2026],
        # Sprint-4.4: Default-Preset + Default-Sort gespiegelt zur BartTorvik
        # playerstat-Landing-View ("T-Rank Player Stats" sortiert nach BPM).
        "preset":   "bt_standard",
        "sort_key": "bpm",
        "sort_dir": "desc",
    }

    return {
        "groups": groups,
        "cols": cols,
        "presets": presets,
        "filter_defaults": filter_defaults,
        "schema_version": 2,
    }


if __name__ == "__main__":
    export()
