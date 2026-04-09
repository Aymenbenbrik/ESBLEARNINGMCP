"""
TunBERT Service — Tunisian Arabic understanding for the AI assistant.

Uses the tunis-ai/TunBERT model to:
1. Enhance Tunisian dialect detection (combined with keyword-based approach)
2. Classify educational intent from Tunisian input
3. Generate semantic context to enrich prompts sent to Gemini

Architecture:
  - Lazy-loaded singleton (440 MB model, loaded once on first use)
  - BertModel loaded with remapped keys (TunBERT uses "BertModel." prefix)
  - Intent classification via cosine similarity to anchor embeddings
"""

import os
import logging
import torch
import torch.nn.functional as F
from typing import Optional

logger = logging.getLogger(__name__)

# ── Singleton holder ──────────────────────────────────────────────────────────

_tunbert_model = None
_tunbert_tokenizer = None
_intent_anchors = None  # Precomputed intent embeddings
_loaded = False


def _ensure_loaded():
    """Lazy-load TunBERT model and precompute intent anchors."""
    global _tunbert_model, _tunbert_tokenizer, _intent_anchors, _loaded

    if _loaded:
        return _tunbert_model is not None

    _loaded = True  # Mark attempted even if it fails

    try:
        from transformers import BertModel, BertConfig, AutoTokenizer
        from safetensors.torch import load_file

        logger.info("Loading TunBERT model (first-time initialization)...")

        # Load config and patch missing BERT attributes
        config = BertConfig.from_pretrained("tunis-ai/TunBERT")
        config.is_decoder = False

        # Find safetensors file in HuggingFace cache
        cache_root = os.path.expanduser(
            "~/.cache/huggingface/hub/models--tunis-ai--TunBERT"
        )
        st_path = None
        for root, _dirs, files in os.walk(cache_root):
            for f in files:
                if f.endswith(".safetensors"):
                    st_path = os.path.join(root, f)
                    break
            if st_path:
                break

        if not st_path:
            logger.warning(
                "TunBERT safetensors not found in cache. "
                "Run: python -c \"from transformers import AutoTokenizer; "
                "AutoTokenizer.from_pretrained('tunis-ai/TunBERT', trust_remote_code=True)\" "
                "to download the model first."
            )
            return False

        # Load raw state dict and remap keys (strip "BertModel." prefix)
        raw = load_file(st_path)
        remap = {
            k[len("BertModel."):]: v
            for k, v in raw.items()
            if k.startswith("BertModel.")
        }

        model = BertModel(config)
        model.load_state_dict(remap, strict=False)
        model.eval()

        _tunbert_model = model
        _tunbert_tokenizer = AutoTokenizer.from_pretrained(
            "tunis-ai/TunBERT", trust_remote_code=True
        )

        # Precompute intent anchor embeddings
        _intent_anchors = _precompute_anchors()

        logger.info(
            f"TunBERT loaded: hidden={config.hidden_size}, "
            f"intents={len(_intent_anchors)}"
        )
        return True

    except Exception as e:
        logger.warning(f"TunBERT loading failed (non-critical): {e}")
        _tunbert_model = None
        _tunbert_tokenizer = None
        _intent_anchors = None
        return False


# ── Intent anchor definitions ─────────────────────────────────────────────────

# Anchors in Tunisian transliteration covering common educational intents
_INTENT_DEFINITIONS = {
    "ask_courses": {
        "description_fr": "L'étudiant demande des informations sur ses cours",
        "description_en": "Student asking about their courses",
        "anchors": [
            "chnou el cours mte3i",
            "les cours win houma",
            "cours mte3i lyoum",
            "arani na9ra fih",
            "el cours mte3 el informatique",
            "fama cours lyoum",
            "a3tini el cours eli na9ra fihom",
        ],
    },
    "ask_grades": {
        "description_fr": "L'étudiant demande ses notes ou résultats",
        "description_en": "Student asking about grades/results",
        "anchors": [
            "chnou el notes mte3i",
            "a3tini el notes",
            "chkoun el moyennes",
            "notes mte3 el math",
            "el notes mtei kif",
            "resultat mte3i",
            "3andi note mleh walla le",
        ],
    },
    "ask_schedule": {
        "description_fr": "L'étudiant demande le calendrier ou les horaires",
        "description_en": "Student asking about schedule/calendar",
        "anchors": [
            "wakteh el exam",
            "chnou el emploi",
            "el planning mte3i",
            "wakteh el controle",
            "wakteh el DS el jey",
            "fama exam lyoum",
            "el emploi mte3 el jom3a hedhi",
        ],
    },
    "ask_recommendations": {
        "description_fr": "L'étudiant demande des conseils ou des exercices",
        "description_en": "Student asking for study recommendations",
        "anchors": [
            "chnou lazem na9ra",
            "a3tini conseil",
            "kifech nethasn",
            "chnou el exercises",
            "a3tini exercises bech netmarenn",
            "lazem ndirr revision",
            "sa3edni bech nfhem",
        ],
    },
    "ask_performance": {
        "description_fr": "L'étudiant demande son niveau ou sa progression",
        "description_en": "Student asking about performance/progress",
        "anchors": [
            "kif niveau mte3i",
            "ena mleh walla le",
            "el progression mte3i",
            "chnou el competences eli na9es fihom",
            "ena fi danger walla le",
            "kifech na9ra",
            "el performance mte3i kif",
        ],
    },
    "greeting": {
        "description_fr": "Salutation en dialecte tunisien",
        "description_en": "Tunisian greeting",
        "anchors": [
            "ahla bik",
            "salam",
            "ya3tik essa7a",
            "labess 3lik",
            "aaslema",
            "ahla sahbi",
            "salam 3likom",
        ],
    },
    "ask_help": {
        "description_fr": "L'étudiant demande de l'aide sur l'utilisation",
        "description_en": "Student asking for help/how to use",
        "anchors": [
            "3awni",
            "ma fhemtech",
            "chnou ta3mel",
            "ki nesta3mel",
            "chnou tnajem dirl",
            "kifech nkhdm bik",
            "sa3edni brabi",
        ],
    },
    "teacher_at_risk": {
        "description_fr": "L'enseignant demande les étudiants en danger",
        "description_en": "Teacher asking about at-risk students",
        "anchors": [
            "chkoun el talaba fi danger",
            "el talaba el dh3af",
            "chkoun maandouch notes mleh",
            "fama talaba fi mochkol",
            "el etudiants eli lazem yethas9nou",
        ],
    },
    "teacher_class_performance": {
        "description_fr": "L'enseignant demande la performance de la classe",
        "description_en": "Teacher asking about class performance",
        "anchors": [
            "kif el classe",
            "la performance mte3 el classe",
            "el moyenne mte3 el talaba",
            "kif niveau el classe",
            "el resultats mte3 el groupe",
        ],
    },
}


