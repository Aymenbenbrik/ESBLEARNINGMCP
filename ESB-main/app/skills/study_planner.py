"""
Skill: study-planner
Creates a personalized study schedule adapted to the student's pace.
Used by: Coach Agent.
"""
from app.skills.base import BaseSkill


class StudyPlannerSkill(BaseSkill):
    skill_id = 'study-planner'
    skill_name = 'Study Schedule Planner'
    category = 'planning'

    def execute(self, context, input_data):
        exercises = input_data.get('_dependencies', {}).get('exercise-recommender', input_data)
        exercise_list = exercises.get('exercises', [])
        available_hours = input_data.get('available_hours_per_week', 10)
        deadline = input_data.get('deadline')
        language = input_data.get('language', 'fr')

        if not exercise_list:
            return {
                'schedule': [],
                'message': 'Aucun exercice à planifier.',
            }

        _SYSTEM = (
            "Tu es un planificateur d'études expert.\n"
            "Crée un planning d'étude hebdomadaire réaliste et motivant.\n"
            f"L'étudiant dispose de {available_hours}h par semaine.\n"
            f"{'Date limite: ' + deadline if deadline else 'Pas de date limite spécifique.'}\n"
            f"Langue: {'français' if language == 'fr' else 'anglais'}.\n"
            'JSON: {"schedule": [{"week": 1, "day": "lundi", "time_slot": "14h-16h", '
            '"activity": "...", "exercise_ref": "...", "duration_minutes": 60, '
            '"objective": "..."}], "total_weeks": N, "tips": ["..."]}'
        )

        result = self.call_llm_versioned(
            user_prompt=f"Exercices à planifier:\n{exercise_list}",
            variant='default',
            fallback_system=_SYSTEM,
            temperature=0.4,
        )

        return result


_instance = StudyPlannerSkill()
execute = _instance.execute
