"""
Skill: language-adapter
Adapts language and tone (FR/EN/Tunisian) based on context.
Shared across: Assistant Agent, Coach Agent.
"""
from app.skills.base import BaseSkill


class LanguageAdapterSkill(BaseSkill):
    skill_id = 'language-adapter'
    skill_name = 'Language & Tone Adapter'
    category = 'generation'

    SUPPORTED_LANGUAGES = ['fr', 'en', 'tn']

    def execute(self, context, input_data):
        text = input_data.get('text', '')
        target_language = input_data.get('target_language')
        tone = input_data.get('tone', 'neutral')    # encouraging, neutral, formal, casual
        detect_only = input_data.get('detect_only', False)

        if detect_only:
            result = self.call_llm_json(
                system_prompt=(
                    "Tu es un expert en détection de langue.\n"
                    "Détecte la langue du texte: fr (français), en (anglais), tn (tunisien/darija).\n"
                    "Détecte aussi le ton émotionnel.\n"
                    'JSON: {"detected_language": "fr|en|tn", "confidence": 0.0-1.0, '
                    '"emotional_tone": "positive|neutral|negative|frustrated|confused", '
                    '"formality": "formal|casual|mixed"}'
                ),
                user_prompt=f"Texte:\n{text}",
                temperature=0.1,
            )
            return result

        target = target_language or 'fr'
        lang_names = {'fr': 'français', 'en': 'anglais', 'tn': 'dialecte tunisien (darija)'}
        tone_instructions = {
            'encouraging': 'Sois chaleureux, encourageant et positif.',
            'neutral': 'Sois professionnel et neutre.',
            'formal': 'Utilise un registre formel et académique.',
            'casual': 'Sois décontracté et accessible.',
        }

        result = self.call_llm_json(
            system_prompt=(
                f"Adapte le texte suivant en {lang_names.get(target, target)}.\n"
                f"Ton: {tone_instructions.get(tone, tone_instructions['neutral'])}\n"
                'JSON: {"adapted_text": "...", "source_language": "fr|en|tn", '
                '"target_language": "fr|en|tn", "tone_applied": "..."}'
            ),
            user_prompt=f"Texte original:\n{text}",
            temperature=0.3,
        )

        return result


_instance = LanguageAdapterSkill()
execute = _instance.execute
