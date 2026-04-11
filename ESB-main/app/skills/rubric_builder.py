"""
Skill: rubric-builder
Creates evaluation rubrics aligned to pedagogical objectives.
Shared across: Exam Agent, TP Agent.
"""
from app.skills.base import BaseSkill


class RubricBuilderSkill(BaseSkill):
    skill_id = 'rubric-builder'
    skill_name = 'Rubric Builder'
    category = 'generation'

    def execute(self, context, input_data):
        from app.models.syllabus import TNAA
        from app.models.courses import Course

        assessment_type = input_data.get('type', 'exam')   # exam, tp, assignment
        content = input_data.get('content', '')
        max_score = input_data.get('max_score', 20)
        num_criteria = input_data.get('num_criteria', 5)
        course_id = context.course_id

        # Fetch AA for alignment
        aa_context = ''
        if course_id:
            course = Course.query.get(course_id)
            if course and course.syllabus:
                aa_list = TNAA.query.filter_by(syllabus_id=course.syllabus.id).all()
                aa_context = '\n'.join(
                    f"- {aa.code}: {aa.description}" for aa in aa_list
                )

        result = self.call_llm_json(
            system_prompt=(
                "Tu es un expert en évaluation pédagogique.\n"
                f"Crée une grille d'évaluation pour un(e) {assessment_type}.\n"
                f"Note maximale: {max_score} points.\n"
                f"Nombre de critères: {num_criteria}.\n"
                "Aligne chaque critère à un AA si disponible.\n"
                'JSON: {"rubric": {"title": "...", "max_score": N, '
                '"criteria": [{"name": "...", "description": "...", "max_points": N, '
                '"aa_code": "...", "levels": [{"label": "Excellent", "points": N, "description": "..."}, '
                '{"label": "Bien", "points": N, "description": "..."}, '
                '{"label": "Insuffisant", "points": N, "description": "..."}]}]}}'
            ),
            user_prompt=(
                f"Contenu de l'évaluation:\n{content}\n\n"
                f"{'AA disponibles:\\n' + aa_context if aa_context else 'Pas de AA.'}"
            ),
            temperature=0.3,
        )

        return result


_instance = RubricBuilderSkill()
execute = _instance.execute
