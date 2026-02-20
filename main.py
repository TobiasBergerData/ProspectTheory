"""
ProspectTheory API — FastAPI backend serving precomputed player data.

Uses compressed api_*.json files from Script 11.

Endpoints:
  GET /api/players/search?q=name       → Search players by name
  GET /api/player/{name}               → Full player profile
  GET /api/comps/stats/{name}          → Statistical comparisons
  GET /api/comps/anthro/{name}         → Anthropometric comparisons
  GET /api/tiers/{name}                → Tier probabilities
  GET /api/players/top?n=50            → Top N by predicted PIE
  GET /api/players/draft/{year}        → All players from a draft year

Run:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
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
    version="1.0.0",
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


def load_json(filepath: Path):
    """Load a JSON file, return empty dict/list if missing."""
    if not filepath.exists():
        print(f"⚠️  Not found: {filepath}")
        return {}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


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


def _load_anthro_comps() -> dict:
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
    return {
        "status": "ok",
        "profiles": len(get_profiles()),
        "stat_comps": len(get_stat_comps()),
        "anthro_comps": len(_load_anthro_comps()),
        "search_index": len(get_search_index()),
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
            "blk_p": cp.get("blk_p"),
            "stl_p": cp.get("stl_p"),
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

    comps = _load_anthro_comps()
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


@app.get("/api/players/top")
async def top_players(
    n: int = Query(50, ge=1, le=500),
    year: Optional[int] = None,
    position: Optional[str] = None,
    nba_only: bool = False,
):
    """Top N players by predicted PIE."""
    results = []
    for entry in get_search_index():
        if nba_only and not entry.get("nba"):
            continue
        if position and entry.get("p") != position:
            continue
        if year and entry.get("y") != year:
            continue
        results.append({
            "name": entry.get("n"),
            "team": entry.get("t"),
            "position": entry.get("p"),
            "year": entry.get("y"),
            "made_nba": entry.get("nba"),
            "tier": entry.get("tier"),
            "pred_mu": entry.get("mu"),
            "pred_p_nba": entry.get("pn"),
        })
        if len(results) >= n:
            break
    return {"count": len(results), "players": results}


@app.get("/api/board")
async def board(
    n: int = Query(200, ge=1, le=1000),
    year: Optional[int] = None,
    position: Optional[str] = None,
):
    """
    BigBoard data — returns summary fields for top N prospects.
    Sorted by ceiling (desc), then overall (desc).
    Returns ~2KB per player → 200 players ≈ 400KB.
    """
    profiles = get_profiles()
    items = []

    for name, p in profiles.items():
        if year and p.get("yr") != year:
            continue
        if position and p.get("pos") != position:
            continue
        # Skip very_low confidence (insufficient data)
        if p.get("confidence") == "very_low":
            continue
        items.append((name, p))

    # Sort by ceiling desc, then overall desc
    items.sort(key=lambda x: (-(x[1].get("ceiling") or 0), -(x[1].get("overall") or 0)))
    items = items[:n]

    results = []
    for name, p in items:
        results.append({
            "name": name,
            "team": p.get("team", ""),
            "pos": p.get("pos", ""),
            "yr": p.get("yr"),
            "cls": p.get("cls", ""),
            "conf": p.get("conf", ""),
            "conf_tier": p.get("conf_tier", ""),
            "ht": p.get("ht"),
            "age": p.get("age"),
            "recRank": p.get("recRank"),
            "overall": p.get("overall"),
            "floor": p.get("floor"),
            "ceiling": p.get("ceiling"),
            "risk": p.get("risk"),
            "safe_bet": p.get("safe_bet"),
            "feel": p.get("feel"),
            "func_ath": p.get("func_ath"),
            "shoot_score": p.get("shoot_score"),
            "def_score": p.get("def_score"),
            "mu": p.get("pred_mu"),
            "pNba": p.get("pred_p_nba"),
            "pred_tier": p.get("pred_tier"),
            "badges": p.get("badges", ""),
            "red_flags": p.get("red_flags", ""),
            "bpm": p.get("bpm"),
            "confidence": p.get("confidence", "full"),
            "sample_min": p.get("sample_min"),
            "made_nba": p.get("made_nba", 0),
            "tier": p.get("tier", ""),
            "peak_pie": p.get("peak_pie"),
        })

    return {"count": len(results), "players": results}


@app.get("/api/players/draft/{year}")
async def draft_class(year: int):
    """All players from a specific draft year."""
    results = []
    for entry in get_search_index():
        if entry.get("y") == year:
            results.append({
                "name": entry.get("n"),
                "team": entry.get("t"),
                "position": entry.get("p"),
                "made_nba": entry.get("nba"),
                "tier": entry.get("tier"),
                "pred_mu": entry.get("mu"),
                "pred_p_nba": entry.get("pn"),
            })
    results.sort(key=lambda x: (-(x.get("pred_p_nba") or 0), -(x.get("pred_mu") or 0)))
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
