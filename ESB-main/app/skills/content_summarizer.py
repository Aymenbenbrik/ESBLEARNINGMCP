"""
Skill: content-summarizer
Summarizes chapters and sections adapted to the student's level.
Used by: Assistant Agent.
"""
from app.skills.base import BaseSkill


class ContentSummarizerSkill(BaseSkill):
    skill_id = 'content-summarizer'
    skill_name = 'Content Summarizer'
    category = 'generation'

    def execute(self, context, input_data):
        content = input_data.get('content', '')
        level = input_data.get('level', 'intermediate')   # beginner, intermediate, advanced
        style = input_data.get('style', 'structured')      # structured, narrative, bullet_points
        language = input_data.get('language', 'fr')
        max_words = input_data.get('max_words', 300)

        style_instructions = {
            'structured': 'Utilise des titres, sous-titres et listes.',
            'narrative': 'Rédige un texte fluide et continu.',
            'bullet_points': 'Utilise uniquement des bullet points concis.',
        }

        level_instructions = {
            'beginner': 'Simplifie au maximum, utilise des analogies simples, évite le jargon.',
            'intermediate': 'Garde un niveau académique standard.',
            'advanced': 'Sois technique et précis, inclus les nuances.',
        }

        result = self.call_llm_json(
            system_prompt=(
                "Tu es un pédagogue expert en vulgarisation.\n"
                f"Niveau de l'étudiant: {level}. {level_instructions.get(level, '')}\n"
                f"Style: {style}. {style_instructions.get(style, '')}\n"
                f"Limite: {max_words} mots maximum.\n"
                f"Langue: {'français' if language == 'fr' else 'anglais'}.\n"
                'JSON: {"summary": "...", "key_concepts": ["..."], "prerequisites": ["..."]}'
            ),
            user_prompt=f"Contenu à résumer:\n{content}",
            temperature=0.4,
        )

        return result


_instance = ContentSummarizerSkill()
execute = _instance.execute
