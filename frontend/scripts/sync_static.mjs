#!/usr/bin/env node
/**
 * sync_static.mjs — spiegelt die statischen API-Payloads ins Vercel-CDN.
 *
 * WARUM: Render Free Tier schläft nach Idle ein; der erste Besucher wartet
 * 30-60s. Die Payloads sind statische Dateien — vom Vercel-CDN geliefert
 * laden sie in Millisekunden, kaltstart- und deploy-frei. Das Frontend
 * versucht sie zuerst (ptFetch in App.jsx) und fällt sonst auf die API
 * zurück — fehlende Dateien sind also nie ein Bruch, nur langsamer.
 *
 * WANN LAUFEN: vor jedem Push, der Payloads ändert (oder immer — idempotent):
 *   node frontend/scripts/sync_static.mjs && git add frontend/public/data
 *
 * Quellen: backend/data/processed (committed Payloads) und
 *          backend/data/processed/static (Board-Dateien; market_*.json
 *          existieren lokal erst nach einem Lauf von export_board_static.py
 *          gegen eine aktuelle DB — fehlen sie, greift der API-Fallback).
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const PROC = resolve(FRONTEND, "..", "backend", "data", "processed");
const OUT = join(FRONTEND, "public", "data");
mkdirSync(OUT, { recursive: true });

const FILES = [
  ["static/years.json", "years.json"],
  ["static/board_current.json", "board_current.json"],
  ["static/board_2026.json", "board_2026.json"],
  ["static/market_intl.json", "market_intl.json"],
  ["static/market_ncaa.json", "market_ncaa.json"],
  ["api_future_classes.json", "api_future_classes.json"],
  ["api_youth_radar.json", "api_youth_radar.json"],
  ["api_awards.json", "api_awards.json"],
  ["api_front_office.json", "api_front_office.json"],
  ["api_draft_sharpe.json", "api_draft_sharpe.json"],
  ["api_nationality_map.json", "api_nationality_map.json"],
  ["api_league_pages.json", "api_league_pages.json"],
  ["api_track_record.json", "api_track_record.json"],
];

let n = 0, missing = [];
for (const [src, dst] of FILES) {
  const p = join(PROC, src);
  if (existsSync(p)) { copyFileSync(p, join(OUT, dst)); n++; }
  else missing.push(src);
}
console.log(`[sync-static] ${n} Payloads → frontend/public/data/`);
if (missing.length) console.log(`[sync-static] fehlen (API-Fallback greift): ${missing.join(", ")}`);
