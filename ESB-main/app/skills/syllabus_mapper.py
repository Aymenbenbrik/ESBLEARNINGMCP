"""
Skill: syllabus-mapper
Maps any content to the course's AA/CLO/AAP learning outcomes.
Shared across: Exam Agent, TP Agent, Coach Agent.
"""
from app.skills.base import BaseSkill


class SyllabusMapperSkill(BaseSkill):
    skill_id = 'syllabus-mapper'
    skill_name = 'Syllabus Outcome Mapper'
    category = 'analysis'

    def execute(self, context, input_data):
        from app.models.syllabus import TNAA
        from app.models.courses import Course

        content = input_data.get('content', '')
        course_id = context.course_id

        course = Course.query.get(course_id)
        if not course or not course.syllabus:
            return {'mappings': [], 'error': 'No syllabus found for this course'}

        aa_list = TNAA.query.filter_by(syllabus_id=course.syllabus.id).all()
        aa_descriptions = [
            {'code': aa.code, 'description': aa.description}
            for aa in aa_list
        ]

        if not aa_descriptions:
            return {'mappings': [], 'error': 'No AA found in syllabus'}

        result = self.call_llm_json(
            system_prompt=(
                "Tu es un expert en ingénierie pédagogique.\n"
                "Mappe le contenu donné aux Acquis d'Apprentissage (AA) du cours.\n"
                'Réponds UNIQUEMENT en JSON: {"mappings": [{"aa_code": "...", "relevance": 0.0-1.0, "justification": "..."}]}'
            ),
            user_prompt=f"AA disponibles:\n{aa_descriptions}\n\nContenu à mapper:\n{content}",
            temperature=0.2,
        )

        return result


_instance = SyllabusMapperSkill()
execute = _instance.execute
