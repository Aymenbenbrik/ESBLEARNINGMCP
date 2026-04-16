"""
Skill: quiz-generator
Generates quiz questions aligned to AA/CLO and Bloom levels.
Shared across: Assistant Agent, TP Agent.
"""
from app.skills.base import BaseSkill, compress_aa_list


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

        # Fetch AA for alignment — compressed to stay within token budget
        aa_raw = []
        if course_id:
            course = Course.query.get(course_id)
            if course and course.syllabus:
                aa_list = TNAA.query.filter_by(syllabus_id=course.syllabus.id).all()
                aa_raw = [{'code': aa.code, 'description': aa.description} for aa in aa_list]

        aa_context = compress_aa_list(aa_raw)

        _SYSTEM = (
            "Tu es un expert en conception d'évaluations pédagogiques.\n"
            f"Génère exactement {num_questions} questions de quiz.\n"
            f"Niveaux de Bloom ciblés: {bloom_levels}\n"
            f"Types de questions: {question_types}\n"
            "Chaque question doit être alignée à un AA si disponible.\n"
            "\n## Exemples de référence\n"
            "### QCM — niveau Apply (Bloom 3)\n"
            'Sujet: "Boucles Python"\n'
            '→ {"text": "Quel est le résultat de `sum(x**2 for x in range(4))` ?", '
            '"type": "qcm", "bloom_level": "apply", '
            '"options": ["14", "30", "28", "16"], "correct_answer": "14", '
            '"explanation": "0²+1²+2²+3² = 0+1+4+9 = 14", "difficulty": 2}\n'
            "\n### Ouverte — niveau Analyze (Bloom 4)\n"
            'Sujet: "Complexité algorithmique"\n'
            '→ {"text": "Analysez pourquoi l\'algorithme suivant est O(n²) et '
            'proposez une reformulation O(n log n) en justifiant chaque étape.", '
            '"type": "ouverte", "bloom_level": "analyze", '
            '"options": [], "correct_answer": "Voir corrigé détaillé", '
            '"explanation": "Identification des boucles imbriquées et tri comme alternative", '
            '"difficulty": 4}\n'
            '\nJSON: {"questions": [{"text": "...", "type": "qcm|vrai_faux|ouverte", '
            '"bloom_level": "...", "aa_code": "...", "options": ["A", "B", "C", "D"], '
            '"correct_answer": "...", "explanation": "...", "difficulty": 1-5}]}'
        )

        result = self.call_llm_versioned(
            user_prompt=(
                f"Contenu source:\n{content}\n\n"
                f"{'AA disponibles:\\n' + aa_context if aa_context else 'Pas de AA disponibles.'}"
            ),
            variant='default',
            fallback_system=_SYSTEM,
            temperature=0.5,
        )

        return result


_instance = QuizGeneratorSkill()
execute = _instance.execute
