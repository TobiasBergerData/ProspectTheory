#!/usr/bin/env node
/**
 * Payload+Semantik-Test für die Recruiting-Ansicht "Future Classes".
 *
 *   node tests/future_classes_test.mjs [pfad/zum/api_future_classes.json]
 *
 * Leichter als fo_render_test.mjs — bewusst: die Ansicht lädt ihre Daten
 * selbst per fetch (kein purer Props-Block wie FO/Sharpe), ein echter
 * Server-Render bräuchte einen fetch-Mock und bewiese wenig zusätzlich,
 * weil die Ansicht deskriptiv ist (keine statistischen Aussagen in der
 * Copy). Was hier stattdessen geprüft wird:
 *
 * 1. Payload strikt mit JSON.parse (Riegel gegen bares NaN — derselbe
 *    Fehler, der das FO Lab einmal stumm gelegt hätte).
 * 2. Payload-Invarianten: Klassen nur >= first_future_class, classes[]-
 *    Zähler konsistent mit players[], Sortier-Regel (Profi zuerst, darin
 *    aap absteigend) tatsächlich eingehalten, Brücken-Blöcke vollständig.
 * 3. App.jsx-Semantik: die View ist verdrahtet (fetch-Route, Button,
 *    Render-Zweig, Filter-Ausnahme) und die Copy behauptet genau die
 *    Semantik, die der Payload trägt (Untergrenzen-Tag "≥", Ausschluss
 *    unbestimmbarer Kohorten, "not a projection").
 *
 * Exit 0 = grün; Exit 1 = Liste der Verstöße. Regel: bei FAIL nicht committen.
 */
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, "..");
const APP = join(FRONTEND, "src", "App.jsx");
const PAYLOAD = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(FRONTEND, "..", "backend", "data", "processed", "api_future_classes.json");

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* ── 1. Payload strikt parsen ── */
let d;
try {
  d = JSON.parse(readFileSync(PAYLOAD, "utf8"));
} catch (e) {
  console.error(`FAIL  Payload ist kein gültiges JSON für JSON.parse: ${e.message}`);
  console.error(`      ${PAYLOAD} — export_future_classes.py nutzt _s() + allow_nan=False.`);
  process.exit(1);
}

/* ── 2. Payload-Invarianten ── */
const pl = d.players || [];
ok(pl.length > 0, "players[] ist leer");
ok(Number.isInteger(d.first_future_class), "first_future_class fehlt");
ok(pl.every(p => Number.isInteger(p.class_min) && p.class_min >= d.first_future_class),
   "Spieler mit class_min unter der ersten Zukunftsklasse im Payload");
ok(pl.every(p => typeof p.class_exact === "boolean"),
   "class_exact fehlt oder ist kein Boolean");
ok(pl.every(p => typeof p.name === "string" && p.name.length > 0), "Spieler ohne Namen");
for (const c of d.classes || []) {
  const sub = pl.filter(p => p.class_min === c.year);
  ok(sub.length === c.n, `classes[${c.year}].n=${c.n} ≠ players-Zählung ${sub.length}`);
  ok(sub.filter(p => p.pro).length === c.n_pro,
     `classes[${c.year}].n_pro=${c.n_pro} ≠ players-Zählung`);
}
ok((d.classes || []).reduce((s, c) => s + c.n, 0) === pl.length,
   "Summe der Klassen-Zähler ≠ players.length");
// Brücken-Blöcke: exakt-Klasse nur mit pro; pro-Block trägt endliche Kernfelder
ok(pl.every(p => !p.class_exact || p.pro),
   "class_exact=true ohne pro-Block (exakt geht nur über das Profi-Alter)");
ok(pl.every(p => !p.pro || (typeof p.pro.season === "string"
     && (p.pro.mpg === null || Number.isFinite(p.pro.mpg))
     && (p.pro.aap === null || Number.isFinite(p.pro.aap)))),
   "pro-Block mit fehlendem season oder nicht-finiten mpg/aap");
