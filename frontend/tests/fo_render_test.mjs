#!/usr/bin/env node
/**
 * Server-Render-Test für das Front Office Lab.
 *
 *   node tests/fo_render_test.mjs [pfad/zum/api_front_office.json]
 *
 * WARUM ES DIESEN TEST GIBT (Konzept §10)
 * ---------------------------------------
 * Die Payload-Prüfung lief viermal in Python durch und meldete "alles sauber" —
 * die Seite wäre trotzdem stumm im Ladezustand hängen geblieben, weil
 * `json.dumps` bares `NaN` schreibt, Pythons `json.load` das akzeptiert und
 * `JSON.parse` im Browser wirft. Eine Payload mit derselben Sprache zu prüfen,
 * die sie erzeugt hat, kann Kodierungsfehler strukturell nicht sehen. Deshalb
 * rendert dieser Test in der KONSUMIERENDEN Runtime.
 *
 * `esbuild` allein reicht nicht: es beweist nur, dass das JSX parst.
 *
 * Und der Test prüft SEMANTIK, nicht nur "wirft nicht". Der zweite echte Fehler
 * dieser Baustelle war eine Seite, die "testing 180 cells" schrieb, während 188
 * korrigiert wurden — beide Zahlen für sich konsistent, nur nicht miteinander.
 * Ein Test, der nur Abstürze findet, findet keine falschen Aussagen.
 *
 * Inputs : src/App.jsx (Block zwischen FO_BLOCK_START/END), Payload-JSON
 * Outputs: Exit 0 = alle Assertions grün; Exit 1 = Liste der Verstöße auf stderr
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
  : resolve(FRONTEND, "..", "backend", "data", "processed", "api_front_office.json");

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* ── 1. Payload: STRIKT parsen ───────────────────────────────────────────────
   Bewusst JSON.parse und nicht irgendein toleranter Reader: genau diese
   Strenge ist der Riegel gegen bares NaN. Ein Loader, der mehr akzeptiert als
   der Browser, würde den Fehler wieder unsichtbar machen. */
const raw = readFileSync(PAYLOAD, "utf8");
let payload;
try {
  payload = JSON.parse(raw);
} catch (e) {
  console.error(`FAIL  Payload ist kein gültiges JSON für JSON.parse: ${e.message}`);
  console.error(`      ${PAYLOAD}`);
  console.error(`      Typische Ursache: bares NaN/Infinity aus json.dumps —`);
  console.error(`      export_front_office.py nutzt _s() + allow_nan=False.`);
  process.exit(1);
}

/* ── 2. FO-Block aus App.jsx schneiden ─────────────────────────────────────── */
const src = readFileSync(APP, "utf8");
const startMarks = [...src.matchAll(/^\/\/ ─── FO_BLOCK_START/gm)];
const endMarks = [...src.matchAll(/^\/\/ ─── FO_BLOCK_END/gm)];
if (startMarks.length !== 1 || endMarks.length !== 1) {
  console.error(`FAIL  Erwarte genau eine FO_BLOCK_START- und eine FO_BLOCK_END-Marke `
    + `in App.jsx, gefunden: ${startMarks.length}/${endMarks.length}.`);
  process.exit(1);
}
const block = src.slice(startMarks[0].index, endMarks[0].index);
ok(/function FoRegimeCard/.test(block), "FoRegimeCard liegt nicht im geschnittenen Block");
ok(/function FoMethod/.test(block), "FoMethod liegt nicht im geschnittenen Block");

/* ── 3. Härtefälle bauen ─────────────────────────────────────────────────────
   Degeneriertes Regime: keine Tilts, keine Bänder, kein Konsens-Wert. Das ist
   kein konstruierter Extremfall — Regimes mit drei Picks und unbekannter
   Position existieren real, und genau dort greifen die Optional-Chains. */
const regimes = (payload.regimes || []).slice();
const degenerate = {
  ...(regimes[0] || {}), exec: "ZZ Degenerate", team: "ZZZ",
  tilts: [], bands: [], cons_pass: null, n_cons: 0,
};
// Zensur-Härtefall SYNTHETISCH mitschicken, auch wenn der echte Payload gerade
// welche enthält: sobald die letzte Klasse aus dem 5-Saisons-Fenster läuft,
// verschwindet der Fall aus den Daten — und die Assertion würde still zu einem
// No-Op, ohne dass jemand es merkt. Ein Test, der sich selbst abschaltet, ist
// schlimmer als keiner.
const ungradedCase = {
  ...(regimes[0] || {}), exec: "ZZ Ungraded", team: "ZZY",
  n: 0, n_all: 4, pva: null, pva_shrunk: null, wa_total: null,
};
const cases = regimes.concat([degenerate, ungradedCase]);

/* ── 4. Entry-Datei + Bundle ─────────────────────────────────────────────────
   Der Block referenziert App-globale Namen (API_BASE), die hier nicht
   existieren. Das ist in Ordnung: sie werden nur in useEffect benutzt, und
   renderToStaticMarkup führt keine Effekte aus. esbuild lässt unaufgelöste
   Identifier als Globals stehen. */
