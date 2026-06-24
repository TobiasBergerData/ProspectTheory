"""
export_outcome_comps_static.py — Sprint-5.4 architecture
=========================================================
Reads the comp-outcomes sidecar from data/processed/comp_outcomes_all.json.gz
and writes one tiny JSON per prospect into data/processed/static/outcome_comps/.

The /api/outcome_comps/{slug} endpoint serves these directly via FileResponse:
zero DB-hit, zero SQLAlchemy overhead, browser- and CDN-cacheable per slug.

Idempotent: re-running clears the directory first. Build-step in build.sh
runs this AFTER inject_draft_risk.py.
"""
import gzip
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent  # backend/
SRC = BASE / "data" / "processed" / "comp_outcomes_all.json.gz"
OUT_DIR = BASE / "data" / "processed" / "static" / "outcome_comps"


def main() -> int:
    if not SRC.exists():
        print(f"[export_outcome_comps] ERROR: {SRC} not found")
        return 1
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # Clear any stale files from previous runs (idempotent rebuild)
    cleared = 0
    for old in OUT_DIR.glob("*.json"):
        old.unlink()
        cleared += 1
    if cleared:
        print(f"[export_outcome_comps] Cleared {cleared:,} stale files")

    print(f"[export_outcome_comps] Loading {SRC.name} ...")
    with gzip.open(SRC, "rt", encoding="utf-8") as fh:
        data = json.load(fh)
    outcomes = data.get("comp_outcomes", {})
    meta = data.get("meta", {})
    print(f"[export_outcome_comps] {len(outcomes):,} prospects in sidecar")

    written = 0
    skipped = 0
    for slug, block in outcomes.items():
        if not slug:
            skipped += 1
            continue
        out_path = OUT_DIR / f"{slug}.json"
        payload = {
            "schema_version": meta.get("schema_version", 1),
            "k_top":          meta.get("k_top"),
            "comps":          block,
        }
        out_path.write_text(json.dumps(payload, separators=(",", ":")))
        written += 1
        if written % 5000 == 0:
            print(f"  ... {written:,} files written")

    total_size_mb = sum(p.stat().st_size for p in OUT_DIR.glob("*.json")) / 1e6
    print(f"[export_outcome_comps] Done. {written:,} files "
          f"({total_size_mb:.1f} MB on disk), skipped {skipped}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())