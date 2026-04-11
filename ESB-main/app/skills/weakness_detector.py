"""
Skill: weakness-detector
Detects skill gaps by comparing student performance to syllabus objectives.
Shared across: Coach Agent, Assistant Agent.
"""
from app.skills.base import BaseSkill


class WeaknessDetectorSkill(BaseSkill):
    skill_id = 'weakness-detector'
    skill_name = 'Skill Gap Detector'
    category = 'analysis'

    def execute(self, context, input_data):
        performance = input_data.get('_dependencies', {}).get('performance-scorer', input_data)
        courses = performance.get('courses', {})
        bloom = performance.get('bloom_breakdown', {})
        threshold = input_data.get('threshold', 50)

        # Collect weak AA scores from performance data
        weak_areas = []
        for cid, cdata in courses.items():
            for s in cdata.get('scores', []):
                if s.get('score', 100) < threshold:
                    weak_areas.append({
                        'course': cdata.get('course_title', str(cid)),
                        'aa_id': s['aa_id'],
                        'score': s['score'],
                    })

        if not weak_areas and not bloom:
            return {
                'gaps': [],
                'summary': 'Aucune lacune significative détectée.',
                'risk_level': 'low',
            }

        result = self.call_llm_json(
            system_prompt=(
                "Tu es un expert en diagnostic pédagogique.\n"
                "Analyse les lacunes d'un étudiant et donne un diagnostic structuré.\n"
                'JSON: {"gaps": [{"area": "...", "severity": "high|medium|low", "description": "..."}], '
                '"summary": "...", "risk_level": "high|medium|low", "priority_actions": ["..."]}'
            ),
            user_prompt=(
                f"Zones faibles (score < {threshold}):\n{weak_areas}\n\n"
                f"Répartition Bloom:\n{bloom}"
            ),
            temperature=0.2,
        )

        return result


_instance = WeaknessDetectorSkill()
execute = _instance.execute
