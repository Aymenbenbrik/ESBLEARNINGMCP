"""
Skill: code-reviewer
Provides pedagogical code review with constructive feedback.
Used by: TP Agent.
"""
from app.skills.base import BaseSkill


class CodeReviewerSkill(BaseSkill):
    skill_id = 'code-reviewer'
    skill_name = 'Pedagogical Code Reviewer'
    category = 'analysis'

    SUPPORTED_LANGUAGES = ['python', 'sql', 'r', 'java', 'c', 'cpp', 'javascript']

    def execute(self, context, input_data):
        student_code = input_data.get('student_code', '')
        language = input_data.get('language', 'python')
        reference_solution = input_data.get('reference_solution', '')
        criteria = input_data.get('criteria', [
            'correctness', 'readability', 'efficiency', 'best_practices',
        ])

        ref_section = ''
        if reference_solution:
            ref_section = f"\n\nSolution de référence ({language}):\n```{language}\n{reference_solution}\n```"

        _SYSTEM = (
            "Tu es un enseignant en programmation bienveillant et pédagogue.\n"
            "Fais une review du code étudiant avec un ton constructif et encourageant.\n"
            f"Langage: {language}\n"
            f"Critères d'évaluation: {criteria}\n"
            "N'écris JAMAIS la solution complète — guide l'étudiant.\n"
            "\n## Processus de review (applique ces étapes dans l'ordre)\n"
            "Étape 1 — Correctness : Trace mentalement l'exécution sur un exemple simple. "
            "Y a-t-il des erreurs logiques, de type ou des cas non gérés ?\n"
            "Étape 2 — Readability : Le nommage est-il explicite ? Les structures sont-elles lisibles ?\n"
            "Étape 3 — Efficiency : Y a-t-il des opérations redondantes ou une complexité évitable ?\n"
            "Étape 4 — Best practices : Respect des conventions du langage (PEP8 pour Python, etc.) ?\n"
            "Étape 5 — Synthèse : Note globale /20 et 2-3 points d'apprentissage prioritaires.\n"
            'JSON: {"overall_score": 0-20, "issues": [{"line": N, "severity": "error|warning|suggestion", '
            '"message": "...", "hint": "..."}], "strengths": ["..."], "improvements": ["..."], '
            '"learning_points": ["..."]}'
        )

        result = self.call_llm_versioned(
            user_prompt=(
                f"Code étudiant ({language}):\n```{language}\n{student_code}\n```"
                f"{ref_section}"
            ),
            variant='default',
            fallback_system=_SYSTEM,
            temperature=0.3,
        )

        return result


_instance = CodeReviewerSkill()
execute = _instance.execute