// Sortier-Regel je Klasse: erst Profi (aap absteigend), dann Jugend-only
for (const c of d.classes || []) {
  const sub = pl.filter(p => p.class_min === c.year);
  let seenYouth = false, lastAap = Infinity;
  for (const p of sub) {
    if (!p.pro) { seenYouth = true; continue; }
    ok(!seenYouth, `Klasse ${c.year}: Profi-Spieler nach Jugend-only einsortiert`);
    const a = p.pro.aap ?? -99;
    ok(a <= lastAap + 1e-9, `Klasse ${c.year}: aap-Sortierung verletzt (${p.name})`);
    lastAap = a;
  }
}
// Meta ehrlich: Ausschlüsse müssen beziffert sein (keine stille Kappung)
ok(d.meta && Number.isInteger(d.meta.n_past_or_current_band),
   "meta.n_past_or_current_band fehlt — Ausschlüsse wären unbeziffert");

/* ── 3. App.jsx-Verdrahtung + Copy-Semantik ── */
const src = readFileSync(APP, "utf8");
ok(src.includes("function FutureClassesView"), "FutureClassesView fehlt in App.jsx");
ok(src.includes("/future-classes"), "fetch-Route /future-classes fehlt");
ok(src.includes('"future","🌱 Future Classes"'), "View-Button 'future' nicht registriert");
ok(src.includes('intlView==="future"'), "Render-Zweig für intlView 'future' fehlt");
ok(src.includes('intlView!=="youth" && intlView!=="future"'),
   "Filter-Leiste nicht von der Future-Ansicht ausgenommen");
// Copy muss die Untergrenzen-Semantik und den ehrlichen Ausschluss tragen
const view = src.slice(src.indexOf("function FutureClassesView"),
                       src.indexOf("// COLLEGE TARGETS"));
ok(/lower bound/i.test(view), "Copy: 'lower bound' (Band-Untergrenze) fehlt");
ok(view.includes("≥"), "Copy: ≥-Tag für unexakte Kohorten fehlt");
ok(/deliberately excluded|remain on the Youth Radar/.test(view),
   "Copy: Ausschluss unbestimmbarer Kohorten nicht benannt");
ok(/not a projection/i.test(view), "Copy: 'not a projection'-Vorbehalt fehlt");
ok(/class_exact \? p\.class_min : `≥ \$\{p\.class_min\}`/.test(view),
   "Render: exakte vs. ≥-Kohorten-Anzeige fehlt");

/* ── 4. Recruiting-Fundament (Markt-Pool + Kohorten-Tabs + Pro-Ready) ──
   Mit im selben Test, weil dieselbe Baustelle: der volle Intl-Markt
   (/api/market/intl) speist College Targets, Level-Up und Similar. */
ok(src.includes("/market/intl"), "fetch-Route /market/intl fehlt");
ok(/marketIntl\.filter\(m=>!seen\.has\(m\.player_id\)\)/.test(src),
   "Markt-Merge ohne player_id-Dedupe gegen den Board-Pool");
ok(src.includes("if(m.name && !PLAYERS[m.name]) PLAYERS[m.name]=m;"),
   "Markt-Spieler überschreiben Board-Einträge in PLAYERS (nur freie Keys erlaubt)");
const college = src.slice(src.indexOf("function CollegeTargetsView"),
                          src.indexOf("function ", src.indexOf("function CollegeTargetsView") + 10));
