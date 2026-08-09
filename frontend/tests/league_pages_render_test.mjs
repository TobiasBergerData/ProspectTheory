// league_pages_render_test.mjs — semantic checks for the league landing pages.
// Mirrors the discipline of nationality_render_test: payload invariants + the
// exact fields LeagueView renders. Run from repo root:
//   node frontend/tests/league_pages_render_test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROC = join(HERE, "..", "..", "backend", "data", "processed");
const d = JSON.parse(readFileSync(join(PROC, "api_league_pages.json"), "utf-8"));
const nat = JSON.parse(readFileSync(join(PROC, "api_nationality_map.json"), "utf-8"));

let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { console.error(`FAIL  ${msg}`); process.exit(1); } };

// 1. Payload contract
ok(d.generated && d.season_label, "generated + season_label present");
ok(d.n_leagues >= 50 && d.n_leagues <= 120, `n_leagues plausible (${d.n_leagues})`);
ok(Object.keys(d.leagues).length === d.n_leagues, "leagues map matches n_leagues");
ok(Array.isArray(d.caveats) && d.caveats.length >= 3, "caveats shipped in payload");
ok(d.n_market_listed + d.n_market_unassigned === d.n_market_players,
   "market accounting adds up (listed + unassigned = universe)");

// 2. League entry format — exactly what LeagueView renders
let nListed = 0, nAnchor = 0, natCovered = 0, natTotal = 0;
for (const [slug, lg] of Object.entries(d.leagues)) {
  ok(/^[a-z0-9-]+$/.test(slug), `slug normalized (${slug})`);
  ok(typeof lg.name === "string" && lg.name.length > 1, `name for ${slug}`);
  ok(Number.isFinite(lg.weight) && lg.weight > 0 && lg.weight <= 2.0,
     `weight in (0, 2.0] for ${slug} (${lg.weight})`);
  ok(Number.isInteger(lg.n_paths) && lg.n_paths >= 0, `n_paths for ${slug}`);
  ok(lg.n_direct + lg.n_indirect === lg.n_paths,
     `path counts consistent for ${slug}`);
  ok(lg.primary_confidence == null ||
     (lg.primary_confidence >= 0 && lg.primary_confidence <= 1),
     `primary_confidence in [0,1] for ${slug}`);
  ok(Number.isInteger(lg.n_roster_2026) && lg.n_roster_2026 >= 0,
     `n_roster_2026 for ${slug}`);
  ok(Array.isArray(lg.market), `market list for ${slug}`);
  if (lg.is_anchor) { nAnchor++; ok(lg.weight === 1.0, `anchor weight 1.00 (${slug})`); }

  // 3. Market entry format
  let prevLev = Infinity;
  for (const p of lg.market) {
    nListed++;
    ok(typeof p.name === "string" && p.name.length > 1, `player name in ${slug}`);
    ok(p.rid === null || Number.isInteger(p.rid), `rid int|null (${p.name})`);
    ok(p.lev === null || Number.isFinite(p.lev), `lev numeric|null (${p.name})`);
    // Sorted by level EV desc, nulls last (what the page shows top-down)
    if (p.lev !== null) { ok(p.lev <= prevLev + 1e-9, `lev sort in ${slug}`); prevLev = p.lev; }
    else prevLev = -Infinity;
    // Passport badge joinability (coverage tracked, not required per player)
    if (p.rid !== null) { natTotal++; if (nat.players?.[String(p.rid)]) natCovered++; }
  }
}
ok(nListed === d.n_market_listed, `listed count matches (${nListed})`);
ok(nAnchor === 1, `exactly one anchor league (${nAnchor})`);

// 4. Cross-payload sanity: passport badges will actually render
ok(natTotal > 0 && natCovered / natTotal > 0.9,
   `nationality coverage for market players (${natCovered}/${natTotal})`);

// 5. Translation blocks (A2): threshold honesty + renderable values
let nBlocks = 0, nPublished = 0;
for (const [slug, lg] of Object.entries(d.leagues)) {
  const t = lg.translation;
  if (t == null) continue;   // no observed transfers — allowed
  nBlocks++;
  ok(Number.isInteger(t.n_pairs) && t.n_pairs >= 1, `n_pairs for ${slug}`);
  ok(Number.isInteger(t.min_pairs) && t.min_pairs >= 10, `min_pairs shipped (${slug})`);
  if (t.n_pairs < t.min_pairs) {
    ok(!("stats" in t), `below threshold => NO numbers published (${slug})`);
  } else {
    nPublished++;
    ok(t.stats && Object.keys(t.stats).length >= 4, `stat set for ${slug}`);
    for (const [k, s] of Object.entries(t.stats)) {
      ok(s.label && ["style", "efficiency"].includes(s.class), `class for ${slug}.${k}`);
      ok(["ratio", "delta_pp"].includes(s.metric), `metric for ${slug}.${k}`);
      ok(Number.isFinite(s.value), `finite value for ${slug}.${k}`);
      if (s.metric === "ratio") ok(s.value > 0 && s.value < 3, `ratio plausible ${slug}.${k} (${s.value})`);
      else ok(Math.abs(s.value) < 20, `delta plausible ${slug}.${k} (${s.value})`);
      ok(Number.isInteger(s.n) && s.n >= t.min_pairs, `per-stat n >= threshold ${slug}.${k}`);
    }
  }
}
ok(nPublished >= 10, `translation published for enough leagues (${nPublished}/${nBlocks})`);

// 6. Distribution sanity (guards against a silently broken join)
const withPlayers = Object.values(d.leagues).filter(l => l.market.length > 0).length;
ok(withPlayers >= 10, `players spread across leagues (${withPlayers} leagues)`);
ok(d.n_market_unassigned <= d.n_market_players * 0.1,
   `unassigned share honest but small (${d.n_market_unassigned})`);

console.log(`OK  league pages: ${d.n_leagues} leagues, ${nListed} market players ` +
  `(${d.n_market_unassigned} unassigned), passport coverage ${natCovered}/${natTotal} — ` +
  `${checks.toLocaleString("en-US")} checks green (contract, entry format, sorting, cross-payload).`);
