"""
ProspectTheory API — FastAPI backend serving precomputed player data.

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

Deploy:
  Render.com free tier — auto-deploy from GitHub
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

# CORS — allow frontend origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "https://prospecttheory.io",
        "https://www.prospecttheory.io",
        "https://*.github.io",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ═══════════════════════════════════════════════════════════
# DATA LOADING
# ═══════════════════════════════════════════════════════════

DATA_DIR = Path(os.getenv("DATA_DIR", "data/processed"))

# Lazy-loaded data stores
_profiles = None
_stat_comps = None
_anthro_comps = None
_search_index = None


def load_json(filepath: Path) -> dict:
    """Load a JSON file, return empty dict if missing."""
    if not filepath.exists():
        print(f"⚠️  Data file not found: {filepath}")
        return {}
    with open(filepath, "r", encoding="utf-8") as f:
        return json.load(f)


def get_profiles() -> dict:
    global _profiles
    if _profiles is None:
        print("Loading player profiles...")
        _profiles = load_json(DATA_DIR / "comparison_profiles.json")
        print(f"  Loaded {len(_profiles)} profiles")
    return _profiles


def get_stat_comps() -> dict:
    global _stat_comps
    if _stat_comps is None:
        print("Loading statistical comparisons...")
        _stat_comps = load_json(DATA_DIR / "comparison_statistical.json")
        print(f"  Loaded {len(_stat_comps)} stat comp entries")
    return _stat_comps


def get_anthro_comps() -> dict:
    global _anthro_comps
    if _anthro_comps is None:
        print("Loading anthropometric comparisons...")
        _anthro_comps = load_json(DATA_DIR / "comparison_anthropometric.json")
        print(f"  Loaded {len(_anthro_comps)} anthro comp entries")
    return _anthro_comps


def get_search_index() -> list:
    """Build a lightweight search index from profiles."""
    global _search_index
    if _search_index is None:
        profiles = get_profiles()
        _search_index = []
        for name, p in profiles.items():
            _search_index.append({
                "name": name,
                "name_lower": name.lower(),
                "team": p.get("college_team", ""),
                "position": p.get("position", ""),
                "year": p.get("season_year"),
                "made_nba": p.get("made_nba", False),
                "tier": p.get("tier_name", ""),
                "pred_mu": p.get("pred_mu_pie"),
                "pred_p_nba": p.get("pred_p_nba"),
            })
        # Sort by predicted PIE descending (NBA players first)
        _search_index.sort(
            key=lambda x: (
                -(x.get("pred_p_nba") or 0),
                -(x.get("pred_mu") or 0),
            )
        )
        print(f"  Search index built: {len(_search_index)} players")
    return _search_index


# ═══════════════════════════════════════════════════════════
# API ENDPOINTS
# ═══════════════════════════════════════════════════════════

@app.get("/")
def root():
    return {
        "name": "ProspectTheory API",
        "version": "1.0.0",
        "endpoints": [
            "/api/players/search?q=curry",
            "/api/player/{name}",
            "/api/comps/stats/{name}",
            "/api/comps/anthro/{name}",
            "/api/tiers/{name}",
            "/api/players/top?n=50",
            "/api/players/draft/2024",
        ],
    }


@app.get("/api/players/search")
def search_players(
    q: str = Query("", description="Search query (player name)"),
    limit: int = Query(20, ge=1, le=100),
    nba_only: bool = Query(False),
    position: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
):
    """Search players by name with optional filters."""
    index = get_search_index()
    q_lower = q.lower().strip()

    results = []
    for entry in index:
        if q_lower and q_lower not in entry["name_lower"]:
            continue
        if nba_only and not entry["made_nba"]:
            continue
        if position and entry["position"] != position:
            continue
        if year and entry.get("year") != year:
            continue
        results.append(entry)
        if len(results) >= limit:
            break

    return {"query": q, "count": len(results), "results": results}


@app.get("/api/player/{name}")
def get_player(name: str):
    """Get full player profile by exact name."""
    profiles = get_profiles()

    # Try exact match first
    if name in profiles:
        return {"name": name, "profile": profiles[name]}

    # Try case-insensitive match
    name_lower = name.lower()
    for key, profile in profiles.items():
        if key.lower() == name_lower:
            return {"name": key, "profile": profile}

    raise HTTPException(status_code=404, detail=f"Player '{name}' not found")


@app.get("/api/comps/stats/{name}")
def get_stat_comps_for_player(
    name: str,
    nba_only: bool = Query(False),
    limit: int = Query(10, ge=1, le=50),
):
    """Get statistical comparison players."""
    comps = get_stat_comps()

    # Find player (case-insensitive)
    entry = None
    for key, val in comps.items():
        if key.lower() == name.lower():
            entry = val
            name = key
            break

    if entry is None:
        raise HTTPException(status_code=404, detail=f"No statistical comps for '{name}'")

    comp_list = entry.get("comps", [])
    if nba_only:
        comp_list = [c for c in comp_list if c.get("made_nba")]

    return {
        "name": name,
        "position": entry.get("position"),
        "profile": entry.get("profile"),
        "comps": comp_list[:limit],
    }


@app.get("/api/comps/anthro/{name}")
def get_anthro_comps_for_player(
    name: str,
    nba_only: bool = Query(False),
    limit: int = Query(10, ge=1, le=50),
    height_adj: float = Query(0, description="Height adjustment in inches"),
    weight_adj: float = Query(0, description="Weight adjustment in lbs"),
    wingspan_adj: float = Query(0, description="Wingspan adjustment in inches"),
):
    """
    Get anthropometric comparison players.
    Supports dynamic slider adjustments via query params.
    """
    comps = get_anthro_comps()

    entry = None
    for key, val in comps.items():
        if key.lower() == name.lower():
            entry = val
            name = key
            break

    if entry is None:
        raise HTTPException(status_code=404, detail=f"No anthropometric comps for '{name}'")

    comp_list = entry.get("comps", [])
    if nba_only:
        comp_list = [c for c in comp_list if c.get("made_nba")]

    # If adjustments are provided, we could re-rank here
    # (For now, return precomputed; dynamic re-ranking is a Phase 2 feature)
    result = {
        "name": name,
        "measurements": entry.get("measurements"),
        "adjustments": {"height": height_adj, "weight": weight_adj, "wingspan": wingspan_adj},
        "comps": comp_list[:limit],
    }

    return result


@app.get("/api/tiers/{name}")
def get_tier_prediction(name: str):
    """Get tier probability distribution for a player."""
    profiles = get_profiles()

    profile = None
    for key, val in profiles.items():
        if key.lower() == name.lower():
            profile = val
            name = key
            break

    if profile is None:
        raise HTTPException(status_code=404, detail=f"Player '{name}' not found")

    tier_cols = {
        "Superstar": profile.get("prob_superstar"),
        "All-Star": profile.get("prob_allstar"),
        "Starter": profile.get("prob_starter"),
        "Role Player": profile.get("prob_roleplayer"),
        "Replacement": profile.get("prob_replacement"),
        "Negative": profile.get("prob_negative"),
        "Never NBA": profile.get("prob_never_nba"),
    }

    return {
        "name": name,
        "pred_mu_pie": profile.get("pred_mu_pie"),
        "pred_sigma": profile.get("pred_sigma"),
        "pred_p_nba": profile.get("pred_p_nba"),
        "predicted_best_tier": profile.get("predicted_best_tier"),
        "actual_tier": profile.get("tier_name"),
        "tiers": tier_cols,
    }


@app.get("/api/players/top")
def get_top_players(
    n: int = Query(50, ge=1, le=500),
    year: Optional[int] = Query(None),
    position: Optional[str] = Query(None),
    nba_only: bool = Query(False),
):
    """Get top N players by predicted PIE (μ)."""
    index = get_search_index()

    results = []
    for entry in index:
        if nba_only and not entry["made_nba"]:
            continue
        if position and entry["position"] != position:
            continue
        if year and entry.get("year") != year:
            continue
        if entry.get("pred_mu") is None:
            continue
        results.append(entry)

    # Sort by predicted PIE
    results.sort(key=lambda x: -(x.get("pred_mu") or 0))
    return {"count": len(results[:n]), "players": results[:n]}


@app.get("/api/players/draft/{year}")
def get_draft_class(year: int, position: Optional[str] = Query(None)):
    """Get all players from a specific draft year."""
    index = get_search_index()

    results = [
        e for e in index
        if e.get("year") == year
        and (position is None or e["position"] == position)
    ]

    results.sort(key=lambda x: -(x.get("pred_mu") or 0))
    return {"year": year, "count": len(results), "players": results}


# ═══════════════════════════════════════════════════════════
# HEALTH CHECK
# ═══════════════════════════════════════════════════════════

@app.get("/health")
def health_check():
    profiles = get_profiles()
    stats = get_stat_comps()
    anthro = get_anthro_comps()
    return {
        "status": "healthy",
        "data": {
            "profiles": len(profiles),
            "stat_comps": len(stats),
            "anthro_comps": len(anthro),
        },
    }


# ═══════════════════════════════════════════════════════════
# OPTIONAL: Serve static frontend files
# ═══════════════════════════════════════════════════════════

FRONTEND_DIR = Path("frontend/dist")
if FRONTEND_DIR.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
