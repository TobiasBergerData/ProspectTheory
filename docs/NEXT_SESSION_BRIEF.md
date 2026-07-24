# NEXT_SESSION_BRIEF — Stand nach 2026-07-24

Kontext zuerst lesen: `data-pipeline/docs/SPRINT_5_12_13_SUMMARY.md` ·
`data-pipeline/docs/EL_HISTORY_BACKFILL_RUNBOOK.md` (inkl. Ergebnis-Block) ·
`docs/SITE_COPY_MAP.md`. Frontend: `frontend/src/App.jsx` (eine Datei, ~15.9k Zeilen).

## Erledigt am 2026-07-24 (alles committed + gepusht)

1. **Zwei-Lens-IA**: Top-Level NBA Draft | International Recruiting, Hash
   `lens=recruiting`, lens-abhängiger Player-Hero (`RecruitingHeroCard`),
   Recruiting Board gleichrangig (voller Pool).
2. **Draft Room** (NBA-Lens): 2–3 Spieler, Kurven-Overlay auf einer Peak-WA-Achse
   (`pwaBoardMixture`, gleiche Engine), Tier-Odds, Boosters/Limiters,
   Win-Now/Balanced/Rebuild-Empfehlung. Einstieg via ⚔ auf **allen** Board-Views;
   Auswahl als `room=<slugs>` im Hash (teilbar, überlebt Player-Abstecher —
   `lens=`/`room=` sind getrennte Hash-Params, nie den Ganz-Hash ersetzen!).
3. **Watchlist** (Recruiting-Lens): ★-Buttons, localStorage
   (`prospecttheory_recruiting_watchlist_v1`), eigene Ansicht. Design-Regeln:
   NBA-Locks bleiben in der Watchlist SICHTBAR (Flight-Risk-Monitoring);
   vom Jahrgangsfilter verdeckte Einträge werden als Fußzeile gelistet.
4. **Six-Factor-Experiment**: OOS-Test (scripts/validate_six_factors.py):
   4F offense-only R²≈0, 6F positiv, made-NBA-AUC 0.708→0.779, FTr redundant.
   UI-Umbau gebaut, auf User-Entscheid **revertiert** (BLK% ≠ Shot Suppression —
   Label überdehnt). Skript + Befund bleiben; Wiederaufnahme nur mit ehrlichem
   Labeling ("Defensive Activity") und nur auf User-Wunsch.
5. **EL-Anker (Pipeline)**: Backfill 2016–2026 für EL + Wettbewerbe + 10 Top-
   Domestic (301 Jobs, 0 Fails, 83k Rows, 47 min — Klick-Pagination ist schnell).
   Zweite Drift-Falle gefunden+gefixt: Gewichts-Skala komprimierte (EL 1.149 <
   statischer Kohorten-Kante 1.20) → Top-Kohorten-Kante jetzt DYNAMISCH aus der
   größten Leiter-Lücke (Commit 4caacc9). Endstand: **Tier 4 = p25 von N=538
   EL-Stammspielern, EuroLg-Disc +0.303** (vorher +0.226). Kanten in
   unified_board_scores.csv — live erst nach nächstem Refresh.

## Nächste Session — Reihenfolge

1. **Sicht-Checks live** (nach Sonntagslauf So 03:00, der die neuen Kanten
   deployt): Recruiting Board (Projected Levels/Value ▲ verschieben sich — ganze
   Leiter neu, ACB jetzt 1.011) · Watchlist-Flow · Draft-Room-Deep-Link
   (URL kopieren → neuer Tab → Auswahl kommt wieder) · Lens-Hero.
2. **Sonntagsläufe beobachten** (2–3 saubere Läufe) → `--deploy` scharfschalten.
3. **ANGT-Scrape + Scouting-Lane** (größtes offenes Feature): YOUTH_LEAGUES
   (20 Ligen) liegen bereit via `--include-youth`; fehlt: Lane ins Produkt
   (U18-Sichtbarkeit vor Senior-Debüt). Eigene Session einplanen.
4. Kleinvieh: G-League-Historie (URL-Discovery, 404-Problem von April) ·
   R2 aktivieren (braucht Cloudflare-Account, Code liegt bereit).

## Geparkt (bewusst, nicht vergessen)

- Tier-3/4-Trennschärfe: Korridor ist schmal (Kanten 1.011 vs. 1.031, Blend-
  Verwässerung durch Domestic-Minuten der EL-Spieler). Nur anfassen, falls
  OOT-Disc kippt; Hebel: Kohorten-peak3 nur über Top-Wettbewerb-Saisons.
- Six Factors v2 (ehrliches Labeling) · EL-Historie vor 2016 · intl TIER_REP
  (1.26-Repräsentant liegt über EL-Gewicht 1.149 — Value-▲-Skala leicht
  gestaucht, Ranking unberührt; bei Gelegenheit datengetrieben ableiten).

## Arbeits-Setup (Fallen)

- Verify: `npx esbuild App.jsx --bundle --loader:.jsx=jsx --jsx=automatic
  --external:react --external:react/jsx-runtime --external:recharts
  --external:react-dom --outfile=/dev/null` + NUL-Byte-Check.
- Git-Push macht immer der User am Host.
- Sichtbare Copy: Englisch, keine Sprint-Marker, keine Refresh-Zahlen hardcoden;
  neue Elemente → beide Erklärstellen im selben Commit (SITE_COPY_MAP).
- Cloud-Session: Staging-Kopien gleicher Pfade können auf alte Snapshots
  zurückfallen — bei Zweifel Datei am Host unter neuem Namen kopieren und
  diese stagen (Byte-Größe gegen Host prüfen).
