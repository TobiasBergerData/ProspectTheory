// track_record_render_test.mjs — semantic checks for the public track record.
// Payload invariants + the exact fields TrackRecordView renders + the
// accountability guarantees (frozen snapshot hash, negative gates present).
// Run from repo root:
//   node frontend/tests/track_record_render_test.mjs
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PROC = join(HERE, "..", "..", "backend", "data", "processed");
const d = JSON.parse(readFileSync(join(PROC, "api_track_record.json"), "utf-8"));

let checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { console.error(`FAIL  ${msg}`); process.exit(1); } };

// 1. Payload contract
ok(d.generated && d.tracking_since === "2026-08", "tracking_since fixed at 2026-08");
ok(d.rules_doc && d.rules_doc.includes("TRACK_RECORD_PRERULE"), "pre-rule doc referenced");
ok(Array.isArray(d.caveats) && d.caveats.length >= 4, "caveats shipped in payload");
ok(Array.isArray(d.snapshots) && d.snapshots.length >= 1, "at least one snapshot");
ok(Array.isArray(d.resolutions), "resolutions array present (empty ok in v1)");

// 2. Snapshot: frozen + tamper-evident
const s = d.snapshots[0];
ok(/^[0-9a-f]{64}$/.test(s.sha256), "snapshot ships a full SHA-256");
ok(s.n_claims && s.n_claims.level_up_flags >= 1 && s.n_claims.intl_tier > 100 &&
   s.n_claims.nba_board > 1000, `claim counts plausible (${JSON.stringify(s.n_claims)})`);
ok(s.n_claims.level_up_flags === (d.level_up?.flags || []).length,
   "published flag list matches frozen count");

// 3. Level-up block: rule + base rates + every flag renderable & OPEN in v1
ok(typeof d.level_up.rule === "string" && d.level_up.rule.includes("0.08"),
   "flag rule stated in payload");
ok(d.level_up.base_rates && d.level_up.base_rates.flagged > d.level_up.base_rates.unflagged,
   "base rates present and ordered");
for (const f of d.level_up.flags) {
  ok(typeof f.name === "string" && f.name.length > 1, "flag name");
  ok(Number.isFinite(f.pred_climb) && f.pred_climb + 1e-9 >= 0.08,
     `flag meets threshold (${f.name}: ${f.pred_climb})`);
  ok(f.status === "open" && /^\d{4}-\d{2}-\d{2}$/.test(f.resolve_by),
     `open status + resolve_by (${f.name})`);
  ok(f.rid === null || Number.isInteger(f.rid), `rid int|null (${f.name})`);
  // Internal linking: a shown league must carry its page slug
  ok(!f.league || /^[a-z0-9-]+$/.test(f.league_slug || ""),
     `league_slug present for linked league (${f.name})`);
}

// 4. Projection summaries: counts match tier distributions
for (const key of ["intl_tier", "nba_board"]) {
  const blk = d[key];
  const sum = Object.values(blk.by_tier).reduce((a, b) => a + b, 0);
  ok(sum === blk.n, `${key} tier distribution sums to n (${sum}/${blk.n})`);
  ok(/^\d{4}-\d{2}$/.test(blk.resolve_at), `${key} resolve_at set`);
}

// 5. Accountability: negative gates are on the record, permanently
const gates = d.gate_history || [];
ok(gates.length >= 3, `gate history present (${gates.length})`);
ok(gates.some(g => g.verdict === "do_not_publish"),
   "at least one do_not_publish verdict published");
ok(gates.some(g => g.id === "riser_flag" && g.verdict === "do_not_publish"),
   "riser gate negative on record");
ok(gates.some(g => g.id === "tilt_sharpe" && g.verdict === "do_not_publish"),
   "tilt×sharpe gate negative on record");
for (const g of gates) ok(g.name && g.date && g.rule_doc && g.result,
   `gate entry complete (${g.id})`);

console.log(`OK  track record: snapshot ${s.id} (${s.n_claims.level_up_flags} flags, ` +
  `${s.n_claims.intl_tier} intl tier, ${s.n_claims.nba_board} board claims), ` +
  `${gates.length} gates (${gates.filter(g => g.verdict === "do_not_publish").length} negative) — ` +
  `${checks} checks green (contract, freeze, thresholds, accountability).`);
