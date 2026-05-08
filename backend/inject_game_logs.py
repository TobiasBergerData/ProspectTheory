#!/usr/bin/env python3
"""
inject_game_logs.py — Per-Game Stats in API-Profile einspeisen
================================================================
Liest pbp_game_logs_*.csv (eine pro Saison) und schreibt pro Spieler die
Liste seiner Games als compactes Array in profile.gameLogs.

Felder pro Game (kompakt für DB-Größe):
  d  = date (YYYY-MM-DD)
  o  = opponent
  h  = is_home (0/1)
  p  = pts
  a  = ast
  fa = fga
  fm = fgm
  ta = tpa
  tm = tpm
  rb = total reb (oreb+dreb)
  to = tov
  s  = stl
  b  = blk
  pf = personal fouls
  u  = usg_proxy (% of team possessions)
  o2 = ortg_proxy (individual offensive rating)
  e  = efg_pct

Usage: gameLogs[].forEach in Scouting/Development tabs.

Tobias 2026-05-09: pragmatic in-game development data.
"""
from __future__ import annotations
import sqlite3, zlib, json, sys, re, unicodedata, glob
from pathlib import Path
import pandas as pd

BASE = Path(__file__).resolve().parent
DB = BASE / "data" / "processed" / "prospecttheory.db"

# Source dirs (look in both pipeline + backend locations)
CSV_GLOBS = [
    BASE / "data" / "processed" / "pbp_game_logs_*.csv",
    BASE.parent.parent / "data-pipeline" / "data" / "processed" / "pbp_game_logs_*.csv",
]

SUFFIX_RX = re.compile(r"\s+(jr\.?|sr\.?|i+v?|ii+)\.?\s*$", re.IGNORECASE)

def norm_name(s):
    if not isinstance(s, str): return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace(".", "").replace("'", "").replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = SUFFIX_RX.sub("", s).strip()
    return s

def safe_int(v):
    try:
        return int(v) if pd.notna(v) else 0
    except (TypeError, ValueError):
        return 0

def safe_round(v, d=1):
    try:
        if v is None or pd.isna(v): return None
        return round(float(v), d)
    except (TypeError, ValueError):
        return None


def main():
    # Collect all available game-log CSVs (one per season)
    all_csvs = []
    for pattern in CSV_GLOBS:
        all_csvs.extend(sorted(glob.glob(str(pattern))))
    # Dedupe paths
    all_csvs = sorted(set(all_csvs))
    if not all_csvs:
        sys.exit("ERROR: No pbp_game_logs_*.csv found in any expected location")
    print(f"Loading {len(all_csvs)} game-log CSVs:")

    dfs = []
    for c in all_csvs:
        season = Path(c).stem.replace("pbp_game_logs_", "")
        d = pd.read_csv(c, low_memory=False)
        d["season"] = season
        dfs.append(d)
        print(f"  {season}: {len(d):,} rows ({Path(c).name})")
    master = pd.concat(dfs, ignore_index=True)
    print(f"  Master: {len(master):,} player-game rows · {master['player_name'].nunique():,} unique players")

    # Build per-player compact game-log arrays — keep only LATEST season per player
    # (analog to mind_metrics: latest pre-draft season).
    master["_nname"] = master["player_name"].apply(norm_name)
    # Sort so groupby picks latest season's rows
    master = master.sort_values(["_nname", "season", "date"])

    # For each player: take rows from their latest season only
    latest_season_per_player = master.groupby("_nname")["season"].last().to_dict()

    by_player = {}
    for nname, season in latest_season_per_player.items():
        sub = master[(master["_nname"] == nname) & (master["season"] == season)]
        games = []
        for _, r in sub.iterrows():
            games.append({
                "d":  str(r.get("date", "")),
                "o":  str(r.get("opponent", "")),
                "h":  1 if r.get("is_home") else 0,
                "p":  safe_int(r.get("pts")),
                "a":  safe_int(r.get("ast")),
                "fa": safe_int(r.get("fga")),
                "fm": safe_int(r.get("fgm")),
                "ta": safe_int(r.get("tpa")),
                "tm": safe_int(r.get("tpm")),
                "rb": safe_int(r.get("oreb", 0)) + safe_int(r.get("dreb", 0)),
                "to": safe_int(r.get("tov")),
                "s":  safe_int(r.get("stl")),
                "b":  safe_int(r.get("blk")),
                "pf": safe_int(r.get("pf")),
                "u":  safe_round(r.get("usg_proxy"), 1),
                "o2": safe_round(r.get("ortg_proxy"), 0),
                "e":  safe_round(r.get("efg_pct"), 1),
            })
        if games:
            by_player[nname] = {"season": season, "games": games}

    print(f"\n  Compact per-player records: {len(by_player):,}")

    # Inject into DB profiles
    if not DB.exists():
        sys.exit(f"ERROR: DB not found at {DB}")
    conn = sqlite3.connect(DB)
    profiles = conn.execute("SELECT player_id, name, data FROM profiles").fetchall()
    print(f"  DB profiles: {len(profiles):,}")

    matched = 0
    update_rows = []
    for player_id, name, blob in profiles:
        nn = norm_name(name)
        rec = by_player.get(nn)
        if not rec:
            continue
        try:
            obj = json.loads(zlib.decompress(blob).decode("utf-8"))
        except Exception:
            continue
        obj["gameLogs"] = rec
        new_blob = zlib.compress(json.dumps(obj, separators=(",", ":")).encode("utf-8"), level=9)
        update_rows.append((new_blob, player_id))
        matched += 1

    print(f"  Matched: {matched:,} / {len(profiles):,} ({100*matched/len(profiles):.1f}%)")
    print(f"\nWriting {len(update_rows):,} updates...")
    conn.execute("BEGIN TRANSACTION")
    try:
        conn.executemany("UPDATE profiles SET data=? WHERE player_id=?", update_rows)
        conn.commit()
    except Exception as e:
        conn.rollback()
        sys.exit(f"ERROR: {e}")
    print(f"✅ {matched:,} profiles updated")

    # Verification
    print(f"\nVerification:")
    for name in ["Cooper Flagg", "Dylan Harper", "VJ Edgecombe", "Tre Johnson", "Ace Bailey"]:
        r = conn.execute(
            "SELECT data FROM profiles WHERE LOWER(name)=LOWER(?) LIMIT 1", (name,)
        ).fetchone()
        if not r: continue
        obj = json.loads(zlib.decompress(r[0]).decode("utf-8"))
        gl = obj.get("gameLogs")
        if not gl: print(f"  {name}: no gameLogs"); continue
        games = gl["games"]
        print(f"  {name:<22} season={gl['season']}  games={len(games)}  "
              f"PPG={sum(g['p'] for g in games)/len(games):.1f}  "
              f"avgUSG={sum((g['u'] or 0) for g in games)/len(games):.1f}%")
    conn.close()


if __name__ == "__main__":
    main()
