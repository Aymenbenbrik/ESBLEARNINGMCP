"""
Skill: performance-scorer
Calculates performance scores per AA, Bloom level, and module.
Shared across: Coach Agent, Assistant Agent.
"""
from app.skills.base import BaseSkill


class PerformanceScorerSkill(BaseSkill):
    skill_id = 'performance-scorer'
    skill_name = 'Performance Scorer'
    category = 'scoring'

    def execute(self, context, input_data):
        from app.models.program_learning import StudentAAScore, StudentAAPScore
        from app.models.assessments import Quiz, QuizQuestion
        from app.models.activities import SectionQuizSubmission
        from app.models.courses import Course, Enrollment

        student_id = input_data.get('student_id', context.user_id)
        course_ids = input_data.get('course_ids', [])

        if not course_ids and context.course_id:
            course_ids = [context.course_id]

        # Collect AA scores
        aa_scores = StudentAAScore.query.filter(
            StudentAAScore.student_id == student_id,
            StudentAAScore.course_id.in_(course_ids) if course_ids else True,
        ).all()

        # Collect AAP scores
        aap_scores = StudentAAPScore.query.filter_by(student_id=student_id).all()

        # Build per-course performance summary
        courses_perf = {}
        for cid in course_ids:
            course = Course.query.get(cid)
            if not course:
                continue
            course_aa = [s for s in aa_scores if s.course_id == cid]
            avg_score = (
                sum(s.score for s in course_aa) / len(course_aa)
                if course_aa else 0
            )
            courses_perf[cid] = {
                'course_title': course.title,
                'aa_count': len(course_aa),
                'avg_score': round(avg_score, 2),
                'scores': [
                    {'aa_id': s.aa_id, 'score': s.score}
                    for s in course_aa
                ],
            }

        # Self-consistency: run 3 independent calls and merge via median/majority
        # to reduce variance on the numeric bloom score estimates.
        if aa_scores:
            scores_summary = [
                {'aa_id': s.aa_id, 'score': s.score, 'course': s.course_id}
                for s in aa_scores
            ]
            try:
                bloom_breakdown = self.call_llm_json_consistent(
                    system_prompt=(
                        "Tu es un analyste pédagogique.\n"
                        "À partir des scores AA d'un étudiant, estime sa performance par niveau de Bloom.\n"
                        'JSON: {"bloom_scores": {"remember": 0-100, "understand": 0-100, "apply": 0-100, '
                        '"analyze": 0-100, "evaluate": 0-100, "create": 0-100}, "strongest": "...", "weakest": "..."}'
                    ),
                    user_prompt=f"Scores AA:\n{scores_summary}",
                    n=3,
                    temperature=0.4,
                )
            except Exception:
                bloom_breakdown = None

        return {
            'student_id': student_id,
            'courses': courses_perf,
            'aap_scores': [
                {'aap_id': s.aap_id, 'score': s.score}
                for s in aap_scores
            ],
            'bloom_breakdown': bloom_breakdown,
            'overall_avg': round(
                sum(c['avg_score'] for c in courses_perf.values()) / max(len(courses_perf), 1), 2
            ),
        }


_instance = PerformanceScorerSkill()
execute = _instance.execute
