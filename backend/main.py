"""
ProspectTheory API v3.0 — FastAPI backend serving precomputed player data.

Uses compressed api_*.json files from Script 11 (v3 canonical identity schema).

Identity model:
  • Every record keyed by `player_id` (stable, collision-free).
  • URL-safe `slug` for routing (unique per player_id).
  • `name` kept as display text; `name_lower` for case-insensitive search.

Endpoints:
  GET /api/years                         → Available draft years
  GET /api/board?n=500&year=2026         → Big Board (sorted by ppWA)
  GET /api/players/search?q=name         → Search by name / slug / player_id
  GET /api/player/{slug}                 → Full player profile by slug
  GET /api/comps/stats/{slug}            → Statistical comparisons
  GET /api/comps/anthro/{slug}           → Anthropometric comparisons
  GET /api/tiers/{slug}                  → Tier probabilities
  GET /api/players/top?n=50              → Top N by ppWA
  GET /api/players/draft/{year}          → All players from a draft year

All `{slug}` path parameters also accept a player_id (bt:…, rg:…) or a
display name for backwards compatibility. The response always carries
`player_id`, `slug`, and `name` so the frontend can pick the canonical form.

Run:
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"""
import gzip
import json
import os
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# ═══════════════════════════════════════════════════════════
# APP CONFIG
# ═══════════════════════════════════════════════════════════

