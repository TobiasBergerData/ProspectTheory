# ADR-001: Polyrepo Architecture (Pipeline + Web)

**Status:** Accepted (2026-06-12)
**Decision-Owner:** Tobias

## Context

ProspectTheory besteht aus zwei substanziellen Komponenten mit unterschiedlichen
Compute-Profilen, Deploy-Kadenzen und Konsumenten:

- **Data-Pipeline:** ML-Training, Statistical Modeling, Pipeline-Stages.
  Läuft lokal/on-demand. Output: pre-computed JSON/CSV artifacts.
- **Web-Service (Backend + Frontend):** FastAPI-Service auf Render Free-Tier.
  Konsumiert die Pipeline-Outputs. Continuous Deploy via Git-Push.

Beide haben heute eigene Git-Repos (data-pipeline lokal-only ohne Remote,
prospecttheory-web auf GitHub mit Render-Auto-Deploy). Die Frage ist, ob
das so bleibt oder konsolidiert wird.

## Considered Alternatives

### Option A: Monorepo (alles in einem Git-Repo)

Vorteile:
- Atomic Commits über Pipeline-Output-Schema + Backend-API-Field + Frontend
- Single Source of Truth
- Disaster Recovery: ein Clone bringt alles zurück
- Cross-Cutting Code-Reviews

Nachteile:
- Pipeline-Code wird gegen Web-CI/CD-Gates aufgewogen (slow)
- Render-Build muss ein Sub-Folder Root Directory haben — komplexer Setup
- Repository wird groß (~200 MB Roh-Daten)
- Pipeline und Web haben unterschiedliche Compute-Anforderungen — Monorepo
  vermischt das

### Option B: Polyrepo (Status Quo)

Vorteile:
- Klare Domain-Separation
- Eigene CI/CD pro Repo, eigene Deploy-Kadenzen
- Render-Setup simpel (Root Directory leer/backend)
- Industry-Standard für ML-Production (MLOps best practice)

Nachteile:
- Cross-Cutting Changes benötigen zwei Commits in zwei Repos
- Risiko von Schema-Drift zwischen Pipeline-Output und Backend-Erwartung
- Disaster Recovery: zwei Clones nötig

### Option C: Multi-Repo mit Shared-Schema-Package

Plus ein drittes Repo `prospecttheory-shared` mit JSON-Schemas, Python-Types,
TypeScript-Types — beide Hauptrepos importieren das als versioned dependency.

Vorteile von B + Schema-Drift verhindert.
Nachteile: mehr CI/CD-Komplexität, dritter Repo zu pflegen.

## Decision

**Option B (Polyrepo)** für jetzt, mit klarem Pfad zu Option C wenn Schema-Drift
ein konkretes Problem wird.

Begründung:
1. **Industry-Standard**: Top ML-Production-Teams (Meta FAIR, Google DeepMind,
   OpenAI) nutzen Polyrepo mit Domain-Separation. Monorepo ist Common bei
   reinen Web-Stacks (FAANG-style), nicht bei ML-Pipelines mit großen
   Roh-Daten und unterschiedlichen Compute-Profilen.

2. **Disaster Recovery Mitigation**: Die heutige Index-Korruption-Krise
   (Sprint-Recovery vor 12h) ist behebbar mit GitHub-Push beider Repos
   plus GitHub-Action zur Index-Drift-Detection (Task #62). Nicht Monorepo
   nötig.

3. **Schema-Drift Mitigation**: Wenn das ein Problem wird, eskalieren zu
   Option C. Bis dahin: Sprint-Design-Docs als Source-of-Truth für
   Schema-Contract (siehe SPRINT_3_0_DESIGN.md).

4. **Render-Compatibility**: Polyrepo ist bereits Render-funktional, kein
   Migration-Risiko.

## Consequences

### Setup-Requirements (zwingend)

1. **data-pipeline Repo braucht GitHub-Remote**.
   Aktuell lokal-only → muss Push haben für Disaster-Recovery.
2. **GitHub Action für Index-Drift-Detection** (Task #62) in beiden Repos.
3. **METHODS_DICT.md + ARCHITECTURE.md** liegen in `prospecttheory-web/docs/`
   als System-Overview-Layer. Pipeline-spezifische Doku in
   `data-pipeline/docs/` (zukünftig).

### Konsequenzen für Sprint-Workflow

Cross-Cutting Changes (z.B. neues Field in pipeline-output, das im Backend
durchreicht und im Frontend angezeigt wird) erfordern **zwei Commits in
zwei Repos**, koordinated via Sprint-Design-Doc.

Dokumentations-Standard: jedes neue Pipeline-Output-Field bekommt einen
Eintrag in METHODS_DICT.md mit Klausel "Wird konsumiert von: backend/main.py
field xyz; frontend/App.jsx field abc".

### Re-Evaluation-Trigger

Diese ADR wird re-evaluiert wenn:
- ≥ 3 Schema-Drift-Incidents in einem Quartal (Pipeline-Output ≠
  Backend-Erwartung)
- Pipeline-Build wird >30 min und braucht eigene CI/CD die Monorepo-CI/CD
  zu langsam macht
- Team wächst über 1 Person hinaus (Monorepo skaliert besser für Team-Reviews)

## Implementation Notes (Sprint-3.0)

Konkrete Umsetzung dieser ADR:

1. **`prospecttheory-web/docs/`** etabliert als zentrale Doc-Sammlung.
   ARCHITECTURE.md + METHODS_DICT.md hier, Sprint-Logs in `sprints/`,
   ADRs in `ADR/`.

2. **`data-pipeline/` Repo**:
   - Push auf GitHub (`github.com/TobiasBergerData/ProspectTheory-Pipeline`)
   - .gitignore für `data/processed/` (transient outputs)
   - Git LFS für `data/raw/` Files >50 MB
   - eigenes `data-pipeline/README.md` mit Setup + Re-Run-Pointer

3. **GitHub Actions** in beiden Repos:
   - Index-Drift-Detector: pre-push hook check
   - sprint3_validate als pre-commit-Gate für pipeline-Repo
   - Build-Verification für web-Repo

4. **Cross-Repo Schema-Contract**:
   - `prospecttheory-web/docs/SCHEMA_CONTRACT.md` listet alle API-Felder
   - Pipeline-Output-Files MÜSSEN diese Felder produzieren
   - Backend MUSS diese Felder durchreichen
   - Jedes Field-Change erfordert SCHEMA_CONTRACT-Update
