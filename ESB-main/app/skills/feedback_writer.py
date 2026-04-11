"""
Skill: feedback-writer
Generates personalized pedagogical feedback for students.
Shared across: Exam Agent, TP Agent, Coach Agent, Assistant Agent.
"""
from app.skills.base import BaseSkill


class FeedbackWriterSkill(BaseSkill):
    skill_id = 'feedback-writer'
    skill_name = 'Pedagogical Feedback Writer'
    category = 'generation'

    LANG_INSTRUCTIONS = {
        'fr': 'Réponds en français.',
        'en': 'Respond in English.',
        'tn': 'Réponds en dialecte tunisien (darija) avec des mots français mélangés.',
    }

    def execute(self, context, input_data):
        performance = input_data.get('performance', {})
        feedback_type = input_data.get('type', 'general')
        language = input_data.get('language', 'fr')
        bloom_data = input_data.get('_dependencies', {}).get('bloom-classifier', {})

        lang_instr = self.LANG_INSTRUCTIONS.get(language, self.LANG_INSTRUCTIONS['fr'])

        result = self.call_llm_json(
            system_prompt=(
                "Tu es un tuteur bienveillant en enseignement supérieur.\n"
                "Génère un feedback pédagogique personnalisé et constructif.\n"
                f"{lang_instr}\n"
                'Réponds UNIQUEMENT en JSON: {"feedback": "...", "encouragements": "...", "next_steps": ["..."]}'
            ),
            user_prompt=(
                f"Type de feedback: {feedback_type}\n"
                f"Performance: {performance}\n"
                f"Analyse Bloom: {bloom_data}"
            ),
            temperature=0.5,
        )

        return result


_instance = FeedbackWriterSkill()
execute = _instance.execute
