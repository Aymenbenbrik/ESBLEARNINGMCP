"""AAP (Acquis d'Apprentissage du Programme) definitions.

The official program outcome descriptions vary by program.
This file provides placeholders so the UI can always display
"AAPx — description" even if the official reference document
has not yet been integrated.

Replace the placeholder text with your official AAP descriptions
when available.
"""

from __future__ import annotations


DEFAULT_AAP_DEFINITIONS: dict[int, str] = {
    1: "Description AAP1 à compléter (référence officielle).",
    2: "Description AAP2 à compléter (référence officielle).",
    3: "Description AAP3 à compléter (référence officielle).",
    4: "Description AAP4 à compléter (référence officielle).",
    5: "Description AAP5 à compléter (référence officielle).",
    6: "Description AAP6 à compléter (référence officielle).",
    7: "Description AAP7 à compléter (référence officielle).",
    8: "Description AAP8 à compléter (référence officielle).",
    9: "Description AAP9 à compléter (référence officielle).",
    10: "Description AAP10 à compléter (référence officielle).",
    11: "Description AAP11 à compléter (référence officielle).",
    12: "Description AAP12 à compléter (référence officielle).",
}


def get_aap_label(num: int) -> str:
    """Return a display label for an AAP number."""
    desc = DEFAULT_AAP_DEFINITIONS.get(int(num), "Description à compléter (référence officielle).")
    return f"AAP{int(num)} — {desc}"
