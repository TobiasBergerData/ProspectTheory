# Risk Profile Tab — Geparkter Stand (2026-06-04)

**Status:** Tab aus Frontend-Navigation entfernt, Code-Plumbing bleibt.
**Anlass:** Methodische Issues nach Pod-State-Rollback machen das Tab in der aktuellen Form irreführend. Vor einem Re-Enable müssen die offenen Punkte sauber gelöst werden.

---

## Was war im Risk-Tab

Der Tab adressierte vier Front-Office-Fragen pro Spieler:

1. **Market Range** — wo wird der Spieler real gepickt (Consensus-Anchor → p20/p50/p80 Pick-Band, basierend auf historischer Mock→Pick-Map 2008–2018)
2. **Merit Slot** — wo gehört er hin nach Wert (ev_added_wins → isotonisch auf realized peak Wins Added Scale, dann gegen E[peak WA | pick] der reifen Drafts)
3. **Bust Risk / Star Upside** — zwei kalibrierte Risiko-Achsen aus kernel-gewichteter Comp-Distribution
4. **Steal/Bust-Verdict** — `gap = Consensus − Merit`, mit historisch validierter ~70% Hit-Rate

**Datenfluss:**
```
data-pipeline/scripts/draft_risk_model.py      → draft_risk_all.csv
data-pipeline/scripts/draft_range_model.py     → market_pXX columns
data-pipeline/scripts/nba_transition.py        → nba_role_projection_all.csv
data-pipeline/scripts/02j_combine_projection.py + 02i → added_wins_projection.csv

backend/inject_draft_risk.py                   → profile.riskProfile.{consensus,meritSlot,marketPXX,bustRisk,starUpside,...}
backend/inject_nba_role.py                     → profile.nbaRoleProjection
backend/inject_added_wins.py                   → profile.addedWins.{ev, projTier, tierProbs, ...}

frontend/src/App.jsx::RiskProfileTab           → Tab-Body (function bleibt definiert, nicht mehr gerendert)
```

---

## Warum geparkt — drei offene Methodik-Issues

### Issue 1 — merit_slot 15.9-Cap-Cluster

**Symptom:** Im Pod-State (`draft_risk_all.csv` aus ed4893e) clippen alle Top-pWA Spieler auf `merit_slot = 1.0`, alle moderate-pWA-Spieler auf `merit_slot = 15.9`. Das ergibt einen Cluster wo Peterson, Wagler, Burries, Acuff, Ament alle exakt 15.9 haben — keine Differenzierung innerhalb der Tier.

**Konsequenz:** Steal/Bust-Gap überzeichnet die Bust-Calls für Cap-Cluster-Spieler. Eine Pod-Aussage wie "Wagler ist ⚠⚠ MAJOR BUST gap −10.9" ist methodisch unsauber, weil die merit_slot 15.9 ein Default-Cap ist, nicht eine echte Modell-Aussage über Wagler's Tier.

**Fix-Skizze:**
`data-pipeline/scripts/draft_range_model.py:419-420` — Funktion `ppwa_to_slot()` mit Cap auf historisches Maximum. Tobias' bereits geschriebener Fix `apply_merit_rank_in_class.py` (lokal im Mount, Task #40) ersetzt das durch rank-in-class:

```python
# OLD (was im Pod-State CSV ist):
cur["merit_slot"] = cur.merit_value.map(lambda v: value_to_slot(grid, curve, v))
# → All Top-ppwa → 1.0, all moderate → 15.9

# NEW (rank-in-class):
cur_sorted = cur.sort_values("projected_war", ascending=False)
cur_sorted["merit_slot"] = range(1, len(cur_sorted) + 1)
# → Boozer 1, Flemings 2, Wilson 3, ... clean rank
```

### Issue 2 — Consensus-Daten Sync

**Symptom:** Die `consensus` Spalte in `draft_risk_all.csv` und `consensus_rank` in `added_wins_projection.csv` waren zwischen Pod-State (ed4893e, Stand vor 2026-03-13 RookieScale-Import) und aktuellem RookieScale (2026-06-01 Update) signifikant verschoben:

| Spieler   | ed4893e Cons | RookieScale 2026-06-01 |
|-----------|-------------:|-----------------------:|
| Wagler    | 9            | 5                      |
| Mara      | 72           | 11                     |
| Flemings  | 4            | 8                      |
| Brown Jr. | 6            | 6                      |

**Konsequenz:** Steal/Bust-Aussagen aus dem Pod sind nicht mit dem aktuellen Markt vergleichbar. Eine Aussage wie "Mara ist MEGA-Steal Cons #72 → Merit #5" stimmt nicht mehr — er ist jetzt Cons #11.

**Fix-Skizze:**
Tobias' bereits geschriebener Patch `apply_rookiescale_consensus_overlay.py` (lokal im Mount, Commit 1b82efe, NICHT gepusht) injiziert RookieScale 2026-06-01 Ranks direkt in die CSVs. Re-Enable-Path:

1. Sicherstellen dass Issue 1 (merit_slot) zuerst gefixt ist
2. RookieScale-Overlay auf aktuellsten Stand bringen (oder per Pipeline-Re-Run automatisieren)
3. Frontend-Source-Marker auf neuen Import-Datum updaten

### Issue 3 — Partial Re-Run Inconsistency

**Symptom:** Eine Pipeline-Re-Run am 2026-06-04 hat nur 3 von 7 relevanten CSVs aktualisiert. `nba_transition.py` ist beim qcut-Schritt gecrashed (Bin-Label-Mismatch), Subsequent-Scripts `02j_combine_projection.py`, `draft_range_model.py`, `11_compress_for_deploy.py` sind nicht durchgelaufen.

