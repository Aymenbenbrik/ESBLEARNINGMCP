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

        result = self.call_llm_json(
            system_prompt=(
                "Tu es un enseignant en programmation bienveillant et pédagogue.\n"
                "Fais une review du code étudiant avec un ton constructif et encourageant.\n"
                f"Langage: {language}\n"
                f"Critères d'évaluation: {criteria}\n"
                "N'écris JAMAIS la solution complète — guide l'étudiant.\n"
                'JSON: {"overall_score": 0-20, "issues": [{"line": N, "severity": "error|warning|suggestion", '
                '"message": "...", "hint": "..."}], "strengths": ["..."], "improvements": ["..."], '
                '"learning_points": ["..."]}'
            ),
            user_prompt=(
                f"Code étudiant ({language}):\n```{language}\n{student_code}\n```"
                f"{ref_section}"
            ),
            temperature=0.3,
        )

        return result


_instance = CodeReviewerSkill()
execute = _instance.execute
