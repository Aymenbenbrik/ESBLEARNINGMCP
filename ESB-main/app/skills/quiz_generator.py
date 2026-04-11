"""
Skill: quiz-generator
Generates quiz questions aligned to AA/CLO and Bloom levels.
Shared across: Assistant Agent, TP Agent.
"""
from app.skills.base import BaseSkill


class QuizGeneratorSkill(BaseSkill):
    skill_id = 'quiz-generator'
    skill_name = 'Quiz Generator'
    category = 'generation'

    def execute(self, context, input_data):
        from app.models.syllabus import TNAA
        from app.models.courses import Course

        content = input_data.get('content', '')
        num_questions = input_data.get('num_questions', 5)
        bloom_levels = input_data.get('bloom_levels', ['remember', 'understand', 'apply'])
        question_types = input_data.get('question_types', ['qcm', 'vrai_faux', 'ouverte'])
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
                "Tu es un expert en conception d'évaluations pédagogiques.\n"
                f"Génère exactement {num_questions} questions de quiz.\n"
                f"Niveaux de Bloom ciblés: {bloom_levels}\n"
                f"Types de questions: {question_types}\n"
                "Chaque question doit être alignée à un AA si disponible.\n"
                'JSON: {"questions": [{"text": "...", "type": "qcm|vrai_faux|ouverte", '
                '"bloom_level": "...", "aa_code": "...", "options": ["A", "B", "C", "D"], '
                '"correct_answer": "...", "explanation": "...", "difficulty": 1-5}]}'
            ),
            user_prompt=(
                f"Contenu source:\n{content}\n\n"
                f"{'AA disponibles:\\n' + aa_context if aa_context else 'Pas de AA disponibles.'}"
            ),
            temperature=0.5,
        )

        return result


_instance = QuizGeneratorSkill()
execute = _instance.execute
