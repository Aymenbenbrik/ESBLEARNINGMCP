"""
Skill: bloom-classifier
Classifies any educational content by Bloom's taxonomy level.
Shared across: Exam Agent, TP Agent, Coach Agent, Assistant Agent.
"""
from app.skills.base import BaseSkill


class BloomClassifierSkill(BaseSkill):
    skill_id = 'bloom-classifier'
    skill_name = 'Bloom Taxonomy Classifier'
    category = 'analysis'

    BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create']

    def execute(self, context, input_data):
        content = input_data.get('content', '')
        content_type = input_data.get('content_type', 'question')

        result = self.call_llm_json(
            system_prompt=(
                "Tu es un expert en taxonomie de Bloom pour l'enseignement supérieur.\n"
                "Classifie le contenu suivant selon les 6 niveaux de Bloom.\n"
                f"Niveaux possibles: {self.BLOOM_LEVELS}\n"
                'Réponds UNIQUEMENT en JSON: {"level": "...", "confidence": 0.0-1.0, "justification": "..."}'
            ),
            user_prompt=f"Type: {content_type}\nContenu:\n{content}",
            temperature=0.1,
        )

        return {
            'bloom_level': result.get('level'),
            'confidence': result.get('confidence'),
            'justification': result.get('justification'),
        }


_instance = BloomClassifierSkill()
execute = _instance.execute