// Das Scratch-Verzeichnis liegt bewusst INNERHALB von frontend/, nicht in
// os.tmpdir(): esbuild löst "react" relativ zur importierenden Datei auf, und
// aus /tmp findet die Node-Auflösung frontend/node_modules nicht. node_modules
// /.cache ist ohnehin ignoriert.
const scratch = join(FRONTEND, "node_modules", ".cache");
mkdirSync(scratch, { recursive: true });
const tmp = mkdtempSync(join(scratch, "fo-render-"));
const entry = join(tmp, "entry.jsx");
const bundle = join(tmp, "bundle.cjs");
writeFileSync(entry, `
import React, { useState, useMemo, useEffect } from "react";
import { renderToStaticMarkup } from "react-dom/server";
${block}
const P = ${JSON.stringify(payload)};
const CASES = ${JSON.stringify(cases)};
const cm = P.consensus ? P.consensus.league_mean : null;
const out = {
  banner: renderToStaticMarkup(<FoGateBanner gate={P.gate} window={P.window} />),
  regimes: renderToStaticMarkup(<FoRegimesView data={P} />),
  replay: renderToStaticMarkup(<FoReplayView data={P} />),
  board: renderToStaticMarkup(<FoBoardView data={P} />),
  method: renderToStaticMarkup(<FoMethod data={P} />),
  cards: CASES.map(r => renderToStaticMarkup(
    <FoRegimeCard r={r} open={true} onToggle={() => {}} consMean={cm} />)),
};
console.log(JSON.stringify(out));
`, "utf8");

