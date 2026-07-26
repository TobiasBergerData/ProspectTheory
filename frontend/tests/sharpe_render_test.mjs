#!/usr/bin/env node
/**
 * Server-Render-Test für "Risk-adjusted Draft Outcomes" (Draft Sharpe).
 *
 *   node tests/sharpe_render_test.mjs [pfad/zur/api_draft_sharpe.json]
 *
 * Gleiche Begründung wie fo_render_test.mjs (Konzept §10): die Payload wird
 * in der KONSUMIERENDEN Runtime gerendert (JSON.parse + React), weil eine
 * Python-Prüfung Kodierungsfehler (bares NaN) strukturell nicht sieht. Und
 * es wird SEMANTIK geprüft, nicht nur "wirft nicht": jede Zelle des Payloads
 * muss mit ihrer Hit-Rate im Markup auftauchen, der Scope-Hinweis (Intl-
 * Deckung) ist Pflicht-Copy, und die Methodik-Zahlen müssen aus dem Payload
 * kommen, nicht aus dem Code.
 *
 * Inputs : src/App.jsx (Block zwischen SHARPE_BLOCK_START/END), Payload-JSON
 * Outputs: Exit 0 = alle Assertions grün; Exit 1 = Liste der Verstöße
 * Annahme: react + react-dom + esbuild liegen in frontend/node_modules
 */
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const APP = join(FRONTEND, "src", "App.jsx");
const PAYLOAD = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(FRONTEND, "..", "backend", "data", "processed", "api_draft_sharpe.json");

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* ── 1. Payload strikt parsen (Riegel gegen bares NaN) ─────────────────────── */
const raw = readFileSync(PAYLOAD, "utf8");
let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  console.error(`FAIL  Payload ist kein gültiges JSON: ${e.message}`);
  console.error(`      ${PAYLOAD}`);
  process.exit(1);
}

/* ── 2. Block schneiden ────────────────────────────────────────────────────── */
const src = readFileSync(APP, "utf8");
const startMarks = [...src.matchAll(/^\/\/ ─── SHARPE_BLOCK_START/gm)];
const endMarks = [...src.matchAll(/^\/\/ ─── SHARPE_BLOCK_END/gm)];
if (startMarks.length !== 1 || endMarks.length !== 1) {
  console.error(`FAIL  Erwarte genau eine SHARPE_BLOCK_START/END-Marke, `
    + `gefunden: ${startMarks.length}/${endMarks.length}.`);
  process.exit(1);
}
const block = src.slice(startMarks[0].index, endMarks[0].index);
ok(/function ShMatrixView/.test(block), "ShMatrixView liegt nicht im Block");
ok(/function ShMethod/.test(block), "ShMethod liegt nicht im Block");
ok(/function ShBanner/.test(block), "ShBanner liegt nicht im Block");
ok(/function ShHeadToHead/.test(block), "ShHeadToHead liegt nicht im Block");

/* ── 3. Härtefälle: leere Zelle + Payload ohne fill-Variante ───────────────── */
const degenerate = JSON.parse(JSON.stringify(payload));
degenerate.variants.pos_base.cells = degenerate.variants.pos_base.cells.slice(0, 2);
degenerate.variants.pos_base.cells[0].elite_examples = [];
degenerate.variants.pos_base.cells[0].sharpe = null;
degenerate.variants.pos_base.cells[0].sharpe_ci = null;

/* ── 4. Entry + Bundle (esbuild-API, kein .cmd-Shim — Windows) ─────────────── */
const scratch = join(FRONTEND, "node_modules", ".cache");
mkdirSync(scratch, { recursive: true });
const tmp = mkdtempSync(join(scratch, "sharpe-render-"));
const entry = join(tmp, "entry.jsx");
const bundle = join(tmp, "bundle.cjs");
writeFileSync(entry, `
import React, { useState, useMemo, useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
${block}
const P = ${JSON.stringify(payload)};
const D = ${JSON.stringify(degenerate)};
const out = {
  h2h: P.head_to_head ? renderToStaticMarkup(<ShHeadToHead h={P.head_to_head} />) : "",
  banner: renderToStaticMarkup(<ShBanner data={P} />),
  matrix_base: renderToStaticMarkup(<ShMatrixView data={P} variant="pos_base" />),
  matrix_fill: renderToStaticMarkup(<ShMatrixView data={P} variant="pos_fill" />),
  method: renderToStaticMarkup(<ShMethod data={P} />),
  degenerate: renderToStaticMarkup(<ShMatrixView data={D} variant="pos_base" />),
};
console.log(JSON.stringify(out));
`, "utf8");