app = FastAPI(
    title="ProspectTheory API",
    description="NBA Draft Intelligence — Player profiles, comparisons, and tier predictions",
    version="3.0.0",  # canonical identity: player_id PK + slug routing (collision-safe)
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

# GZip compression for all responses (minimum size 500 bytes)
app.add_middleware(GZipMiddleware, minimum_size=500)

# ═══════════════════════════════════════════════════════════
# DATA LOADING (compressed api_*.json from Script 11)
# ═══════════════════════════════════════════════════════════

DATA_DIR = Path(os.getenv("DATA_DIR", "data/processed"))

_profiles = None
_stat_comps = None
_anthro_comps = None
_search_index = None
_years_cache = None   # sorted list of unique draft years

# Identity indexes — built lazily on first profile-load. All lookups go
# through these so we never scan the profiles dict by name.
_slug_to_pid: dict = None    # {slug: player_id}
_name_to_pid: dict = None    # {name_lower: player_id}   — first-match wins (collisions will pick most-recent)
_pid_to_slug: dict = None    # {player_id: slug}


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
    # ppWA model v2 + Pfad-3-Output (war ist der primaere Wert, ppwa optional/legacy)
    "war", "ppwa", "pElite", "waFloor", "waCeiling", "waSigma",
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
    # 10e: Sekundaeres Intl-Tier-Modell (Board-Spalte + Player-Page-Block)
    "intl_tier",
    "p_intl_eu_impact", "p_intl_eu", "p_intl_top_eu",
    "p_intl_pro", "p_intl_fringe",
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
    """
    api_profiles.json is keyed by player_id (11_compress v3). On first
    load we materialize three lookup tables:
      _slug_to_pid — URL routing
      _name_to_pid — legacy name-based URLs / search fallbacks
      _pid_to_slug — reverse lookup for response enrichment
    """
    global _profiles, _slug_to_pid, _name_to_pid, _pid_to_slug
    if _profiles is None:
        print("Loading profiles...")
        _profiles = load_json(DATA_DIR / "api_profiles.json")
        _slug_to_pid, _name_to_pid, _pid_to_slug = {}, {}, {}
        legacy_keys = 0
        for key, p in _profiles.items():
            pid = p.get("player_id") or (key if ":" in key else None)
            slug = p.get("slug")
            name = p.get("name") or (key if ":" not in key else "")
            if not pid:
                legacy_keys += 1
                continue
            if slug:
                _slug_to_pid[slug] = pid
                _pid_to_slug[pid] = slug
            if name:
                nl = name.strip().lower()
                # Keep the first binding; collisions (two "Cameron Boozer") keep
                # the earliest inserted profile's pid — frontend should prefer
                # slug-based routing to avoid this.
                _name_to_pid.setdefault(nl, pid)
        print(f"  → {len(_profiles):,} profiles, "
              f"{len(_slug_to_pid):,} slugs, {len(_name_to_pid):,} name bindings"
              f"{f' ({legacy_keys} legacy keys without pid)' if legacy_keys else ''}")
    return _profiles


def _ensure_indexes():
    """Force-build the identity indexes if they haven't been yet."""
    if _slug_to_pid is None:
        get_profiles()


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


def find_player(ident: str) -> tuple:
    """
    Resolve a path parameter to a player profile. Accepts (in priority order):
      1. player_id     (bt:134971, rg:54148, rg_name:…)
      2. slug          (cameron-boozer, luka-doncic-real-madrid-18)
      3. display name  (Cameron Boozer)

    Returns (player_id, profile) or (None, None) if no match.

    The returned profile always carries `player_id`, `slug`, and `name`
    fields — the caller decides which to surface to clients.
    """
    if not ident:
        return None, None

    profiles = get_profiles()

    # 1) direct player_id lookup (fast path, handles URL-encoded colons)
    pid_candidate = ident.replace("%3A", ":")
    if pid_candidate in profiles:
        return pid_candidate, profiles[pid_candidate]

    # 2) slug lookup (URL-safe, canonical routing)
    pid = _slug_to_pid.get(ident)
    if pid and pid in profiles:
        return pid, profiles[pid]

    # 3) case-insensitive name lookup (legacy URLs)
    nl = ident.strip().lower()
    pid = _name_to_pid.get(nl)
    if pid and pid in profiles:
        return pid, profiles[pid]

    return None, None


def _identity_fields(pid: str, profile: dict) -> dict:
    """
    Public identity triple for API responses — always include all three so
    the client doesn't need a second round-trip to discover a canonical URL.
    """
    return {
        "player_id": pid,
        "slug": profile.get("slug") or _pid_to_slug.get(pid),
        "name": profile.get("name"),
    }


# ═══════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════

@app.on_event("startup")
async def announce_startup():
    """
    KEIN data-loading hier. Der vorige startup-handler hat _ensure_indexes()
    aufgerufen, was den 103-MB-JSON synchron lud — auf Render Free Tier
    (0.1 vCPU) dauert das 30-90 Sekunden, wodurch uvicorn den HTTP-Port erst
    NACH dem Load bindet. Renders Port-Scan-Timeout liegt bei ~60 Sekunden,
    daher 'no open ports detected'.
    Profile-Daten werden jetzt lazy beim ersten Request geladen
    (siehe get_profiles()). Erste Anfrage dauert ~60 Sekunden, alle weiteren
    sind schnell (Memory-Cache via globals).
    """
    print("🚀 ProspectTheory API gestartet — Profile werden lazy beim ersten Request geladen.")


@app.get("/")
async def root():
    return {"name": "ProspectTheory API", "version": app.version}


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
    _ensure_indexes()
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
        pid = entry.get("id") or _name_to_pid.get(name.lower())
        results.append({
            "player_id": pid,
            "slug": entry.get("slug") or (_pid_to_slug.get(pid) if pid else None),
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


@app.get("/api/player/{slug}")
async def get_player(slug: str):
    """
    Full player profile. `slug` accepts a slug, player_id, or display name
    (in that priority). Response includes identity triple so the client
    can adopt the canonical slug-based URL.
    """
    pid, profile = find_player(slug)
    if profile is None:
        raise HTTPException(404, f"Player '{slug}' not found")
    return {**_identity_fields(pid, profile), "profile": profile}


def _lookup_comp_profile(c: dict) -> tuple:
    """
    Resolve an inner comp entry to its (player_id, profile). Comps emitted
    by 11_compress v3 carry `id` + `slug`; legacy comps only have `n`.
    """
    profiles = get_profiles()
    pid = c.get("id")
    if pid and pid in profiles:
        return pid, profiles[pid]
    # Legacy fallback: name-based lookup via our index
    name = c.get("n", "")
    if name:
        fallback_pid = _name_to_pid.get(name.lower())
        if fallback_pid and fallback_pid in profiles:
            return fallback_pid, profiles[fallback_pid]
    return None, {}


@app.get("/api/comps/stats/{slug}")
async def get_statistical_comps(
    slug: str,
    nba_only: bool = False,
    limit: int = Query(15, ge=1, le=50),
):
    """Statistical comparisons for a player (slug / player_id / name)."""
    pid, profile = find_player(slug)
    if pid is None:
        raise HTTPException(404, f"Player '{slug}' not found")

    comps = get_stat_comps()
    # Primary key: player_id (v3). Legacy fallback: lookup by display name.
    entry = comps.get(pid) or comps.get(profile.get("name", "")) or {}
    comp_list = entry.get("c", [])

    if nba_only:
        comp_list = [c for c in comp_list if c.get("nba")]

    # Enrich comp data with profile info
    # s = Euclidean distance in percentile space; observed range [0.635, 1.716]
    # → normalize to 0–100% similarity: sim = (1.716 - s) / 1.081 * 100
    _S_MAX, _S_RANGE = 1.716, 1.081
    enriched = []
    for c in comp_list[:limit]:
        c_pid, cp = _lookup_comp_profile(c)
        raw_s = c.get("s", _S_MAX)
        similarity = max(0, min(100, round((_S_MAX - raw_s) / _S_RANGE * 100)))
        enriched.append({
            "player_id": c_pid,
            "slug": c.get("slug") or (_pid_to_slug.get(c_pid) if c_pid else None),
            "name": c.get("n", ""),
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

    return {**_identity_fields(pid, profile), "count": len(enriched), "comps": enriched}


@app.get("/api/comps/anthro/{slug}")
async def get_anthro_comps(
    slug: str,
    nba_only: bool = False,
    weight_adj: float = 0,
    wingspan_adj: float = 0,
    limit: int = Query(15, ge=1, le=50),
):
    """Anthropometric comparisons with optional weight/wingspan adjustment."""
    pid, profile = find_player(slug)
    if pid is None:
        raise HTTPException(404, f"Player '{slug}' not found")

    canonical = profile.get("name", "")
    comps = get_anthro_comps()
    entry = comps.get(pid) or comps.get(canonical) or {}
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
        # Build NBA player set from pre-computed comps (ground truth).
        # Keys can be pid or name; we resolve both to player_id so the set is
        # collision-safe.
        nba_set = set()
        for _k, _e in all_anthro.items():
            for c in _e.get("c", []):
                if c.get("nba"):
                    cid = c.get("id") or _name_to_pid.get((c.get("n", "") or "").lower())
                    if cid:
                        nba_set.add(cid)
        live = []
        for pkey, pentry in all_anthro.items():
            # pkey is player_id in v3, display name in legacy
            ppid = pentry.get("player_id") or (pkey if ":" in pkey else
                                                _name_to_pid.get(pkey.lower()))
            if ppid == pid:
                continue
            pm = pentry.get("m", {})
            pht = pm.get("combine_hgt_no_shoes") or pm.get("height")
            pwt = pm.get("combine_wgt") or pm.get("weight")
            pws = pm.get("combine_wngspn") or pm.get("wingspan")
            if not pht:  # Must have at least height measurement
                continue
            pp = all_profs.get(ppid, {}) if ppid else {}
            pname_disp = pentry.get("name") or pp.get("name") or (pkey if ":" not in pkey else "")
            ht_d = abs(pht - base_ht)
            wt_d = abs((pwt or base_wt) - base_wt) * 0.5
            ws_d = abs((pws or base_ws) - base_ws) * 1.5
            dist = (ht_d**2 + wt_d**2 + ws_d**2) ** 0.5
            live.append({
                "id": ppid,
                "slug": pentry.get("slug") or (_pid_to_slug.get(ppid) if ppid else None),
                "n": pname_disp, "_dist": dist,
                "nba": ppid in nba_set,
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
    enriched_anthro = []
    for c in comp_list[:limit]:
        c_pid, cp = _lookup_comp_profile(c)
        dist = c.get("_dist", c.get("d", 0)) or 0
        sim = max(0, min(100, round((3.0 - dist) / 3.0 * 100)))
        enriched_anthro.append({
            "player_id": c_pid,
            "slug": c.get("slug") or (_pid_to_slug.get(c_pid) if c_pid else None),
            "name": c.get("n", ""),
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
        **_identity_fields(pid, profile),
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


@app.get("/api/tiers/{slug}")
async def get_tiers(slug: str):
    """Tier probability distribution."""
    pid, profile = find_player(slug)
    if pid is None:
        raise HTTPException(404, f"Player '{slug}' not found")

    return {
        **_identity_fields(pid, profile),
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
        "api_version": app.version,
    }


@app.get("/api/board")
async def get_board(
    response: Response,
    n: int = Query(200, ge=1, le=2000),
    year: Optional[int] = None,
    position: Optional[str] = None,
):
    """
    Big Board: top N players sorted by ppWA (or pred_mu fallback).
    Returns rich profile data so the frontend does NOT need a second fetch.
    Default n=200 (down from 500) — frontend shows ≤60, this covers all filter combos.
    """
    # Cache-Control: allow CDN/browser to cache for 10 min, serve stale for 1h while revalidating
    response.headers["Cache-Control"] = "public, max-age=600, stale-while-revalidate=3600"

    profiles = get_profiles()
    _ensure_indexes()
    results = []

    for pid, p in profiles.items():
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

        # Build lightweight-but-rich board entry, keyed by player_id + slug
        name = p.get("name") or ""
        entry = {
            "player_id": pid,
            "slug": p.get("slug") or _pid_to_slug.get(pid),
            "name": name,
        }
        for field in _BOARD_FIELDS:
            if field in ("name",):
                continue
            val = p.get(field)
            if val is not None:
                entry[field] = val

        results.append(entry)

    # Sort by ppWA → pred_mu → pred_p_nba
    results.sort(key=lambda x: (
        -(x.get("war") or x.get("ppwa") or x.get("pred_mu") or 0),
    ))

    return {
        "year": year,
        "count": min(len(results), n),
        "players": results[:n],
    }


def _entry_pid(entry: dict) -> str:
    """Resolve a search-index entry to its player_id (v3 has it, legacy doesn't)."""
    pid = entry.get("id")
    if pid:
        return pid
    name = entry.get("n", "")
    return _name_to_pid.get(name.lower()) if name else None


@app.get("/api/players/top")
async def top_players(
    n: int = Query(50, ge=1, le=500),
    year: Optional[int] = None,
    position: Optional[str] = None,
    nba_only: bool = False,
):
    """Top N players by ppWA (Projected Peak Wins Added)."""
    _ensure_indexes()
    profiles = get_profiles()
    candidates = []
    for entry in get_search_index():
        if nba_only and not entry.get("nba"):
            continue
        if position and entry.get("p") != position:
            continue
        if year and entry.get("y") != year:
            continue
        pid = _entry_pid(entry)
        p = profiles.get(pid, {}) if pid else {}
        candidates.append({
            "player_id": pid,
            "slug": entry.get("slug") or (_pid_to_slug.get(pid) if pid else None),
            "name": entry.get("n"),
            "team": entry.get("t"),
            "position": entry.get("p"),
            "year": entry.get("y"),
            "made_nba": entry.get("nba"),
            "tier": p.get("v2Tier") or entry.get("tier"),
            "war": p.get("war"),
            "ppwa": p.get("ppwa"),
            "pElite": p.get("pElite"),
            "pred_mu": entry.get("mu"),
            "pred_p_nba": entry.get("pn"),
        })
    # ppWA as primary sort (fallback: pred_mu)
    candidates.sort(key=lambda x: (-(x.get("war") or x.get("ppwa") or x.get("pred_mu") or 0)))
    return {"count": min(len(candidates), n), "players": candidates[:n]}


@app.get("/api/players/draft/{year}")
async def draft_class(year: int):
    """All players from a specific draft year."""
    _ensure_indexes()
    profiles = get_profiles()
    results = []
    for entry in get_search_index():
        if entry.get("y") == year:
            pid = _entry_pid(entry)
            p = profiles.get(pid, {}) if pid else {}
            results.append({
                "player_id": pid,
                "slug": entry.get("slug") or (_pid_to_slug.get(pid) if pid else None),
                "name": entry.get("n"),
                "team": entry.get("t"),
                "position": entry.get("p"),
                "made_nba": entry.get("nba"),
                "tier": p.get("v2Tier") or entry.get("tier"),
                "war": p.get("war"),
                "ppwa": p.get("ppwa"),
                "pred_mu": entry.get("mu"),
                "pred_p_nba": entry.get("pn"),
            })
    results.sort(key=lambda x: (-(x.get("war") or x.get("ppwa") or x.get("pred_mu") or 0)))
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