ok(/Class of \$\{baseYear/.test(college), "College Targets: Kohorten-Tabs fehlen");
ok(/earliest draft\s+class/.test(college), "College Targets: Kohorten-Copy fehlt");
const lvl = src.slice(src.indexOf("function LevelUpView"),
                      src.indexOf("function ", src.indexOf("function LevelUpView") + 10));
ok(/\[mode, setMode\] = useState\("climb"\)/.test(lvl),
   "Level-Up: Climb/Pro-Ready-Toggle fehlt (Default muss climb bleiben)");
ok(/CLIMB_MIN = 0\.08/.test(lvl),
   "Level-Up: validierte Climb-Schwelle 0.08 verändert — nicht ohne neuen Backtest");
ok(/p\._climb != null \? /.test(lvl),
   "Level-Up: Climb-Zelle nicht null-sicher (Pro-Ready-Modus hat Spieler ohne Umfeld-Level)");

/* ── 5. College-to-Pro (NCAA-Markt) + Watchlist-Durchgriff ── */
ok(src.includes("/market/ncaa"), "fetch-Route /market/ncaa fehlt");
ok(src.includes("function CollegeToProView"), "CollegeToProView fehlt");
ok(src.includes('"c2p","🧳 College-to-Pro"'), "View-Button 'c2p' nicht registriert");
ok(src.includes('intlView==="c2p"'), "Render-Zweig für 'c2p' fehlt");
ok(src.includes('intlView!=="youth" && intlView!=="future" && intlView!=="c2p"'),
   "Filter-Leiste nicht von College-to-Pro ausgenommen");
const c2p = src.slice(src.indexOf("function CollegeToProView"),
                      src.indexOf("function ", src.indexOf("function CollegeToProView") + 10));
ok(/no top-200 cap/i.test(c2p), "C2P-Copy: 'no top-200 cap' fehlt");
ok(/absolute projected league level/i.test(c2p), "C2P-Copy: Sortier-Behauptung fehlt");
ok(/nbaFlightPct\(p\) < NBA_LOCK/.test(c2p), "C2P: NBA-Lock-Ausschluss fehlt");
ok(/first professional contract/i.test(c2p), "C2P-Copy: Erstvertrags-Framing fehlt");
// Watchlist-Durchgriff: Future Classes trägt ★ und der Watch-View benennt
// Pipeline-Einträge, die noch nicht im Markt-Pool sind.
ok(/FutureClassesView watchlist=\{watchlist\} onToggleWatch=\{toggleWatch\}/.test(src),
   "Future Classes ohne Watchlist-Props");
ok(/pipeline notes until they enter the market pool/.test(src),
   "Watch-View: Pipeline-Hinweis für Future-Classes-Einträge fehlt");

/* ── 6. Block "Filter + Teilen + Export" (deterministische UI, kein Gate) ── */
ok(src.includes("function ptExportCsv"), "CSV-Export-Helper fehlt");
ok(src.includes('new Blob(["\\uFEFF" + csv]'),
   "CSV ohne UTF-8-BOM — Excel zerlegt Namen mit Diakritika");
ok((src.match(/ptExportCsv\(/g) || []).length >= 4,
   "CSV-Buttons fehlen (erwartet: Helper + C2P + College Targets + Level-Up)");
ok(src.includes('q.set("view", want)'), "Recruiting-Deep-Link (view=) wird nicht geschrieben");
ok(/const v = ptHashQuery\(\)\.get\("view"\)/.test(src),
   "Recruiting-Deep-Link (view=) wird nicht gelesen");
ok(/PT_INTL_VIEWS = \["board","watch","levelup","portal","college","similar","c2p","youth","future","report"\]/.test(src),
   "Deep-Link-Whitelist deckt nicht alle Recruiting-Views");
// Positions-Filter in den drei neuen/erweiterten Views
ok((src.match(/\["All", "Playmaker", "Wing", "Big"\]\.map/g) || []).length >= 2,
   "Pos-Chips fehlen in College-to-Pro / College Targets");
ok(src.includes('["All", "G", "F", "C"].map'), "Pos-Chips fehlen in Future Classes");

/* ── 7. Watchlist-Diff (deskriptiv, localStorage-Baseline) ── */
ok(src.includes('WATCH_BASE_KEY = "prospecttheory_watch_baseline_v1"'),
   "Watchlist-Diff: Baseline-Key fehlt");
ok(src.includes("Mark as seen"), "Watchlist-Diff: Mark-as-seen-Button fehlt");
ok(/bewusst KEIN Auto-Update/.test(src),
   "Watchlist-Diff: Auto-Update-Entscheidung nicht dokumentiert");
ok(/payload numbers only, no model/.test(src),
   "Watchlist-Diff-Copy: Deskriptiv-Vorbehalt fehlt");
ok(src.includes(">new on list<"), "Watchlist-Diff: Kennzeichnung neuer Einträge fehlt");
// Schwellen der Diff-Chips müssen in der Copy stehen (keine stillen Schwellen)
ok(/level ≥0\.02, tier, NBA risk ≥5pp, WA ≥0\.3/.test(src),
   "Watchlist-Diff: Chip-Schwellen nicht in der Copy benannt");

/* ── 8. Market Report (teilbares Snapshot-Artefakt) + Riser-Negativbefund ── */
ok(src.includes("function MarketReportView"), "MarketReportView fehlt");
ok(src.includes('"report","📰 Report"'), "Report-Button nicht registriert");
ok(src.includes('intlView==="report"'), "Render-Zweig für Report fehlt");
ok(src.includes('"board","watch","levelup","portal","college","similar","c2p","youth","future","report"'),
   "Deep-Link-Whitelist ohne report");
const rep = src.slice(src.indexOf("function MarketReportView"),
                      src.indexOf("function ", src.indexOf("function MarketReportView") + 10));
ok(/snapshot of the current\s+data build/i.test(rep), "Report-Copy: Snapshot-Vorbehalt fehlt");
ok(/not a news feed/i.test(rep), "Report-Copy: News-Feed-Abgrenzung fehlt");
ok(/nothing here is recomputed/i.test(rep), "Report-Copy: Eine-Quelle-Prinzip fehlt");
// Der Riser-Negativbefund MUSS benannt sein (Schutz vor Recency-Bias) —
// und mit den echten Gate-Zahlen, nicht als vage Behauptung.
ok(/18,486 league-seasons/.test(rep) && /−0\.7pp, p=0\.84/.test(rep),
   "Report: Riser-Negativbefund (validate_riser.py) fehlt oder ohne Zahlen");
ok(/an honest empty list beats a lowered bar/i.test(rep),
   "Report: Empty-State der Undervalued-Sektion fehlt");

/* ── 9. Experience-Block: Static-First, Rollen-Einstieg, Export/Import ── */
ok(src.includes("function ptFetch"), "Static-First-Helper ptFetch fehlt");
ok(src.includes('"/market/intl": "/data/market_intl.json"'), "Static-Map unvollständig");
ok(/content-type.*includes\("json"\)/.test(src) || src.includes('.includes("json")'),
   "ptFetch ohne Content-Type-Check — SPA-Fallback-HTML würde als JSON durchgehen");
ok((src.match(/ptFetch\(/g) || []).length >= 11, "zu wenige Call-Sites auf ptFetch umgestellt");
ok(src.includes("pt_role_intro_v1"), "Rollen-Einstieg fehlt");
ok(src.includes("Report data issue"), "Data-Issue-Link fehlt");
ok(src.includes("⇪ Export") && src.includes("⇩ Import"), "Watchlist Export/Import fehlt");

/* ── 10. Youth Radar: Turnier-Filter + Deep-Link (?event=) ── */
ok(src.includes('ptHashQuery().get("event")'), "Youth: event-Deep-Link wird nicht gelesen");
ok(src.includes('q.set("event", ev)'), "Youth: event-Deep-Link wird nicht geschrieben");
ok(src.includes("_evSlug(t) === ev"), "Youth: Turnier-Filter fehlt");
ok(src.includes("re-run the youth scrape"), "Youth: ehrlicher Empty-State für ungescrapte Events fehlt");
ok(/includes\("'26"\) \? "🔥 " : ""/.test(src), "Youth: Markierung der aktuellen Editionen fehlt");

/* ── Ergebnis ── */
if (fails.length) {
  console.error(`FAIL  ${fails.length} Verstöße:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`OK  future-classes: ${pl.length} Spieler, Klassen ` +
  `${(d.classes || []).map(c => `${c.year}(${c.n},pro:${c.n_pro})`).join(" ")} — ` +
  `Payload-Invarianten, Sortierung, Verdrahtung und Copy-Semantik grün.`);
