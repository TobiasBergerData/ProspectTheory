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
    version="2.0.0",
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


# Fields returned by /api/board per player — rich enough so front-end
# does NOT need a second fetch for the board-visible columns.
_BOARD_FIELDS = [
    "name", "pos", "team", "yr", "source", "made_nba", "tier", "actual",
    "age", "conf_tier", "conf", "ht", "wt", "wingspan",
    # ppWA model v2
    "ppwa", "pElite", "waFloor", "waCeiling", "waSigma",
    "v2Tier", "v2TierProbs", "v2Conf", "posGroup",
    # Legacy prediction fields (fallback)
    "pred_mu", "pred_sigma", "pred_p_nba", "pred_tier",
    # Tier probabilities
    "prob_super", "prob_allstar", "prob_starter", "prob_role", "prob_repl", "prob_neg",
    # Stats needed for pReady check and overview tab
    "pctl_overall", "pctl", "bpm", "usg", "ts", "pts", "ast", "reb",
    "ast_p", "to_p", "orb_p", "drb_p", "stl_p", "blk_p", "ftr",
    "feel", "func_ath", "shoot_score", "def_score", "overall",
    "self_creation", "creation_score",
    "proj_3p", "proj_3pa", "proj_3par", "proj_ts", "proj_prior",
    "archetype", "archetypes_all",
    "career_path", "confidence", "ups",
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
    return {"name": "ProspectTheory API", "version": "1.0.0"}


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
    profiles = get_profiles()
    enriched = []
    for c in comp_list[:limit]:
        cname = c.get("n", "")
        cp = profiles.get(cname, {})
        enriched.append({
            "name": cname,
            "position": c.get("p", cp.get("pos", "")),
            "similarity": c.get("s", 0),
            "made_nba": c.get("nba", False),
            "tier": c.get("tier", cp.get("tier", "")),
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

    if nba_only:
        comp_list = [c for c in comp_list if c.get("nba")]

    # If adjustments, recalculate distances
    if weight_adj != 0 or wingspan_adj != 0:
        base_wt = (measurements.get("weight") or profile.get("wt") or 200) + weight_adj
        base_ws = (measurements.get("wingspan") or 0) + wingspan_adj
        base_ht = measurements.get("height") or profile.get("ht") or 78

        for c in comp_list:
            ht_d = abs((c.get("ht") or base_ht) - base_ht)
            wt_d = abs((c.get("wt") or base_wt) - base_wt) * 0.5
            ws_d = abs((c.get("ws") or base_ws) - base_ws) * 1.5
            c["_dist"] = (ht_d**2 + wt_d**2 + ws_d**2) ** 0.5

        comp_list.sort(key=lambda c: c.get("_dist", 999))

    return {
        "player": canonical,
        "measurements": measurements,
        "adjustments": {"weight": weight_adj, "wingspan": wingspan_adj},
        "count": min(len(comp_list), limit),
        "comps": comp_list[:limit],
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
