#!/usr/bin/env python3
"""
fetch_artifacts.py — Boot-Download der Daten-Artefakte aus Object Storage.
==========================================================================
Gegenstück zu data-pipeline/scripts/upload_artifacts_r2.py (Architektur-Stufe 2).

VERHALTEN
  - Sind R2_* Env-Variablen gesetzt: lädt latest/* aus dem Bucket nach
    data/processed/ (mit SHA256-Verifikation gegen das Manifest) und
    ÜBERSCHREIBT die im Repo mitgelieferten Artefakte.
  - Fehlen die Env-Variablen: no-op mit Hinweis — Repo-Artefakte bleiben
    maßgeblich (heutiger Zustand). Dadurch ist das Skript gefahrlos in den
    Build einhängbar, BEVOR der Bucket existiert.

AKTIVIERUNG (nach R2-Setup + erfolgreichem Upload-Test):
  render.yaml buildCommand um `python backend/fetch_artifacts.py &&` vor dem
  build_db-Schritt ergänzen und die R2_* Variablen als Render-Env hinterlegen.
  Danach können die gz-Artefakte aus dem Git-Repo entfernt werden.

Benötigt: boto3 (in requirements.txt ergänzen, sobald aktiviert).
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent / "data" / "processed"


def main() -> int:
    missing = [k for k in ("R2_ENDPOINT", "R2_KEY", "R2_SECRET", "R2_BUCKET")
               if not os.environ.get(k)]
    if missing:
        print(f"[fetch_artifacts] R2 nicht konfiguriert ({missing}) — "
              "nutze Repo-Artefakte (no-op).")
        return 0
    import boto3  # erst hier: nur nötig, wenn R2 aktiv ist
    s3 = boto3.client("s3", endpoint_url=os.environ["R2_ENDPOINT"],
                      aws_access_key_id=os.environ["R2_KEY"],
                      aws_secret_access_key=os.environ["R2_SECRET"])
    bucket = os.environ["R2_BUCKET"]
    man = json.loads(s3.get_object(Bucket=bucket, Key="latest/manifest.json")["Body"].read())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[fetch_artifacts] Manifest vom {man.get('uploaded_at_utc')} — "
          f"{len(man['files'])} Dateien")
    for entry in man["files"]:
        body = s3.get_object(Bucket=bucket, Key=f"latest/{entry['name']}")["Body"].read()
        sha = hashlib.sha256(body).hexdigest()
        if sha != entry["sha256"]:
            print(f"[FATAL] SHA256-Mismatch bei {entry['name']} — Abbruch (kein Deploy "
                  "mit korrupten Daten).")
            return 1
        (DATA_DIR / entry["name"]).write_bytes(body)
        print(f"  ↓ {entry['name']} ({len(body)/1e6:.1f} MB, sha ok)")
    print("✓ Artefakte aus R2 geladen — build_db.py kann bauen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
