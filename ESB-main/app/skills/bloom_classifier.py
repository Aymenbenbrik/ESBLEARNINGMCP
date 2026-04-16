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

    # Three canonical few-shot examples covering low / mid / high Bloom levels.
    # Research shows 2-3 examples improve classification accuracy by ~15 % by
    # grounding the model's interpretation of each level label.
    FEW_SHOT_EXAMPLES = """
## Examples

### Example 1 — Remember (niveau 1)
Content: "Quelle est la définition d'un algorithme ?"
→ {"level": "remember", "confidence": 0.97, "justification": "Simple restitution d'une définition mémorisée, aucune transformation cognitive requise."}

### Example 2 — Apply (niveau 3)
Content: "Implémentez un algorithme de tri par insertion en Python et testez-le sur la liste [5, 3, 8, 1]."
→ {"level": "apply", "confidence": 0.94, "justification": "L'étudiant doit mobiliser le concept de tri et l'exécuter concrètement dans un langage de programmation."}

### Example 3 — Evaluate (niveau 5)
Content: "Comparez les algorithmes QuickSort et MergeSort et justifiez lequel choisir pour un tableau presque trié de 10⁶ éléments."
→ {"level": "evaluate", "confidence": 0.91, "justification": "Requiert un jugement critique basé sur des critères (complexité, cache-friendliness, stabilité) — dépasse la simple analyse."}
"""

    def execute(self, context, input_data):
        content = input_data.get('content', '')
        content_type = input_data.get('content_type', 'question')

        result = self.call_llm_json(
            system_prompt=(
                "Tu es un expert en taxonomie de Bloom pour l'enseignement supérieur.\n"
                "Classifie le contenu suivant selon les 6 niveaux de Bloom.\n"
                f"Niveaux possibles: {self.BLOOM_LEVELS}\n"
                f"{self.FEW_SHOT_EXAMPLES}\n"
                "Réponds UNIQUEMENT en JSON valide (sans markdown): "
                '{"level": "...", "confidence": 0.0-1.0, "justification": "..."}'
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
