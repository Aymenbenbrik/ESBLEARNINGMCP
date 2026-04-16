"""
tests/test_prompt_quality.py — Automated prompt quality tests (golden dataset).

Tests the bloom-classifier skill against a labelled golden dataset of 20
educational questions that span all 6 Bloom taxonomy levels.  Each entry
has a known correct level; the test verifies that the skill's prediction
matches the expected level.

Run with:
    pytest tests/test_prompt_quality.py -v

The LLM is NOT mocked here — these are live integration tests that require
a valid GOOGLE_API_KEY in the environment.  Mark them with ``@pytest.mark.slow``
so they can be excluded from fast CI runs:

    pytest tests/test_prompt_quality.py -v -m "not slow"
"""
from __future__ import annotations

import pytest

# ── Golden dataset (20 items, all 6 Bloom levels) ────────────────────────────
# Each item: (content, expected_level, content_type)
# Levels: remember, understand, apply, analyze, evaluate, create

GOLDEN_DATASET = [
    # ── Remember (niveau 1) ──────────────────────────────────────────────
    (
        "Quelle est la définition d'un algorithme ?",
        "remember",
        "question",
    ),
    (
        "Citez les 4 piliers de la programmation orientée objet.",
        "remember",
        "question",
    ),
    (
        "Quel est le résultat de 2 ** 8 en Python ?",
        "remember",
        "question",
    ),
    # ── Understand (niveau 2) ────────────────────────────────────────────
    (
        "Expliquez dans vos propres mots la différence entre une liste et un tuple en Python.",
        "understand",
        "question",
    ),
    (
        "Décrivez le fonctionnement d'un algorithme de tri à bulles.",
        "understand",
        "question",
    ),
    (
        "Qu'est-ce que la récursivité ? Donnez un exemple conceptuel sans écrire de code.",
        "understand",
        "question",
    ),
    # ── Apply (niveau 3) ─────────────────────────────────────────────────
    (
        "Implémentez un algorithme de tri par insertion en Python "
        "et testez-le sur la liste [5, 3, 8, 1].",
        "apply",
        "exercise",
    ),
    (
        "Écrivez une fonction Python qui calcule la factorielle d'un entier par récursivité.",
        "apply",
        "exercise",
    ),
    (
        "Utilisez SQL pour récupérer les 5 étudiants ayant la meilleure moyenne "
        "dans la table 'grades'.",
        "apply",
        "exercise",
    ),
    # ── Analyze (niveau 4) ───────────────────────────────────────────────
    (
        "Étudiez le code Python suivant et identifiez pourquoi la complexité temporelle "
        "est O(n²) plutôt que O(n log n). Expliquez le goulot d'étranglement.",
        "analyze",
        "question",
    ),
    (
        "Analysez les causes de la fuite mémoire dans le programme C suivant "
        "et identifiez chaque allocation non libérée.",
        "analyze",
        "question",
    ),
    (
        "Décomposez l'architecture MVC en identifiant le rôle de chaque composant "
        "et les flux de données entre eux.",
        "analyze",
        "question",
    ),
    # ── Evaluate (niveau 5) ──────────────────────────────────────────────
    (
        "Comparez les algorithmes QuickSort et MergeSort et justifiez lequel choisir "
        "pour un tableau presque trié de 10⁶ éléments.",
        "evaluate",
        "question",
    ),
    (
        "Évaluez la qualité du code suivant selon les critères SOLID. "
        "Justifiez chaque principe respecté ou violé.",
        "evaluate",
        "question",
    ),
    (
        "Critiquez l'approche microservices proposée dans ce diagramme d'architecture. "
        "Quels sont les risques et les avantages ?",
        "evaluate",
        "question",
    ),
    # ── Create (niveau 6) ────────────────────────────────────────────────
    (
        "Concevez une bibliothèque Python complète de structures de données adaptées "
        "aux contraintes mémoire d'un système embarqué. Justifiez vos choix architecturaux.",
        "create",
        "project",
    ),
    (
        "Proposez une solution complète de gestion de cache distribué pour une application "
        "Flask haute disponibilité. Incluez le schéma de données et le code.",
        "create",
        "project",
    ),
    (
        "Créez un framework de tests automatisés pour des API REST en Python, "
        "incluant la gestion des fixtures, mocks et rapports HTML.",
        "create",
        "project",
    ),
    # ── Edge cases (ambiguous boundaries) ────────────────────────────────
    (
        "À partir des logs de performance suivants, identifiez les requêtes SQL "
        "qui pourraient être optimisées et expliquez pourquoi.",
        "analyze",  # Could be confused with evaluate — structural decomposition wins
        "question",
    ),
    (
        "Modifiez l'algorithme de recherche binaire pour qu'il retourne également "
        "l'index de l'élément cherché dans un tableau trié.",
        "apply",   # Modification of known algorithm — Apply not Create
        "exercise",
    ),
]


