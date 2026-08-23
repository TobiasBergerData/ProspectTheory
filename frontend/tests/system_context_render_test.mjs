// system_context_render_test.mjs — semantic checks for the system-context card.
// Payload invariants + the exact fields SysContextCard renders + the
// "shown, not modeled" guarantee (gate verdict caveat present).
// Run from repo root:
//   node frontend/tests/system_context_render_test.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROC = join(HERE, "..", "..", "backend", "data", "processed");
const d = JSON.parse(readFileSync(join(PROC, "api_system_context.json"), "utf-8"));

let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { console.error(`FAIL  ${msg}`); process.exit(1); } };

// 1. Payload contract
ok(d.generated && d.season_label, "generated + season_label present");
ok(d.n_players > 1000 && Object.keys(d.players).length === d.n_players,
   `players map matches n_players (${d.n_players})`);
ok(d.stat_labels && ["stl", "blk", "orb", "tpa"].every(k => k in d.stat_labels),
   "stat labels complete");
ok(Array.isArray(d.caveats) && d.caveats.some(c => /not a correction|predict WORSE/i.test(c)),
   "'shown, not modeled' caveat ships in the payload");

// 2. Entry format — exactly what the card renders
let nNcaa = 0, nIntl = 0, nStats = 0;
for (const [pid, e] of Object.entries(d.players)) {
  ok(/^(bt|rg):\d+$/.test(pid), `player_id key format (${pid})`);
  ok(typeof e.lg === "string" && e.lg.length > 1, `league label for ${pid}`);
  e.lg === "NCAA" ? nNcaa++ : nIntl++;
  ok(e.stats && Object.keys(e.stats).length >= 1, `stats present for ${pid}`);
  for (const [k, s] of Object.entries(e.stats)) {
    nStats++;
    ok(["stl", "blk", "orb", "tpa"].includes(k), `known stat key ${k}`);
    for (const f of ["v", "tb", "tbp", "rp", "xp"]) {
      ok(Number.isFinite(s[f]), `${f} finite for ${pid}.${k}`);
    }
    ok(s.tbp >= 0 && s.tbp <= 1 && s.rp >= 0 && s.rp <= 1 && s.xp >= 0 && s.xp <= 1,
       `percentiles in [0,1] for ${pid}.${k}`);
    ok(s.tb > 0, `team baseline positive for ${pid}.${k}`);
  }
}
ok(nNcaa > 1000 && nIntl > 300, `both markets covered (NCAA ${nNcaa}, intl ${nIntl})`);

// 3. Semantics: the Wagler mechanism must exist in the data — players on
// extreme-low-steal schemes whose team-relative percentile clearly exceeds raw
const waglerLike = Object.values(d.players).filter(e =>
  e.stats.stl && e.stats.stl.tbp <= 0.1 && e.stats.stl.xp - e.stats.stl.rp >= 0.2);
ok(waglerLike.length >= 10, `scheme-suppression cases present (${waglerLike.length})`);
// ...and the mirror image (inflated by scheme)
const inflated = Object.values(d.players).filter(e =>
  e.stats.stl && e.stats.stl.tbp >= 0.9 && e.stats.stl.rp - e.stats.stl.xp >= 0.2);
ok(inflated.length >= 10, `scheme-inflation cases present (${inflated.length})`);

// 4. Coach-change context (gate PASS 2026-08-12, COACH_PORTABILITY_PRERULE) —
// validated once the payload ships the block; loud warning until the export
// has been re-run so a stale payload can never look like a passing feature.
let coachNote = "coach block: NOT IN PAYLOAD YET (re-run export_system_context.py)";
if (d.coach_context) {
  const ct = d.coach_context;
  ok(/COACH_PORTABILITY_PRERULE/.test(ct.rule_doc || ""), "coach rule_doc cited");
  ok(/pass/.test(ct.gate || "") && /projection/.test(ct.label || ""),
     "gate line + projection label ship in the payload");
  const teams = Object.entries(ct.teams || {});
  ok(teams.length > 300, `coach coverage (${teams.length} teams)`);
  let nProj = 0, nArrival = 0;
  for (const [team, t] of teams) {
    ok(typeof t.coach === "string" && t.coach.length > 2, `coach name for ${team}`);
    ok(Number.isInteger(t.regime_year) && t.regime_year >= 1, `regime_year for ${team}`);
    if (t.arrival) nArrival++;
    if (t.proj) {
      nProj++;
      ok(t.arrival === true, `proj only in arrival window (${team})`);
      ok(typeof t.proj.school === "string" && /\d{4}–\d{4}/.test(t.proj.years),
         `proj source school+years for ${team}`);
      const vals = Object.values(t.proj.stats || {});
      ok(vals.length >= 1 && vals.every(v => v >= 0 && v <= 1),
         `proj percentiles in [0,1] for ${team}`);
    }
  }
  ok(nProj >= 10 && nArrival >= nProj,
     `projections present and only at arrivals (${nProj}/${nArrival})`);
  // players carry the team key the card uses for lookup
  const withTm = Object.values(d.players).filter(e => e.lg === "NCAA" && e.tm);
  ok(withTm.length > 1000, `NCAA players carry tm for coach lookup (${withTm.length})`);
  ok(withTm.some(e => ct.teams[e.tm]?.proj),
     "at least one rendered player hits a projection team");
  ok((d.caveats || []).some(c => /projection/i.test(c) && /coach/i.test(c)),
     "coach-projection caveat ships");
  coachNote = `coach block: ${teams.length} teams, ${nArrival} arrivals, ${nProj} projections`;
} else {
  console.warn("WARN  " + coachNote);
}

console.log(`OK  system context: ${d.n_players.toLocaleString("en-US")} players ` +
  `(NCAA ${nNcaa}, intl ${nIntl}), ${nStats.toLocaleString("en-US")} stat entries, ` +
  `${waglerLike.length} suppression / ${inflated.length} inflation cases — ` +
  `${checks.toLocaleString("en-US")} checks green (contract, entry format, semantics). ` +
  coachNote);