**Resultat:** Mismatch zwischen den 3 Sub-Outputs (Jun 4) und den 4 End-Outputs (Jun 3). Plus: Schema-Drift im neuen `nba_peak_wins_added.csv` (peak_impact + peak_prod fehlen, dafür method + player_name_clean) lässt nachfolgende Scripts crashen.

**Fix-Skizze:**
1. qcut-fix in `nba_transition.py` ist applied (Task #41)
2. Schema-Differenz behandeln — entweder downstream-scripts an neues Schema anpassen oder peak_impact/peak_prod rückwirkend ergänzen
3. Voll-Pipeline-Re-Run starten:
   ```bash
   python scripts/nba_transition.py
   python scripts/02j_combine_projection.py
   python scripts/draft_range_model.py
   python scripts/draft_risk_model.py
   python scripts/11_compress_for_deploy.py
   ```
4. Backend-CSVs kopieren, deploy

---

## Was im Code/Backend bleibt (Re-Enable-fähig)

### Frontend (App.jsx — als geparkt markiert)
- `function RiskProfileTab({p})` ab Z. 6972 — komplette Tab-Body bleibt
- `RiskBar` Helper-Komponente bleibt
- `profile.riskProfile` mapping in mapProfile() Z. 1590 bleibt
- TABS-Eintrag Z. 9108 nur auskommentiert
- Tab-Render Z. 9742 nur auskommentiert

### Backend (weiter aktiv im Build)
- `inject_draft_risk.py` — wird weiter beim Render-Build ausgeführt (Daten kommen ins SQLite, werden nur nicht angezeigt)
- `inject_nba_role.py` — dito
- `inject_added_wins.py` — kritisch! Wird für `addedWins.ev` auf dem Big Board genutzt (Sort-Größe)
- CSVs in `backend/data/processed/` bleiben

### Data-Pipeline (intakt)
- `draft_risk_model.py`, `draft_range_model.py`, `nba_transition.py`, `02f→02i` Scripts bleiben
- `apply_merit_rank_in_class.py` (Fix-Patch, lokal, ungepusht)
- `apply_rookiescale_consensus_overlay.py` (lokal, ungepusht)
- `fix_nba_transition_qcut.py` (applied)

---

## Re-Enable Checklist

Wenn das Tab wieder live gehen soll:

```
□ Issue 1: rank-in-class merit_slot Fix in draft_range_model.py einbringen
  → apply_merit_rank_in_class.py durchführen + voll-Pipeline-Re-Run

□ Issue 3: nba_transition Schema-Drift cleanen (peak_impact/peak_prod)
  → entweder downstream anpassen oder Schema rückwirkend ergänzen

□ Voll-Pipeline-Re-Run mit aktuellem Consensus-Snapshot:
  → python scripts/nba_transition.py
  → python scripts/02j_combine_projection.py
  → python scripts/draft_range_model.py
  → python scripts/draft_risk_model.py
  → python scripts/11_compress_for_deploy.py

□ Validation: Top 15 2026er gap-Verteilung prüfen (keine Cap-Cluster mehr)

□ Frontend re-enable:
  → App.jsx Z. 9108: TABS-Eintrag entkommentieren
  → App.jsx Z. 9742: Tab-Render entkommentieren

□ Source-Marker im Risk-Tab auf aktuellen Import-Datum aktualisieren

□ E2E-Test: 5 verschiedene Profile öffnen, Steal/Bust-Verdict prüfen
```

---

## Pod-Status & lokale Commits (Stand 2026-06-04)

**Live im Render-Service (gepusht):**
- `f448f2b` revert(profile-data): Pod-State Profile-JSONs (Pillars/Roles/Archetypes auf ed4893e)
- `37bca05` revert(risk-data): Risk-CSVs auf ed4893e

**Lokal im Mount (NICHT gepusht, Tobias' Entscheidung):**
- `1b82efe` data(consensus): RookieScale 2026-06-01 Overlay auf Pod-State Risk-Daten

**Konsequenz für 1b82efe:**
Bei aktuellem Park-Status des Risk-Tabs ist 1b82efe effektiv ein No-Op im Frontend (consensus/consensus_rank werden nicht angezeigt). Drei Optionen:
1. `git revert 1b82efe` lokal → linear log, kein Branch-Müll
2. `git push` mit 1b82efe → Daten bleiben latent für späteren Re-Enable
3. `git reset 1b82efe^` → discardet den Commit komplett (zerstörerisch)

**Empfehlung:** Option 2 — der Commit ist methodisch korrekt und kann bei Re-Enable als "letzter applied state" dienen. Aufwand → 0.

---

## Methodische Note

Das Risk-Tab-Konzept selbst ist solide (historische Modell-Validation: 69% Steal-Hit-Rate, 70% Bust-Hit-Rate auf 421 reifen Klassen). Was geparkt wird ist nicht die Idee, sondern die **aktuelle Daten-Lage** mit ihren Kalibrierungs-Issues.

Für die Pod-Vorbereitung selbst nutzbar: Direkt-Berechnung aus `ev_added_wins`-Rank (Pod-Sort im Big Board) gegen RookieScale 2026-06-01 — saubere Methodik ohne den 15.9-Cap. Siehe Pod-Steal/Bust-Tabelle (siehe Verlauf).

---

**Autor:** Tobias + Claude · 2026-06-04
**Verwandte Tasks:** #39, #40, #41, #42, #43, #44, #46