# ── Fixtures ──────────────────────────────────────────────────────────────────

class _MockContext:
    """Minimal skill context for testing."""
    user_id = 1
    course_id = None
    role = "teacher"


@pytest.fixture(scope="module")
def bloom_skill(app):
    """Return an initialized BloomClassifierSkill within Flask app context."""
    with app.app_context():
        from app.skills.bloom_classifier import BloomClassifierSkill
        return BloomClassifierSkill()


# ── Tests ─────────────────────────────────────────────────────────────────────

@pytest.mark.slow
class TestBloomClassifierGoldenDataset:
    """Live LLM tests against the 20-item golden dataset.

    Acceptance threshold: 85% accuracy (17/20 correct).
    """

    ACCEPTANCE_THRESHOLD = 0.85

    def _classify(self, skill, content: str, content_type: str) -> str:
        ctx = _MockContext()
        result = skill.execute(ctx, {"content": content, "content_type": content_type})
        return result.get("bloom_level", "").lower()

    @pytest.mark.parametrize("content,expected,content_type", GOLDEN_DATASET)
    def test_individual_item(self, bloom_skill, content, expected, content_type):
        """Each golden item should be classified correctly."""
        predicted = self._classify(bloom_skill, content, content_type)
        assert predicted == expected, (
            f"Expected '{expected}', got '{predicted}'\n"
            f"Content: {content[:80]}..."
        )

    def test_overall_accuracy(self, bloom_skill):
        """Overall accuracy across all 20 items must reach the acceptance threshold."""
        correct = 0
        errors = []
        for content, expected, ctype in GOLDEN_DATASET:
            predicted = self._classify(bloom_skill, content, ctype)
            if predicted == expected:
                correct += 1
            else:
                errors.append(f"  [{expected}→{predicted}] {content[:60]}...")

        accuracy = correct / len(GOLDEN_DATASET)
        error_report = "\n".join(errors)
        assert accuracy >= self.ACCEPTANCE_THRESHOLD, (
            f"Bloom classifier accuracy {accuracy:.0%} < "
            f"{self.ACCEPTANCE_THRESHOLD:.0%} threshold.\n"
            f"Misclassifications:\n{error_report}"
        )


# ── Unit test: few-shot examples present ──────────────────────────────────────

def test_bloom_fewshot_examples_present(app):
    """Verify all 5 Bloom levels have a few-shot example in the system prompt."""
    with app.app_context():
        from app.skills.bloom_classifier import BloomClassifierSkill
        skill = BloomClassifierSkill()
        examples = skill.FEW_SHOT_EXAMPLES
        for level in ["remember", "apply", "analyze", "evaluate", "create"]:
            assert level.lower() in examples.lower(), (
                f"Few-shot example missing for Bloom level: {level}"
            )


def test_bloom_output_schema(app):
    """Verify bloom-classifier returns required keys with correct types (no LLM)."""
    with app.app_context():
        # Mock call_llm_versioned to avoid real LLM call
        from app.skills import bloom_classifier as bc
        original = bc.BloomClassifierSkill.call_llm_versioned

        def _mock(self, **kwargs):
            return {"level": "apply", "confidence": 0.9, "justification": "mock"}

        bc.BloomClassifierSkill.call_llm_versioned = _mock
        try:
            skill = bc.BloomClassifierSkill()
            result = skill.execute(_MockContext(), {"content": "test", "content_type": "question"})
            assert "bloom_level" in result
            assert "confidence" in result
            assert "justification" in result
            assert result["bloom_level"] in bc.BloomClassifierSkill.BLOOM_LEVELS
        finally:
            bc.BloomClassifierSkill.call_llm_versioned = original


def test_compress_aa_list_truncates():
    """AA list compression should truncate when over budget."""
    from app.skills.base import compress_aa_list
    long_aa = [
        {"code": f"AA{i}", "description": "A" * 100}
        for i in range(30)
    ]
    result = compress_aa_list(long_aa, max_chars=500)
    assert len(result) <= 600   # With truncation note
    assert "omitted" in result


def test_compress_aa_list_no_truncation_when_short():
    """Short AA list should not be truncated."""
    from app.skills.base import compress_aa_list
    short_aa = [{"code": "AA1", "description": "Short description"}]
    result = compress_aa_list(short_aa)
    assert "AA1" in result
    assert "omitted" not in result