def _precompute_anchors() -> dict:
    """Precompute mean embeddings for each intent's anchors."""
    if _tunbert_model is None or _tunbert_tokenizer is None:
        return {}

    anchors = {}
    for intent_name, intent_data in _INTENT_DEFINITIONS.items():
        embs = []
        for text in intent_data["anchors"]:
            emb = _embed_text(text)
            if emb is not None:
                embs.append(emb)
        if embs:
            anchors[intent_name] = {
                "embedding": torch.cat(embs).mean(0, keepdim=True),
                "description_fr": intent_data["description_fr"],
                "description_en": intent_data["description_en"],
            }
    return anchors


def _embed_text(text: str) -> Optional[torch.Tensor]:
    """Get CLS embedding for a text using TunBERT."""
    if _tunbert_model is None or _tunbert_tokenizer is None:
        return None

    try:
        inputs = _tunbert_tokenizer(
            text,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=128,
        )
        with torch.no_grad():
            outputs = _tunbert_model(**inputs)
        return outputs.last_hidden_state[:, 0, :]  # CLS token
    except Exception as e:
        logger.debug(f"TunBERT embedding error for '{text}': {e}")
        return None


# ── Public API ────────────────────────────────────────────────────────────────


def classify_tunisian_intent(text: str, top_k: int = 3) -> list[dict]:
    """
    Classify the educational intent of Tunisian dialect text.

    Returns top_k intent matches with confidence scores.

    Example:
        >>> classify_tunisian_intent("chnou el notes mte3i")
        [
            {"intent": "ask_grades", "confidence": 0.92, "description": "L'étudiant demande ses notes"},
            {"intent": "ask_courses", "confidence": 0.78, "description": "L'étudiant demande ses cours"},
            ...
        ]
    """
    if not _ensure_loaded() or not _intent_anchors:
        return []

    emb = _embed_text(text)
    if emb is None:
        return []

    results = []
    for intent_name, data in _intent_anchors.items():
        sim = F.cosine_similarity(emb, data["embedding"]).item()
        results.append({
            "intent": intent_name,
            "confidence": round(sim, 4),
            "description_fr": data["description_fr"],
            "description_en": data["description_en"],
        })

    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results[:top_k]


def enhance_tunisian_prompt(text: str, language: str = "tn") -> str:
    """
    Generate enrichment context for Tunisian text to add to the LLM prompt.

    When the user writes in Tunisian dialect, this function analyzes the text
    and provides semantic hints that help Gemini understand and respond better.

    Returns an empty string if TunBERT is not available or text is not Tunisian.
    """
    if language != "tn":
        return ""

    intents = classify_tunisian_intent(text, top_k=2)
    if not intents:
        return ""

    top = intents[0]
    if top["confidence"] < 0.75:
        return ""

    # Build enrichment context
    lines = [
        "[TunBERT Analysis]",
        f"Tunisian dialect detected. Semantic analysis:",
        f"- Primary intent: {top['description_fr']} (confidence: {top['confidence']:.0%})",
    ]

    if len(intents) > 1 and intents[1]["confidence"] > 0.70:
        lines.append(
            f"- Secondary intent: {intents[1]['description_fr']} "
            f"(confidence: {intents[1]['confidence']:.0%})"
        )

    # Map intents to tool hints
    tool_hints = {
        "ask_courses": "Use get_my_courses tool",
        "ask_grades": "Use get_my_grades_summary tool",
        "ask_schedule": "Use get_calendar_activities tool",
        "ask_recommendations": "Use get_recommendations tool",
        "ask_performance": "Use get_my_performance tool",
        "greeting": "Respond warmly in Tunisian dialect",
        "ask_help": "Explain available features in Tunisian",
        "teacher_at_risk": "Use get_at_risk_students tool",
        "teacher_class_performance": "Use get_class_performance tool",
    }

    hint = tool_hints.get(top["intent"])
    if hint:
        lines.append(f"- Suggested action: {hint}")

    return "\n".join(lines)


def get_tunbert_status() -> dict:
    """Return the status of TunBERT model (for health checks / debugging)."""
    _ensure_loaded()
    loaded = _tunbert_model is not None
    return {
        "loaded": loaded,
        "model": "tunis-ai/TunBERT" if loaded else None,
        "hidden_size": 768 if loaded else None,
        "num_intents": len(_intent_anchors) if _intent_anchors else 0,
        "intent_names": list(_intent_anchors.keys()) if _intent_anchors else [],
    }
