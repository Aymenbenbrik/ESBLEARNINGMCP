# app/models/__init__.py
# Imports submodules in dependency order and re-exports all public names
# so that `from app.models import SomeModel` continues to work everywhere.

from app.models.users import (
    UserSession,
    TeacherStudent,
    User,
    load_user,
    create_superuser,
)

from app.models.institutions import (
    program_course,
    ClassCourseAssignment,
    Program,
    Classe,
)

from app.models.courses import (
    Course,
    Chapter,
    Enrollment,
    GradeWeight,
)

from app.models.chat import (
    ChatSession,
    ChatMessage,
    ClassChatRoom,
    ClassChatMessage,
)

from app.models.documents import (
    Document,
    Note,
)

from app.models.syllabus import (
    Syllabus,
    TNSyllabusAdministrative,
    TNAAP,
    TNAA,
    TNChapter,
    TNSection,
    TNChapterAA,
    TNSectionAA,
    TNEvaluation,
    TNBibliography,
    SyllabusVersion,
    CourseReference,
    ChapterReference,
    SectionContent,
)

from app.models.assessments import (
    QuizBloomStatistic,
    QuizCLOStatistic,
    Quiz,
    QuizViolation,
    QuizQuestion,
    QuestionBankQuestion,
    PracticeQuiz,
    PracticeQuizQuestion,
    CourseSafeExamConfig,
)

from app.models.activities import (
    SectionQuiz,
    SectionQuizQuestion,
    SectionQuizSubmission,
    SectionActivity,
    SectionAssignment,
    AssignmentSubmission,
)

from app.models.attendance import (
    AttendanceSession,
    AttendanceRecord,
)

from app.models.exams import (
    SUPPORTED_LANGUAGES,
    CourseExam,
    ExamAnalysisSession,
    ExamExtractedQuestion,
    PracticalWork,
    PracticalWorkSubmission,
)

from app.models.pipeline import (
    ChapterPipeline,
    ChapterExercise,
    ExerciseQuestion,
    QuestionBankExercise,
)

from app.models.exam_bank import (
    ValidatedExam,
    ExamBankQuestion,
    ExamSession,
    ExamSessionAnswer,
    ExamViolation,
    StudentPhoto,
)

from app.models.progress import (
    ChapterProgress,
    CourseProgressSnapshot,
)

from app.models.feedback import (
    EvaluationFeedback,
)

from app.models.program_learning import (
    aap_competence_link,
    ProgramAAP,
    ProgramCompetence,
    AAAapLink,
    StudentAAScore,
    StudentAAPScore,
)

from app.models.skills import (
    skill_agent_link,
    skill_role_link,
    AgentRegistry,
    Skill,
    SkillCourseConfig,
    SkillDependency,
    SkillExecution,
)

__all__ = [
    # users
    'UserSession', 'TeacherStudent', 'User', 'load_user', 'create_superuser',
    # institutions
    'program_course', 'ClassCourseAssignment', 'Program', 'Classe',
    # courses
    'Course', 'Chapter', 'Enrollment', 'GradeWeight',
    # chat
    'ChatSession', 'ChatMessage', 'ClassChatRoom', 'ClassChatMessage',
    # documents
    'Document', 'Note',
    # syllabus
    'Syllabus', 'TNSyllabusAdministrative', 'TNAAP', 'TNAA', 'TNChapter',
    'TNSection', 'TNChapterAA', 'TNSectionAA', 'TNEvaluation', 'TNBibliography',
    'SyllabusVersion', 'CourseReference', 'ChapterReference', 'SectionContent',
    # assessments
    'QuizBloomStatistic', 'QuizCLOStatistic', 'Quiz', 'QuizViolation',
    'QuizQuestion', 'QuestionBankQuestion', 'PracticeQuiz', 'PracticeQuizQuestion',
    'CourseSafeExamConfig',
    # activities
    'SectionQuiz', 'SectionQuizQuestion', 'SectionQuizSubmission',
    'SectionActivity', 'SectionAssignment', 'AssignmentSubmission',
    # attendance
    'AttendanceSession', 'AttendanceRecord',
    # exams
    'SUPPORTED_LANGUAGES', 'CourseExam', 'ExamAnalysisSession',
    'ExamExtractedQuestion', 'PracticalWork', 'PracticalWorkSubmission',
    # pipeline
    'ChapterPipeline', 'ChapterExercise', 'ExerciseQuestion', 'QuestionBankExercise',
    # exam_bank
    'ValidatedExam', 'ExamBankQuestion', 'ExamSession', 'ExamSessionAnswer',
    'ExamViolation', 'StudentPhoto',
    # progress
    'ChapterProgress', 'CourseProgressSnapshot',
    # feedback
    'EvaluationFeedback',
    # program_learning
    'aap_competence_link', 'ProgramAAP', 'ProgramCompetence',
    'AAAapLink', 'StudentAAScore', 'StudentAAPScore',
    # skills
    'skill_agent_link', 'skill_role_link', 'AgentRegistry', 'Skill',
    'SkillCourseConfig', 'SkillDependency', 'SkillExecution',
]
