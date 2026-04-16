"""
Skill: rubric-builder
Creates evaluation rubrics aligned to pedagogical objectives.
Shared across: Exam Agent, TP Agent.
"""
from app.skills.base import BaseSkill, compress_aa_list


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

        # Fetch AA for alignment — compressed to stay within token budget
        aa_raw = []
        if course_id:
            course = Course.query.get(course_id)
            if course and course.syllabus:
                aa_list = TNAA.query.filter_by(syllabus_id=course.syllabus.id).all()
                aa_raw = [{'code': aa.code, 'description': aa.description} for aa in aa_list]

        aa_context = compress_aa_list(aa_raw)

        _SYSTEM = (
            "Tu es un expert en évaluation pédagogique.\n"
            f"Crée une grille d'évaluation pour un(e) {assessment_type}.\n"
            f"Note maximale: {max_score} points.\n"
            f"Nombre de critères: {num_criteria}.\n"
            "Aligne chaque critère à un AA si disponible.\n"
            "\n## Exemple de référence (examen Python, 20 pts, 3 critères)\n"
            '{"rubric": {"title": "Grille — TP Algorithmes de tri", "max_score": 20, '
            '"criteria": ['
            '{"name": "Correction fonctionnelle", "description": "Le code produit les résultats attendus sur tous les cas de test", '
            '"max_points": 10, "aa_code": "AA1.3", '
            '"levels": ['
            '{"label": "Excellent", "points": 10, "description": "Tous les tests passent, y compris les cas limites"},'
            '{"label": "Bien", "points": 7, "description": "Tests principaux réussis, 1-2 cas limites échouent"},'
            '{"label": "Insuffisant", "points": 3, "description": "Logique incorrecte sur les cas principaux"}]},'
            '{"name": "Qualité du code", "description": "Lisibilité, nommage, commentaires", '
            '"max_points": 6, "aa_code": "AA2.1", '
            '"levels": ['
            '{"label": "Excellent", "points": 6, "description": "Code clair, nommage explicite, commentaires pertinents"},'
            '{"label": "Bien", "points": 4, "description": "Globalement lisible, quelques améliorations possibles"},'
            '{"label": "Insuffisant", "points": 1, "description": "Code difficile à lire, variables non descriptives"}]}]}}\n'
            '\nJSON: {"rubric": {"title": "...", "max_score": N, '
            '"criteria": [{"name": "...", "description": "...", "max_points": N, '
            '"aa_code": "...", "levels": [{"label": "Excellent", "points": N, "description": "..."}, '
            '{"label": "Bien", "points": N, "description": "..."}, '
            '{"label": "Insuffisant", "points": N, "description": "..."}]}]}}'
        )

        result = self.call_llm_versioned(
            user_prompt=(
                f"Contenu de l'évaluation:\n{content}\n\n"
                f"{'AA disponibles:\\n' + aa_context if aa_context else 'Pas de AA.'}"
            ),
            variant='default',
            fallback_system=_SYSTEM,
            temperature=0.3,
        )

        return result


_instance = RubricBuilderSkill()
execute = _instance.execute
