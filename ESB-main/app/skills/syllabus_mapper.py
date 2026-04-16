"""
Skill: syllabus-mapper
Maps any content to the course's AA/CLO/AAP learning outcomes.
Shared across: Exam Agent, TP Agent, Coach Agent, Assistant Agent.

Role-aware behaviour
--------------------
- teacher / admin : technical classification prompt — "which AAs does this
  content cover?" — suitable for curriculum design and exam analysis.
- student         : learning-journey prompt — "which objectives does this
  content help you progress on?" — friendly, motivational framing that
  explains *why* the AA matters to the student's progress.
"""
from app.skills.base import BaseSkill, compress_aa_list

# JSON contract shared by both roles (same shape, different tone in justification)
_JSON_CONTRACT = (
    '{"mappings": [{"aa_code": "...", "relevance": 0.0-1.0, "justification": "..."}]}'
)

_TEACHER_SYSTEM = (
    "Tu es un expert en ingénierie pédagogique.\n"
    "Mappe le contenu donné aux Acquis d'Apprentissage (AA) du cours.\n"
    f"Réponds UNIQUEMENT en JSON: {_JSON_CONTRACT}"
)

_STUDENT_SYSTEM = (
    "Tu es un tuteur pédagogique bienveillant qui aide les étudiants à comprendre "
    "leur progression d'apprentissage.\n"
    "À partir du contenu fourni, identifie quels Acquis d'Apprentissage (AA) du cours "
    "l'étudiant est en train de travailler ou de développer.\n"
    "Dans le champ 'justification', explique de façon encourageante et claire "
    "pourquoi ce contenu contribue à cet AA — aide l'étudiant à comprendre "
    "la valeur de ce qu'il apprend.\n"
    f"Réponds UNIQUEMENT en JSON: {_JSON_CONTRACT}"
)


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

        # Select prompt based on caller role
        _fallback = _STUDENT_SYSTEM if context.role == 'student' else _TEACHER_SYSTEM
        _variant = 'student' if context.role == 'student' else 'default'

        aa_raw = [{'code': aa.code, 'description': aa.description} for aa in aa_list]
        result = self.call_llm_versioned(
            user_prompt=f"AA disponibles:\n{compress_aa_list(aa_raw)}\n\nContenu à mapper:\n{content}",
            variant=_variant,
            fallback_system=_fallback,
            temperature=0.2,
        )

        return result


_instance = SyllabusMapperSkill()
execute = _instance.execute