// esbuild über die JS-API, NICHT über node_modules/.bin: Node >= 18.20
// verweigert spawnSync auf .cmd-Wrapper (EINVAL, Schutz gegen
// Command-Injection über Batch-Dateien), und genau das ist der Binary-Shim
// unter Windows. Die API-Variante hat dieses Problem nicht und spart den
// Subprozess gleich mit.
let views;
try {
  const { buildSync } = await import("esbuild");
  buildSync({
    entryPoints: [entry], bundle: true, outfile: bundle,
    platform: "node", format: "cjs", loader: { ".jsx": "jsx" },
    logLevel: "error",
  });
  // Rendern in eigenem Prozess: ein Throw hier ist ein echter Render-Fehler
  // und soll die Ausgabe nicht mit einem Stacktrace des Testrunners mischen.
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

/* ── 5. Text extrahieren ─────────────────────────────────────────────────────
   React setzt zwischen {expr} und angrenzenden Literalen einen Kommentar-Node
   (<!-- -->). Ohne Strippen scheitert jede Substring-Assertion an einer
   Stelle, an der die Seite exakt richtig ist. */
const text = (html) => html
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"').replace(/&#x27;/g, "'")
  .replace(/\s+/g, " ").trim();

const T = Object.fromEntries(Object.entries(views).map(([k, v]) =>
  [k, Array.isArray(v) ? v.map(text) : text(v)]));
const ALL = [T.banner, T.regimes, T.replay, T.board, T.method, ...T.cards].join(" \n ");

/* ── 6. Assertions ─────────────────────────────────────────────────────────── */

// (a) Keine Platzhalter-Leichen. "undefined"/"NaN" im sichtbaren Text heißt:
//     ein Payload-Feld fehlt und die Komponente hat es ungeprüft ausgegeben.
for (const bad of ["undefined", "NaN", "[object Object]", "null%"]) {
  ok(!ALL.includes(bad), `Sichtbarer Text enthält "${bad}"`);
}

// (b) Der Gate setzt den Wahrheitsanspruch, nicht unser Geschmack.
const descriptive = payload.gate?.verdict !== "track_record";
ok(descriptive === T.banner.includes("Draft history — what happened"),
  "Gate-Banner-Text passt nicht zu gate.verdict");
if (descriptive) {
  for (const forbidden of ["best drafter", "Draft track record", "will draft"]) {
    ok(!ALL.includes(forbidden),
      `Deskriptiver Gate, aber die Seite schreibt "${forbidden}"`);
  }
}

// (c) FDR-Nenner: die Zahl, die der Text NENNT, muss die sein, über die die
//     Korrektur lief. Genau hier ist es schon einmal auseinandergelaufen.
const nCells = payload.window?.n_tilt_cells;
ok(nCells == null || T.method.includes(String(nCells)),
  `Method nennt den FDR-Nenner ${nCells} nicht`);

// (d) Zwei Baselines: die genannten Trefferzahlen müssen aus dem Payload
//     fallen, nicht aus dem, was zufällig sichtbar ist.
const tilts = (payload.regimes || []).flatMap(r => r.tilts || []);
const nSig = tilts.filter(t => t.sig).length;
const nSigPeer = tilts.filter(t => t.sig_peer).length;
ok(T.method.includes(String(nSig)) && T.method.includes(String(nSigPeer)),
  `Method nennt nicht beide Baseline-Zahlen (Pool ${nSig}, Peers ${nSigPeer})`);

// (e) Marker-Semantik. ● darf NUR stehen, wenn die Zelle gegen Zeitgenossen
//     überlebt. Ein ● an einer Pool-only-Zelle wäre exakt die Behauptung, die
//     der Zwei-Baselines-Umbau widerlegt hat (Konzept §11.1).
const count = (s, ch) => (s.match(new RegExp(ch, "g")) || []).length;
const vis = (r) => (r.tilts || []).filter(t => t.sig || t.sig_peer);
const shown = (payload.regimes || []).flatMap(vis);
// NUR die echten Karten zählen: die Härtefälle sind Kopien und würden ihre
// Zellen doppelt in die Bilanz schreiben.
const real = T.cards.slice(0, regimes.length).join(" ");
ok(count(real, "●") === shown.filter(t => t.sig_peer).length,
  "Anzahl ●-Marker weicht von den Zellen mit sig_peer ab");
ok(count(real, "◐") === shown.filter(t => t.sig && !t.sig_peer).length,
  "Anzahl ◐-Marker weicht von den Pool-only-Zellen ab");

// (f) Eine Pool-only-Zelle darf NIE unqualifiziert dastehen. Der einschränkende
//     Halbsatz ist der ganze Punkt der Unterscheidung.
const poolOnly = shown.filter(t => t.sig && !t.sig_peer).length;
ok(count(real, "vs\\. the pool only") === poolOnly,
  "Nicht jede Pool-only-Zelle trägt den einschränkenden Zusatz");

// (g) Auflösungsgrenze der Permutation: die genannte N muss die gelaufene sein.
const nPerm = payload.window?.n_perm_peer;
if (nPerm != null) {
  ok(T.method.includes(nPerm.toLocaleString("en-US")) || T.method.includes(String(nPerm)),
    `Method nennt N_PERM_PEER ${nPerm} nicht`);
}

// (h) Omnibus: das beste p UND das p der Dimension, die alle Pool-Treffer
//     trägt. Nur das beste zu nennen liest sich wie eine Bestätigung.
const dims = payload.gate?.behaviour_dims || [];
ok(dims.length === 0 || dims.some(d => T.method.includes(String(d.p))),
  "Method nennt kein dimensionsweises Omnibus-p aus gate.behaviour_dims");

// (i) Konsens-Nicht-Befund. Kippt der Test je auf "stable", muss die Seite das
//     SELBST sagen — die Komponente trägt dafür einen Amber-Hinweis.
const cons = payload.consensus;
if (cons) {
  ok(T.regimes.includes("tested, and no") || T.regimes.includes("not a distinguishing"),
    "Konsens-Block fehlt oder behauptet einen Befund");
  ok(cons.stable === T.regimes.includes("this copy needs revisiting"),
    "Selbstwarnung des Konsens-Blocks passt nicht zu consensus.stable");
}

// (j) Bänder sind bewusst ungetestet — ohne den Disclaimer liest sich das
//     Profil wie ein Befund.
const anyBands = (payload.regimes || []).some(r => (r.bands || []).length);
ok(!anyBands || real.includes("no significance test at band level"),
  "Pick-Range-Profil ohne den Hinweis, dass auf Band-Ebene nicht getestet wird");

// (k) Zensur-Sprache: ein Regime ohne bewertbaren Pick behauptet keine Null.
// `n` = bewertbare Picks, `n_all` = alle. Dieselbe Bedingung wie in
// FoRegimeCard — bewusst dupliziert: der Test soll merken, wenn die Karte sie
// ändert, statt stillschweigend mitzuwandern.
const ungradedCards = T.cards.filter((c, i) =>
  !cases[i].n && (cases[i].n_all || 0) > 0);
ok(ungradedCards.length > 0, "Kein Zensur-Härtefall gerendert (Testaufbau kaputt)");
ok(ungradedCards.every(c => c.includes("not gradeable yet")),
  "Regime ohne bewertbaren Pick sagt nicht 'not gradeable yet'");
ok(ungradedCards.every(c => !c.includes("Graded picks") && !c.includes("includes zero")),
  "Regime ohne bewertbaren Pick behauptet trotzdem ein Ergebnis");
// Eine 0.00 wäre hier eine Behauptung, keine Messung.
ok(ungradedCards.every(c => !/\B[+−-]?0\.00\b/.test(c)),
  "Regime ohne bewertbaren Pick zeigt eine Null statt 'n/a'");

// (l) Der degenerierte Fall rendert überhaupt und bleibt stumm statt zu raten.
ok(T.cards.some(c => c.includes("ZZ Degenerate")),
  "Degeneriertes Regime (keine Tilts/Bänder/Konsens) rendert nicht");

/* ── 7. Ergebnis ───────────────────────────────────────────────────────────── */
if (fails.length) {
  console.error(`FAIL  ${fails.length} Assertion(s):`);
  fails.forEach(f => console.error(`  · ${f}`));
  process.exit(1);
}
console.log(`ok  FO-Render-Test: ${cases.length} Karten + 5 Views, `
  + `${12} Assertion-Gruppen grün (Payload: ${PAYLOAD})`);
