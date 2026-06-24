#!/usr/bin/env python3
"""
name_utils.py — Einheitliche Spielernamen-Normalisierung für alle Inject-Skripte
================================================================================
Single source of truth für `norm_name()`. Vorher war die Funktion nur in
inject_mind_metrics.py inline definiert; inject_skill_curve.py / inject_ogbpm.py
nutzten exact-name matching → akzentuierte ("Luka Dončić") oder punktierte
("V.J. Edgecombe") Namen wurden nicht gefunden (Backlog 1.3).

Alle Inject-Skripte importieren `norm_name` von hier, damit Matching-Logik
nicht driftet. Läuft auf Render aus cwd=backend/ → Sibling-Import funktioniert.

Normalisierung (in Reihenfolge):
  1. Unicode NFKD-Zerlegung + Combining-Chars entfernen (é→e, č→c, ć→c)
  2. lowercase
  3. Punkte, Apostrophe entfernen; Bindestrich → Leerzeichen
  4. Mehrfach-Whitespace kollabieren + trimmen
  5. Suffixe (Jr./Sr./II/III/IV) entfernen

CAVEAT (Kollisionen): Die Normalisierung kann theoretisch zwei verschiedene
Spieler auf denselben Key abbilden (z.B. nach Suffix-Stripping). In der Praxis
selten; ogbpm keyed zusätzlich auf (name, year), was das Risiko weiter senkt.
"""
from __future__ import annotations
import re
import unicodedata

# Suffix-Stripping: " Jr.", " Sr.", " II", " III", " IV" am Namensende
SUFFIX_RX = re.compile(r"\s+(jr\.?|sr\.?|i+v?|ii+)\.?\s*$", re.IGNORECASE)


def norm_name(s) -> str:
    """Normalisiere einen Spielernamen für robustes Cross-Source-Matching.

    Input:  beliebiger String (oder Nicht-String → "").
    Output: normalisierter Name (lowercase, akzent-/punkt-frei, suffix-frei).
    """
    if not isinstance(s, str):
        return ""
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace(".", "").replace("'", "").replace('"', "").replace("-", " ")
    s = re.sub(r"\s+", " ", s).strip()
    s = SUFFIX_RX.sub("", s).strip()
    return s