let views;
try {
  const { buildSync } = await import("esbuild");
  buildSync({
    entryPoints: [entry], bundle: true, outfile: bundle,
    platform: "node", format: "cjs", loader: { ".jsx": "jsx" },
    logLevel: "error",
  });
  views = JSON.parse(execFileSync(process.execPath, [bundle],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
} catch (e) {
  console.error("FAIL  Bundle oder Render abgebrochen:");
  console.error(String(e.stderr || e.message).slice(0, 4000));
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
} finally {
  try { rmSync(tmp, { recursive: true, force: true }); } catch { /* egal */ }
}

/* ── 5. Semantik prüfen ────────────────────────────────────────────────────── */
const strip = (h) => h.replace(/<!-- -->/g, "");
const pct = (v) => `${(v * 100).toFixed(0)}%`;

for (const variant of ["pos_base", "pos_fill"]) {
  const html = strip(views[variant === "pos_base" ? "matrix_base" : "matrix_fill"]);
  for (const c of payload.variants[variant].cells) {
    ok(html.includes(pct(c.hit_elite)),
       `${variant} ${c.archetype}/${c.band}: Hit-Rate ${pct(c.hit_elite)} fehlt im Markup`);
    ok(html.includes(`n=${c.n}`),
       `${variant} ${c.archetype}/${c.band}: n=${c.n} fehlt im Markup`);
  }
  // jede Elite-Beispielliste hängt als title-Attribut an der Zelle
  const withEx = payload.variants[variant].cells.filter(c => (c.elite_examples || []).length);
  ok(withEx.every(c => html.includes(c.elite_examples[0].player)),
     `${variant}: mindestens ein Elite-Beispielspieler fehlt (title-Attribut)`);
}

// Head-to-Head: getestete Semantik, wenn der Payload die Sektion trägt
if (payload.head_to_head) {
  const h2h = strip(views.h2h);
  const H = payload.head_to_head;
  for (const p of H.pairs) ok(h2h.includes(p.label), `H2H: Paar "${p.label}" fehlt`);
  for (const p of H.pairs.filter(x => x.outcome)) {
    ok(h2h.includes(Math.abs(p.outcome.asym).toFixed(1)),
      `H2H: Asymmetrie ${p.outcome.asym} von "${p.label}" fehlt im Markup`);
  }
  ok(/decision point/i.test(h2h), "H2H erklärt den Entscheidungspunkt nicht");
  ok(/harsh/i.test(h2h) && /asymmetry/i.test(h2h),
    "H2H erklärt den Max-Bias des Rückblicks-Maßstabs nicht");
  ok(/is not a claim draft samples can support/.test(h2h),
    "H2H fehlt der Regime-Vorbehalt (keine GM-Behauptung)");
  if (H.n_pref_sig === 0) {
    ok(/no quantity bias/i.test(h2h),
      "H2H: Präferenz-Nicht-Befund wird nicht als solcher gerahmt");
  }
  const sigN = H.pairs.filter(x => x.outcome && x.outcome.bh_sig).length;
  ok((h2h.match(/survives FDR/g) || []).length === sigN,
    "H2H: Anzahl 'survives FDR'-Badges weicht von den BH-signifikanten Paaren ab");
}

const banner = strip(views.banner);
ok(/international/i.test(banner), "Scope-Hinweis (international) fehlt im Banner — Pflicht-Copy");
ok(/noisy|secondary/i.test(banner), "Banner nennt die Sharpe-Unsicherheit nicht");
const f1rho = payload.variants.pos_base.f1_split_half.hit_elite.rho;
ok(banner.includes(f1rho.toFixed(2)), `Banner zeigt Split-half-rho ${f1rho.toFixed(2)} nicht (Zahl muss aus dem Payload kommen)`);

const method = strip(views.method);
ok(method.includes(payload.elite_threshold_wa.toFixed(1)),
   "Methodik nennt die Elite-Schwelle nicht");
ok(method.includes(payload.f4_label_robustness_rho.toFixed(2)),
   "Methodik nennt die Label-Robustheit (F4) nicht");
ok(/attenuation/i.test(method), "Methodik erklärt das Attenuation-Argument nicht");
ok(/stranger9977|NFL/.test(method), "Methodik nennt die NFL-Quelle nicht (Idea credit)");

ok(!/NaN|undefined/.test(strip(views.matrix_base)),
   "matrix_base enthält 'NaN' oder 'undefined' im sichtbaren Markup");
ok(views.degenerate.length > 0, "Härtefall (leere Beispiele, null-Sharpe) rendert nicht");
ok(!/NaN/.test(strip(views.degenerate)), "Härtefall rendert 'NaN' ins Markup");

/* ── 6. Ergebnis ───────────────────────────────────────────────────────────── */
if (fails.length) {
  console.error(`FAIL  ${fails.length} Verstöße:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
const nCells = payload.variants.pos_base.cells.length
  + payload.variants.pos_fill.cells.length;
console.log(`ok  Sharpe-Render-Test: ${nCells} Zellen über 2 Varianten, `
  + `5 Views, alle Semantik-Assertions grün (Payload: ${PAYLOAD})`);
