"""
ProspectTheory API v2.0 — FastAPI backend serving precomputed player data.

Uses compressed api_*.json files from Script 11.

Endpoints:
  GET /api/years                        → Available draft years
  GET /api/board?n=500&year=2026        → Big Board (full profiles, sorted by ppWA)
  GET /api/players/search?q=name        → Search players by name
  GET /api/player/{name}                → Full player profile
  GET /api/comps/stats/{name}           → Statistical comparisons
  GET /api/comps/anthro/{name}          → Anthropometric comparisons
  GET /api/tiers/{name}                 → Tier probabilities
  GET /api/players/top?n=50             → Top N by ppWA
  GET /api/players/draft/{year}         → All players from a draft year

Run:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
import gzip
import json
import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ═══════════════════════════════════════════════════════════
# APP CONFIG
# ═══════════════════════════════════════════════════════════

app = FastAPI(
    title="ProspectTheory API",
    description="NBA Draft Intelligence — Player profiles, comparisons, and tier predictions",
    version="2.4.0",  # anthro live fallback vs combine DB, board age filter
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://prospecttheory.io",
        "https://www.prospecttheory.io",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════════════════════════════════
# DATA LOADING (compressed api_*.json from Script 11)
# ═══════════════════════════════════════════════════════════

DATA_DIR = Path(os.getenv("DATA_DIR", "data/processed"))

_profiles = None
_stat_comps = None
_anthro_comps = None
_search_index = None
_years_cache = None   # sorted list of unique draft years


def _get_years() -> list:
    """Sorted unique draft years from profiles (cached)."""
    global _years_cache
    if _years_cache is None:
        profiles = get_profiles()
        years = sorted({v.get("yr") for v in profiles.values() if v.get("yr")}, reverse=True)
        _years_cache = years
    return _years_cache


# Fields returned by /api/board per player — ALL fields needed for every tab,
# so the front-end NEVER needs a second profile fetch.
_BOARD_FIELDS = [
    "name", "pos", "team", "yr", "source", "made_nba", "tier", "actual",
    "age", "conf_tier", "conf", "ht", "wt", "wingspan",
    # ppWA model v2
    "ppwa", "pElite", "waFloor", "waCeiling", "waSigma",
    "v2Tier", "v2TierProbs", "v2Conf", "posGroup",
    # Legacy prediction fields (fallback)
    "pred_mu", "pred_sigma", "pred_p_nba", "pred_tier",
    # Tier probabilities (old model — still used as fallback in tier chart)
    "prob_super", "prob_allstar", "prob_starter", "prob_role", "prob_repl", "prob_neg",
    # Core stats (Overview + pReady check)
    "pctl_overall", "pctl", "bpm", "obpm", "dbpm", "ortg",
    "usg", "ts", "pts", "ast", "reb", "stl", "blk",
    "ast_p", "to_p", "orb_p", "drb_p", "stl_p", "blk_p", "ftr",
    "gp", "min", "fg_pct", "efg", "tp_pct", "ft_pct", "two_pct",
    "fta", "ftm", "fga", "fouls_40",
    # Percentiles for box score and advanced stats
    "pctl_pts36", "pctl_reb36", "pctl_ast36", "pctl_ast_to",
    "pctl_stl", "pctl_blk", "pctl_bpm", "pctl_obpm", "pctl_dbpm",
    "pctl_ftr", "pctl_to", "pctl_usg", "pctl_ts", "pctl_orb", "pctl_drb",
    # Shooting zone data (Shooting tab)
    "rim_f", "rim_pct", "mid_f", "mid_pct", "three_f",
    "dunk_r", "dunk_pct",
    # Scores and creation
    "feel", "func_ath", "shoot_score", "def_score", "overall",
    "self_creation", "creation_score", "self_creation_raw", "box_creation",
    "cffr", "cffr_usage_role",
    # Four-factor possession scores (Scouting tab)
    "ff_efg", "ff_tov", "ff_orb", "ff_ftr", "ff_comp",
    # Role inference scores (Scouting tab — 15 roles)
    "role_scorer", "role_playmaker", "role_spacer", "role_driver", "role_crasher",
    "role_onball", "role_rim_prot", "role_rebounder", "role_switch",
    "role_connector", "role_helio", "role_event", "role_zone", "role_micro_spacer",
    "role_versatility",
    # Archetypes and NBA projection
    "archetype", "archetypes_all",
    "career_path", "confidence", "ups",
    "proj_3p", "proj_3pa", "proj_3par", "proj_ts", "proj_prior",
    # Season lines for trajectory
    "seasonLines", "seasons",
    # Recruit rank, source context
    "recRank", "rec_rank", "cls", "bt_url",
    # Badges (pipe-delimited strings)
    "badges", "red_flags", "yellow_badges",
    # Projection drivers
    "projection_boosters", "projection_limiters",
    "v2Boosters", "v2Limiters",
]


def load_json(filepath: Path):
    """Load a JSON file (.json or .json.gz). Returns empty dict if missing."""
    gz_path = Path(str(filepath) + ".gz") if not str(filepath).endswith(".gz") else filepath
    json_path = filepath if not str(filepath).endswith(".gz") else Path(str(filepath)[:-3])

    if gz_path.exists():
        with gzip.open(gz_path, "rt", encoding="utf-8") as f:
            return json.load(f)
    elif json_path.exists():
        with open(json_path, "r", encoding="utf-8") as f:
            return json.load(f)
    else:
        print(f"⚠️  Not found: {filepath}")
        return {}


def get_profiles() -> dict:
    global _profiles
    if _profiles is None:
        print("Loading profiles...")
        _profiles = load_json(DATA_DIR / "api_profiles.json")
        print(f"  → {len(_profiles):,} profiles")
    return _profiles


def get_stat_comps() -> dict:
    global _stat_comps
    if _stat_comps is None:
        print("Loading stat comps...")
        _stat_comps = load_json(DATA_DIR / "api_stat_comps.json")
        print(f"  → {len(_stat_comps):,} entries")
    return _stat_comps


def get_anthro_comps() -> dict:
    global _anthro_comps
    if _anthro_comps is None:
        print("Loading anthro comps...")
        _anthro_comps = load_json(DATA_DIR / "api_anthro_comps.json")
        print(f"  → {len(_anthro_comps):,} entries")
    return _anthro_comps


def get_search_index() -> list:
    global _search_index
    if _search_index is None:
        print("Loading search index...")
        data = load_json(DATA_DIR / "api_search_index.json")
        if isinstance(data, list):
            _search_index = data
        else:
            # Fallback: build from profiles
            _search_index = []
            for name, p in get_profiles().items():
                _search_index.append({
                    "n": name, "t": p.get("team", ""),
                    "p": p.get("pos", ""), "y": p.get("yr"),
                    "nba": p.get("made_nba", False),
                    "tier": p.get("tier", ""),
                    "mu": p.get("pred_mu"), "pn": p.get("pred_p_nba"),
                })
            _search_index.sort(key=lambda x: (-(x.get("pn") or 0), -(x.get("mu") or 0)))
        print(f"  → {len(_search_index):,} players in index")
    return _search_index


def find_player(name: str) -> tuple:
    """Case-insensitive player lookup. Returns (canonical_name, profile)."""
    profiles = get_profiles()
    # Exact match
    if name in profiles:
        return name, profiles[name]
    # Case-insensitive
    nl = name.lower()
    for k, v in profiles.items():
        if k.lower() == nl:
            return k, v
    return None, None


# ═══════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════

@app.get("/")
async def root():
    return {"name": "ProspectTheory API", "version": "2.4.0"}


@app.get("/health")
async def health():
    profiles = get_profiles()
    stats = get_stat_comps()
    return {
        "status": "ok",
        "profiles": len(profiles),
        "stat_comps": len(stats),
    }


@app.get("/api/players/search")
async def search_players(
    q: str = Query(..., min_length=1),
    nba_only: bool = False,
    position: Optional[str] = None,
    year: Optional[int] = None,
    limit: int = Query(25, ge=1, le=100),
):
    """Search players by name (fuzzy, case-insensitive)."""
    ql = q.lower()
    results = []
    for entry in get_search_index():
        name = entry.get("n", "")
        if ql not in name.lower():
            continue
        if nba_only and not entry.get("nba"):
            continue
        if position and entry.get("p") != position:
            continue
        if year and entry.get("y") != year:
            continue
        results.append({
            "name": name,
            "team": entry.get("t", ""),
            "position": entry.get("p", ""),
            "year": entry.get("y"),
            "made_nba": entry.get("nba", False),
            "tier": entry.get("tier", ""),
            "pred_mu": entry.get("mu"),
            "pred_p_nba": entry.get("pn"),
        })
        if len(results) >= limit:
            break
    return {"query": q, "count": len(results), "results": results}


@app.get("/api/player/{name}")
async def get_player(name: str):
    """Full player profile."""
    canonical, profile = find_player(name)
    if profile is None:
        raise HTTPException(404, f"Player '{name}' not found")
    return {"name": canonical, "profile": profile}


@app.get("/api/comps/stats/{name}")
async def get_statistical_comps(
    name: str,
    nba_only: bool = False,
    limit: int = Query(15, ge=1, le=50),
):
    """Statistical comparisons for a player."""
    canonical, _ = find_player(name)
    if canonical is None:
        raise HTTPException(404, f"Player '{name}' not found")

    comps = get_stat_comps()
    entry = comps.get(canonical, {})
    comp_list = entry.get("c", [])

    if nba_only:
        comp_list = [c for c in comp_list if c.get("nba")]

    # Enrich comp data with profile info
    # s = Euclidean distance in percentile space; observed range [0.635, 1.716]
    # → normalize to 0–100% similarity: sim = (1.716 - s) / 1.081 * 100
    _S_MAX, _S_RANGE = 1.716, 1.081
    profiles = get_profiles()
    enriched = []
    for c in comp_list[:limit]:
        cname = c.get("n", "")
        cp = profiles.get(cname, {})
        raw_s = c.get("s", _S_MAX)
        similarity = max(0, min(100, round((_S_MAX - raw_s) / _S_RANGE * 100)))
        enriched.append({
            "name": cname,
            # Profile pos is authoritative; comp p-field is a fallback
            "position": cp.get("pos") or c.get("p") or "",
            "similarity": similarity,
            "made_nba": c.get("nba", False) or bool(cp.get("made_nba")),
            "tier": cp.get("v2Tier") or c.get("tier") or cp.get("tier") or "",
            # Key stats from profile for comparison table
            "bpm": cp.get("bpm"),
            "usg": cp.get("usg"),
            "ts": cp.get("ts"),
            "ast_p": cp.get("ast_p"),
            "to_p": cp.get("to_p"),
            "orb_p": cp.get("orb_p"),
            "drb_p": cp.get("drb_p"),
            "blk_p": cp.get("blk_p"),
            "stl_p": cp.get("stl_p"),
            "ftr": cp.get("ftr"),
            "rim_pct": cp.get("rim_pct"),
            "mid_pct": cp.get("mid_pct"),
            "tp_pct": cp.get("tp_pct"),
            "ft_pct": cp.get("ft_pct"),
            "dunk_r": cp.get("dunk_r"),
            "three_par": cp.get("three_par"),
            "min": cp.get("min"),
            "overall": cp.get("overall"),
            "height": cp.get("ht"),
            "badges": cp.get("badges", ""),
        })

    return {"player": canonical, "count": len(enriched), "comps": enriched}


@app.get("/api/comps/anthro/{name}")
async def get_anthro_comps(
    name: str,
    nba_only: bool = False,
    weight_adj: float = 0,
    wingspan_adj: float = 0,
    limit: int = Query(15, ge=1, le=50),
):
    """Anthropometric comparisons with optional weight/wingspan adjustment."""
    canonical, profile = find_player(name)
    if canonical is None:
        raise HTTPException(404, f"Player '{name}' not found")

    comps = get_anthro_comps()
    entry = comps.get(canonical, {})
    comp_list = entry.get("c", [])
    measurements = entry.get("m", {})

    # Normalize measurements: combine_* keys → height/weight/wingspan
    m_ht = measurements.get("height") or measurements.get("combine_hgt_no_shoes") or profile.get("ht")
    m_wt = measurements.get("weight") or measurements.get("combine_wgt") or profile.get("wt")
    m_ws = measurements.get("wingspan") or measurements.get("combine_wngspn")
    m_ws_delta = measurements.get("combine_wingspan_delta") or measurements.get("wingspan_delta")

    # Live-search fallback: if no pre-computed comps (e.g. 2026 prospects without combine data),
    # search the entire anthro_comps database using estimated target measurements.
    # Only players in anthro_comps have actual NBA combine measurements (height/weight/wingspan),
    # making them the only valid basis for physical comparison.
    if not comp_list:
        base_ht = m_ht or 78
        # Estimate weight from position/height when unmeasured
        pos = profile.get("pos", "Wing")
        htM = base_ht * 0.0254  # inches → meters
        pos_bmi = 23.5 if pos == "Playmaker" else 26.5 if pos == "Big" else 24.8
        est_wt = round(pos_bmi * htM * htM * 2.205)  # BMI → lbs
        base_wt = est_wt + weight_adj
        # Estimate wingspan via position ape index
        ape = 1.04 if pos == "Playmaker" else 1.06 if pos == "Big" else 1.05
        base_ws = round(base_ht * ape, 1) + wingspan_adj

        all_anthro = get_anthro_comps()
        all_profs = get_profiles()  # Load once outside loop
        # Build NBA player set from pre-computed comps (ground truth from NBA outcome data)
        nba_set = {c.get("n", "") for entry in all_anthro.values() for c in entry.get("c", []) if c.get("nba")}
        live = []
        for pname, pentry in all_anthro.items():
            if pname == canonical:
                continue
            pm = pentry.get("m", {})
            pht = pm.get("combine_hgt_no_shoes") or pm.get("height")
            pwt = pm.get("combine_wgt") or pm.get("weight")
            pws = pm.get("combine_wngspn") or pm.get("wingspan")
            if not pht:  # Must have at least height measurement
                continue
            pp = all_profs.get(pname, {})
            ht_d = abs(pht - base_ht)
            wt_d = abs((pwt or base_wt) - base_wt) * 0.5
            ws_d = abs((pws or base_ws) - base_ws) * 1.5
            dist = (ht_d**2 + wt_d**2 + ws_d**2) ** 0.5
            live.append({
                "n": pname, "_dist": dist,
                "nba": pname in nba_set,
                "tier": pp.get("v2Tier") or pp.get("tier") or "",
                "ht": pht, "wt": pwt, "ws": pws,
            })
        live.sort(key=lambda c: c["_dist"])
        comp_list = live[:50]  # Keep top 50 so nba_only filter still has enough candidates

    if nba_only:
        comp_list = [c for c in comp_list if c.get("nba")]

    # If adjustments on pre-computed comps (live comps already used adjusted base), recalculate
    if weight_adj != 0 or wingspan_adj != 0 and measurements:
        base_ht = m_ht or 78
        base_wt = (m_wt or 200) + weight_adj
        base_ws = (m_ws or 0) + wingspan_adj
        for c in comp_list:
            ht_d = abs((c.get("ht") or base_ht) - base_ht)
            wt_d = abs((c.get("wt") or base_wt) - base_wt) * 0.5
            ws_d = abs((c.get("ws") or base_ws) - base_ws) * 1.5
            c["_dist"] = (ht_d**2 + wt_d**2 + ws_d**2) ** 0.5
        comp_list.sort(key=lambda c: c.get("_dist", 999))

    # Enrich comp measurements from profiles; normalize field names
    # d = Euclidean distance in inch-space; range [0, ~5.6], typical best < 2.0
    # → similarity: linear 0–3" → 100%–0%
    profiles = get_profiles()
    enriched_anthro = []
    for c in comp_list[:limit]:
        cname = c.get("n", "")
        cp = profiles.get(cname, {})
        dist = c.get("_dist", c.get("d", 0)) or 0
        sim = max(0, min(100, round((3.0 - dist) / 3.0 * 100)))
        enriched_anthro.append({
            "name": cname,
            "distance": round(dist, 3),
            "similarity": sim,
            "made_nba": bool(c.get("nba", False)),
            "tier": c.get("tier", cp.get("v2Tier", cp.get("tier", ""))),
            # Measurements: prefer comp-stored values, fall back to profile
            "height": c.get("ht") or cp.get("ht"),
            "weight": c.get("wt") or cp.get("wt"),
            "wingspan": c.get("ws") or cp.get("ws"),
        })

    return {
        "player": canonical,
        "measurements": {
            "height": m_ht,
            "weight": m_wt,
            "wingspan": m_ws,
            "wingspan_delta": m_ws_delta,
        },
        "adjustments": {"weight": weight_adj, "wingspan": wingspan_adj},
        "count": len(enriched_anthro),
        "comps": enriched_anthro,
    }


@app.get("/api/tiers/{name}")
async def get_tiers(name: str):
    """Tier probability distribution."""
    canonical, profile = find_player(name)
    if canonical is None:
        raise HTTPException(404, f"Player '{name}' not found")

    return {
        "player": canonical,
        "pred_mu": profile.get("pred_mu"),
        "pred_sigma": profile.get("pred_sigma"),
        "pred_p_nba": profile.get("pred_p_nba"),
        "pred_tier": profile.get("pred_tier"),
        "tiers": {
            "Superstar": profile.get("prob_super"),
            "All-Star": profile.get("prob_allstar"),
            "Starter": profile.get("prob_starter"),
            "Role Player": profile.get("prob_role"),
            "Replacement": profile.get("prob_repl"),
            "Negative": profile.get("prob_neg"),
        },
        "actual": {
            "made_nba": profile.get("made_nba"),
            "tier": profile.get("tier"),
            "peak_pie": profile.get("peak_pie"),
        },
    }


@app.get("/api/years")
async def get_years():
    """Available draft years, sorted descending. Returns latest year for default view."""
    years = _get_years()
    return {
        "years": years,
        "latest": years[0] if years else 2026,
    }


@app.get("/api/board")
async def get_board(
    n: int = Query(500, ge=1, le=2000),
    year: Optional[int] = None,
    position: Optional[str] = None,
):
    """
    Big Board: top N players sorted by ppWA (or pred_mu fallback).
    Returns rich profile data so the frontend does NOT need a second fetch.
    """
    profiles = get_profiles()
    results = []

    for name, p in profiles.items():
        # Year filter
        if year and p.get("yr") != year:
            continue
        # Position filter
        if position and p.get("pos") != position:
            continue
        # Skip very-low-confidence entries
        if p.get("confidence") == "very_low":
            continue
        # Age filter: exclude non-prospects (age > 24.5 at time of draft)
        # Catches 28-34 year-old veterans erroneously included in prospect lists
        age = p.get("age")
        if age is not None and age > 24.5:
            continue

        # Build lightweight-but-rich board entry from selected fields
        entry = {"name": name}
        for field in _BOARD_FIELDS:
            if field == "name":
                continue
            val = p.get(field)
            if val is not None:
                entry[field] = val

        results.append(entry)

    # Sort by ppWA → pred_mu → pred_p_nba
    results.sort(key=lambda x: (
        -(x.get("ppwa") or x.get("pred_mu") or 0),
    ))

    return {
        "year": year,
        "count": min(len(results), n),
        "players": results[:n],
    }


@app.get("/api/players/top")
async def top_players(
    n: int = Query(50, ge=1, le=500),
    year: Optional[int] = None,
    position: Optional[str] = None,
    nba_only: bool = False,
):
    """Top N players by ppWA (Projected Peak Wins Added)."""
    profiles = get_profiles()
    candidates = []
    for entry in get_search_index():
        if nba_only and not entry.get("nba"):
            continue
        if position and entry.get("p") != position:
            continue
        if year and entry.get("y") != year:
            continue
        p = profiles.get(entry.get("n"), {})
        candidates.append({
            "name": entry.get("n"),
            "team": entry.get("t"),
            "position": entry.get("p"),
            "year": entry.get("y"),
            "made_nba": entry.get("nba"),
            "tier": p.get("v2Tier") or entry.get("tier"),
            "ppwa": p.get("ppwa"),
            "pElite": p.get("pElite"),
            "pred_mu": entry.get("mu"),
            "pred_p_nba": entry.get("pn"),
        })
    # ppWA as primary sort (fallback: pred_mu)
    candidates.sort(key=lambda x: (-(x.get("ppwa") or x.get("pred_mu") or 0)))
    return {"count": min(len(candidates), n), "players": candidates[:n]}


@app.get("/api/players/draft/{year}")
async def draft_class(year: int):
    """All players from a specific draft year."""
    profiles = get_profiles()
    results = []
    for entry in get_search_index():
        if entry.get("y") == year:
            p = profiles.get(entry.get("n"), {})
            results.append({
                "name": entry.get("n"),
                "team": entry.get("t"),
                "position": entry.get("p"),
                "made_nba": entry.get("nba"),
                "tier": p.get("v2Tier") or entry.get("tier"),
                "ppwa": p.get("ppwa"),
                "pred_mu": entry.get("mu"),
                "pred_p_nba": entry.get("pn"),
            })
    results.sort(key=lambda x: (-(x.get("ppwa") or x.get("pred_mu") or 0)))
    return {"year": year, "count": len(results), "players": results}


# ═══════════════════════════════════════════════════════════
# STATIC FILES (if frontend built to frontend/dist)
# ═══════════════════════════════════════════════════════════

frontend_dist = Path("frontend/dist")
if frontend_dist.exists():
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = frontend_dist / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(frontend_dist / "index.html")
