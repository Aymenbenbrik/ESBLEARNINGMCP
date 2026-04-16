"""
Skill: exercise-recommender
Suggests targeted exercises to address identified skill gaps.
Shared across: Coach Agent, Assistant Agent.
"""
from app.skills.base import BaseSkill


class ExerciseRecommenderSkill(BaseSkill):
    skill_id = 'exercise-recommender'
    skill_name = 'Exercise Recommender'
    category = 'generation'

    def execute(self, context, input_data):
        gaps = input_data.get('_dependencies', {}).get('weakness-detector', input_data)
        gap_list = gaps.get('gaps', [])
        priority = gaps.get('priority_actions', [])
        language = input_data.get('language', 'fr')
        max_exercises = input_data.get('max_exercises', 5)

        if not gap_list:
            return {
                'exercises': [],
                'message': 'Aucune lacune détectée, pas de recommandation nécessaire.',
            }

        _SYSTEM = (
            "Tu es un concepteur pédagogique expert.\n"
            "Propose des exercices ciblés pour combler les lacunes identifiées.\n"
            "Chaque exercice doit être progressif (du plus simple au plus complexe).\n"
            f"Propose maximum {max_exercises} exercices.\n"
            f"Langue: {'français' if language == 'fr' else 'anglais'}.\n"
            'JSON: {"exercises": [{"title": "...", "description": "...", '
            '"bloom_level": "...", "target_gap": "...", "difficulty": 1-5, '
            '"estimated_minutes": 10-60, "type": "qcm|code|redaction|analyse"}]}'
        )

        result = self.call_llm_versioned(
            user_prompt=(
                f"Lacunes identifiées:\n{gap_list}\n\n"
                f"Actions prioritaires:\n{priority}"
            ),
            variant='default',
            fallback_system=_SYSTEM,
            temperature=0.4,
        )

        return result


_instance = ExerciseRecommenderSkill()
execute = _instance.execute
