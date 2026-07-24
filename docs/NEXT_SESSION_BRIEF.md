# NEXT_SESSION_BRIEF — Lens-Struktur + Draft-Room (ready to execute)

Kontext zuerst lesen: `data-pipeline/docs/SPRINT_5_12_13_SUMMARY.md` + `docs/SITE_COPY_MAP.md`.
Alles Frontend: `frontend/src/App.jsx` (eine Datei, ~15.3k Zeilen). Kein Backend nötig.

## Arbeitsauftrag 1 — Zwei Lenses (IA-Umbau)

**Warum:** Zwei Berufe, zwei Fragen. NBA-Scout: „wen draften?" · Intl-Sportdirektor:
„wen verpflichten?". Das Recruiting-Board ist aktuell als 4. Toggle im Big Board
versteckt — soll gleichrangig werden.

**Ziel-Struktur:**
- Top-Level: **NBA Draft** | **International Recruiting** (statt Board-View-Toggle
  `[table, curves, tier, intl]` in `BigBoardView`, Toggle-Leiste bei `boardView`).
- NBA-Lens enthält: Table / Curves / Tier Board (+ später Draft Room).
- Recruiting-Lens enthält: `IntlBoardView` (existiert fertig: Value ▲, Flight Risk,
  Comps) + Platz für Watchlist später.
- Shared: Suche, Player-Pages, Stats Lab, Research, Methods (Live Validation global).
- **Player-Page-Hero lens-abhängig:** aus NBA-Lens → Peak-WA + Tier-Odds führen
  (heutiger Zustand, `ProjectionTab`-Hero ~L7245). Aus Recruiting-Lens →
  Projected Level + Value + `intlComps` führen, NBA nur als „Flight Risk: x%".
  Lens-State per React-State + URL-Param (kein Router vorhanden — Hash reicht).

**Sprachregel je Lens (SITE_COPY_MAP gilt):** NBA = Added Wins / Tier-Odds /
Bust-Risk · Recruiting = Projected Level / Value / Flight Risk. Skalen nie mischen.

## Arbeitsauftrag 2 — Draft-Room-Vergleich (NBA-Lens)

**Was:** 2–3 Spieler nebeneinander für die On-the-clock-Entscheidung.
- Overlay der Outcome-Kurven auf EINER Peak-WA-Achse (Engine existiert:
  `PWA_TIER_ANCHORS` ~L502 + Mischungs-Logik wie `renderMiniCurve` in
  `OutcomeCurveBoard` ~L12800 / `RfPwaCurve` ~L6890 — wiederverwenden, nicht neu).
- Daneben: Tier-Odds (`p.tiers`, %-Skala), ▲AS+/▼out, Boosters/Limiters.
- Schalter Win-Now / Balanced / Rebuild (Logik existiert: `gmRisk` +
  `computeGMUtility` ~L12690): Win-Now empfiehlt höchsten p20-Floor,
  Rebuild höchste P(AS+), Balanced höchsten EV. Empfehlung + 1-Satz-Begründung.
- Einstieg: Checkbox/„Compare"-Buttons auf dem Board (Vorbild: `CompareModal`
  im Stats Lab ~L14100) → eigener Draft-Room-View in der NBA-Lens.
- Alle Daten sind client-seitig im Board-Payload vorhanden — keine neuen Fetches.

## Arbeits-Setup (Fallen aus 5.12/5.13)

- **Verify:** Sandbox-Mount trunkiert App.jsx oft → `tr -d '\000' < src/App.jsx`,
  bei Trunkierung Host-Tail via Read splicen, dann
  `npx esbuild /tmp/full.jsx --bundle --loader:.jsx=jsx --jsx=automatic
  --external:react --external:react/jsx-runtime --external:recharts
  --external:react-dom --outfile=/dev/null`.
- Git-Push macht immer der User am Host (Sandbox hat keine Credentials).
- Sichtbare Copy: Englisch, keine Sprint-Marker, keine Refresh-Zahlen hardcoden
  (Regeln in SITE_COPY_MAP.md). Neue Elemente → beide Erklärstellen im selben Commit.
- Reihenfolge: erst Auftrag 1 (Struktur), dann 2 (Feature an seinen Platz).
