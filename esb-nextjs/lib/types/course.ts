// User type (minimal representation)
export interface User {
  id: number;
  username: string;
  email: string;
  is_teacher?: boolean;
  is_superuser?: boolean;
}

// Basic Course
export interface Course {
  id: number;
  title: string;
  description: string | null;
  teacher_id: number;
  created_at: string;
  updated_at: string;
  chapters_count: number;
  enrolled_at?: string; // For students
  teacher?: User;
}

// TN Section
export interface TNNormItem {
  number: number;
  label: string;
  description?: string;
}

// TN Section
export interface TNSection {
  id: number;
  index: string;
  title: string;
  chapter_id?: number;
  parent_section_id?: number | null;
  position?: number;
  sub_sections?: TNSection[];
  aaa?: TNNormItem[];
}

// TN Chapter
export interface TNChapter {
  id: number;
  index: number;
  title: string;
  sections: TNSection[];
  aaa?: TNNormItem[];
  aap?: TNNormItem[];
}

// Chapter
export interface Chapter {
  id: number;
  title: string;
  order: number;
  course_id: number;
  created_at: string;
  updated_at: string;
  documents_count: number;
  has_summary: boolean;
  summary?: string | null;
  tn_chapter?: TNChapter | null;
}

// Document
export interface Document {
  id: number;
  title: string;
  file_path: string | null;
  file_type: string | null;
  document_type: string;
  summary?: string | null;
  chapter_id?: number | null;
  course_id?: number | null;
  week_number?: number | null;
  created_at: string;
  updated_at: string;
  can_edit?: boolean;
  quiz_data?: any[];
  metadata?: any;
}

// Syllabus
export interface Syllabus {
  id: number;
  syllabus_type: 'bga' | 'tn' | null;
  file_path: string | null;
  created_at: string;
}

// TN AA Distribution
export interface TNAADistribution {
  number: number;
  label: string;
  description: string;
  sections_count: number;
  chapters_count: number;
  weight: number;
  percent: number;
}

// Quiz Info for Students
export interface QuizInfo {
  document: {
    id: number;
    title: string;
    created_at: string;
    quiz_data?: any[];
    metadata?: any;
  };
  student_completed: boolean;
  student_score: number | null;
  quiz_id: number | null;
}

// Student Progress
export interface StudentProgress {
  quizzes_completed: number;
  quizzes_total: number;
  assignments_submitted: number;
  assignments_total: number;
}

// Course Details (Extended)
export interface CourseDetails {
  course: {
    id: number;
    title: string;
    description: string | null;
    teacher_id: number;
    created_at: string;
    updated_at: string;
    teacher: User;
    can_edit: boolean;
  };
  syllabus: Syllabus | null;
  chapters: Chapter[];
  module_attachments: Document[];
  tn_aa_distribution: TNAADistribution[];
  course_quizzes?: Document[] | QuizInfo[]; // Teacher vs Student view
  student_progress?: StudentProgress; // Only for students
}

// Chapter Details (Extended)
export interface ChapterDetails {
  chapter: {
    id: number;
    title: string;
    order: number;
    course_id: number;
    summary: string | null;
    created_at: string;
    updated_at: string;
    has_summary: boolean;
    can_edit: boolean;
  };
  course: {
    id: number;
    title: string;
  };
  documents: Document[];
  tn_chapter: TNChapter | null;
}

// Courses List Response
export interface CoursesListResponse {
  enrolled_courses: Course[];
  available_courses: Course[] | null;
  user_role: 'teacher' | 'student';
}

// Form Data Types
export interface CreateCourseData {
  title: string;
  description?: string;
}

export interface UpdateCourseData {
  title?: string;
  description?: string;
}

export interface CreateChapterData {
  title: string;
  order: number;
}

export interface UpdateChapterData {
  title?: string;
  order?: number;
}

export interface UploadDocumentData {
  title: string;
  file: File;
}

export interface UploadModuleData {
  title: string;
  file: File;
}

// API Response Types
export interface EnrollmentResponse {
  message: string;
  enrollment?: {
    id: number;
    student_id: number;
    course_id: number;
    enrolled_at: string;
  };
}

export interface SummaryResponse {
  message?: string;
  summary: string | null;
  has_summary?: boolean;
}

export interface DocumentUploadResponse {
  message: string;
  document: Document;
  summary_status: 'pending' | 'generated' | 'failed';
  processing_status: 'uploaded' | 'processed' | 'processing_failed';
}

export interface ModuleUploadResponse {
  message: string;
  document: Document;
  processing_status: 'uploaded' | 'processed' | 'processing_failed';
}

// ============================================================================
// COURSE DASHBOARD TYPES
// ============================================================================

export interface CourseDashboardStats {
  total_students: number;
  total_quizzes: number;
  total_questions: number;
  avg_score: number;
  completion_rate: number;
}

export interface BloomDistributionItem {
  bloom_level: string;
  count: number;
  avg_score: number;
}

export interface DifficultyDistributionItem {
  difficulty: string;
  count: number;
  avg_score: number;
}

export interface AADistributionItem {
  aaa_code: string;
  count: number;
  avg_score: number;
}

export interface CourseDashboardResponse {
  stats: CourseDashboardStats;
  bloom_distribution: BloomDistributionItem[];
  difficulty_distribution: DifficultyDistributionItem[];
  aaa_distribution?: AADistributionItem[];
  recent_quizzes?: {
    id: number;
    student_name: string;
    score: number;
    completed_at: string;
  }[];
  exam_stats?: ExamStatsDashboard;
}

// ============================================================================
// STUDENT DASHBOARD TYPES
// ============================================================================

export interface StudentDashboardStats {
  courses_enrolled: number;
  quizzes_completed: number;
  avg_score: number;
  total_study_time?: number;
}

export interface CourseProgressItem {
  course_id: number;
  course_title: string;
  progress_percentage: number;
  quizzes_completed: number;
  quizzes_total: number;
  avg_score: number;
}

export interface StudentDashboardResponse {
  stats: StudentDashboardStats;
  course_progress: CourseProgressItem[];
  bloom_stats: BloomDistributionItem[];
  difficulty_stats: DifficultyDistributionItem[];
  aaa_stats?: AADistributionItem[];
  recent_quizzes: {
    id: number;
    course_title: string;
    quiz_title: string;
    score: number;
    completed_at: string;
  }[];
}
// ─── Attendance ─────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: number;
  session_id: number;
  student_id: number;
  student_name: string | null;
  student_email: string | null;
  status: 'present' | 'late' | 'absent';
}

export interface CourseActivity {
  type: 'quiz' | 'assignment';
  id: number;
  title: string;
  section_title: string;
  chapter_title: string;
}

export interface AttendanceSession {
  id: number;
  course_id: number;
  title: string;
  date: string; // YYYY-MM-DD
  created_at: string;
  record_count: number;
  total_students?: number;
  present_count?: number;
  late_count?: number;
  absent_count?: number;
  records?: AttendanceRecord[];
  activities_covered?: CourseActivity[];
}

// ─── Grades ──────────────────────────────────────────────────────────────────

export interface GradeWeight {
  id: number;
  course_id: number;
  quiz_weight: number;
  assignment_weight: number;
  attendance_weight: number;
  exam_weight: number;
  formula: string | null;
  updated_at: string;
}

export interface StudentGrade {
  student_id: number;
  student_name: string;
  student_email: string;
  quiz_avg: number | null;
  assignment_avg: number | null;
  attendance_score: number | null;
  exam_score: number | null;
  final_grade: number | null;
  quiz_count: number;
  assignment_count: number;
  total_sessions: number;
}

// ─── Exam ────────────────────────────────────────────────────────────────────

export type ExamType = 'examen' | 'ds' | 'pratique';

export const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  examen: 'Examen final',
  ds: 'Devoir Surveillé',
  pratique: 'Épreuve pratique',
};

export const EXAM_TYPE_COLORS: Record<ExamType, string> = {
  examen: 'bg-purple-100 text-purple-800 border-purple-200',
  ds: 'bg-blue-100 text-blue-800 border-blue-200',
  pratique: 'bg-orange-100 text-orange-800 border-orange-200',
};

export interface BloomDistribution {
  remembering: number;
  understanding: number;
  applying: number;
  analyzing: number;
  evaluating: number;
  creating: number;
}

export interface AAAlignment {
  aa: string;
  covered: boolean;
  comment: string;
}

export interface DifficultyByChapter {
  chapter: string;
  difficulty: string;
  questions_count: number;
  comment: string;
}

export interface ImprovementProposal {
  aa: string;
  bloom_level: string;
  question_type: 'mcq' | 'open_ended';
  is_practical: boolean;
  difficulty: string;
  question_text: string;
  rationale: string;
}

export interface QuestionSource {
  document: string;
  page: string;
  excerpt: string;
  document_id?: number;
}

export interface QuestionWithSources {
  question_number: number;
  question_text_preview: string;
  aa?: string[];
  bloom_level?: string;
  sources?: QuestionSource[];
}

export interface ExamMetadata {
  exam_name?: string;
  class_name?: string;
  language?: string;
  declared_duration_min?: number;
  exam_date?: string;
  instructors?: string[];
  num_pages?: number;
  exam_type?: string;
  answer_on_sheet?: boolean | null;
  calculator_allowed?: boolean | null;
  computer_allowed?: boolean | null;
  internet_allowed?: boolean | null;
  documents_allowed?: boolean | null;
  department?: string;
}

export interface ExamEvaluation {
  overview: string;
  questions_count: number;
  estimated_duration: string;
  avg_difficulty: string;
  has_practical_questions: boolean;
  practical_questions_count: number;
  bloom_distribution: BloomDistribution;
  difficulty_by_chapter: DifficultyByChapter[];
  aa_alignment: AAAlignment[];
  questions_with_sources?: QuestionWithSources[];
  strengths: string[];
  feedback: string[];
  suggestions: string[];
  overall_score: number;
  improvement_proposals: ImprovementProposal[];
  // Error state fields (set when analysis fails)
  error?: string;
  error_message?: string;
}

export interface CourseExam {
  id: number;
  course_id: number;
  file_path: string | null;
  original_name: string | null;
  status: 'uploaded' | 'analyzing' | 'done' | 'error';
  exam_type: ExamType;
  weight: number;
  target_aa_ids: number[];
  has_practical_target: boolean;
  ai_evaluation: ExamEvaluation | null;
  exam_metadata?: ExamMetadata;
  created_at: string;
  updated_at: string;
}

export interface ExamStatsDashboard {
  total_exams: number;
  exams_analyzed: number;
  by_type: Record<string, number>;
  avg_overall_score: number | null;
  avg_aa_coverage: number | null;
  practical_exams_count: number;
  exams: {
    id: number;
    course_id: number;
    original_name: string | null;
    exam_type: ExamType;
    weight: number;
    status: 'uploaded' | 'analyzing' | 'done' | 'error';
    overall_score: number | null;
    questions_count: number | null;
    has_practical_questions: boolean;
    aa_coverage: number | null;
    bloom_distribution: Record<string, number> | null;
    created_at: string | null;
  }[];
}

export interface GeneratedQuestion {
  text: string;
  type: 'qcm' | 'ouvert' | 'pratique' | 'vrai_faux';
  bloom_level: keyof BloomDistribution;
  aa_targeted: string;
  difficulty: 'Fondamental' | 'Intermédiaire' | 'Avancé';
  points: number;
  answer_hint: string;
  options?: string[];
}

export interface TnExamDocument {
  id: number;
  title: string | null;
  file_path: string | null;
  file_type: string | null;
  document_type: string;
  course_id: number;
  created_at: string | null;
  updated_at: string | null;
  has_analysis: boolean;
  has_report: boolean;
  analysis_report_path: string | null;
  analysis_results: TnExamAnalysisResults | null;
  total_questions: number | null;
  source_coverage_rate: number | null;
  difficulty_index: number | null;
  bloom_index: number | null;
}

// ─── TN Exam Analysis Types ───────────────────────────────────────────────────

export interface TnExamQuestion {
  id: number;
  text?: string;
  question_text?: string;
  points?: number;
  Bloom_Level?: string;
  Difficulty?: string;
  'AA#'?: string[];
  Type?: string;
  estimated_time_min?: number;
  source_docs?: string[];
}

export interface TnExamMetadata {
  declared_duration_min?: number;
  exam_type?: string;
  date?: string;
  module?: string;
  enseignant?: string;
  semestre?: string;
  niveau?: string;
  specialite?: string;
  nb_questions?: number;
}

export interface TnExamTimeAnalysis {
  total_estimated_min: number;
  total_with_buffer_min: number;
  declared_duration_min: number | null;
  verdict: 'OK' | 'TROP_LONG' | 'TROP_COURT';
  per_question: { id: number; estimated_min: number }[];
}

export interface TnExamAnalysisResults {
  exam_metadata?: TnExamMetadata;
  questions?: TnExamQuestion[];
  total_questions?: number;
  total_max_points?: number;
  declared_duration_min?: number;
  bloom_percentages?: Record<string, number>;
  difficulty_percentages?: Record<string, number>;
  aa_percentages?: Record<string, number>;
  source_coverage_rate?: number;
  difficulty_index?: number;
  bloom_index?: number;
  time_analysis?: TnExamTimeAnalysis;
  recommendations?: string[];
  strengths?: string[];
  [key: string]: unknown;
}

export interface ValidationCriterion {
  criterion: string;
  status: 'PASS' | 'WARNING' | 'FAIL';
  comment: string;
}

export interface TnExamValidationResponse {
  validation: ValidationCriterion[];
  summary: { total: number; pass: number; warning: number; fail: number };
  verdict_ok: boolean;
}

export interface TnExamListResponse {
  course: { id: number; title: string; description: string | null };
  exams: TnExamDocument[];
}

export interface TnExamDetailResponse {
  course: { id: number; title: string; description: string | null };
  exam: TnExamDocument;
}

export interface ExamHeaderData {
  exam_name?: string | null;
  class_name?: string | null;
  language?: string | null;
  declared_duration_min?: number | null;
  exam_date?: string | null;
  instructors?: string[] | null;
  num_pages?: number | null;
  exam_type?: string | null;
  answer_on_sheet?: boolean | null;
  calculator_allowed?: boolean | null;
  computer_allowed?: boolean | null;
  internet_allowed?: boolean | null;
  documents_allowed?: boolean | null;
  department?: string | null;
}

export interface ExtractedQuestion {
  id: number;
  question_number: string;
  exercise_number: number;
  exercise_title: string;
  text: string;
  has_figure: boolean;
  points: number | null;
  question_type: string;
  difficulty: string;
  bloom_level: string;
  estimated_time_min: number | null;
  /** AA numbers covered by this question (from extract-questions endpoint) */
  aa_numbers?: number[];
}

export interface QuestionSourceMatch {
  question_id: number;
  question_number: string;
  sources: {
    document_id: number;
    document_name: string;
    page: number;
    chapter_id?: number | null;
    chapter_name?: string | null;
    chapter_order?: number | null;
    section?: string | null;
    /** @deprecated use chapter_name instead */
    chapter?: string | null;
    excerpt?: string | null;
    similarity?: number | null;
  }[];
}

/** Question de la Nouvelle Proposition (existante ou générée) */
export interface ProposedQuestion {
  local_id: string;
  exercise_number: number;
  exercise_title: string;
  text: string;
  bloom: string;
  difficulty: string;
  type: string;
  points: number;
  estimated_time_min?: number;
  has_figure?: boolean;
  aa_numbers?: number[];
  rationale?: string;
  source: 'extracted' | 'generated';
  status: 'pending' | 'confirmed' | 'editing';
}

/** Config de génération pour un exercice */
export interface ExerciseGenConfig {
  exercise_number: number;
  exercise_title: string;
  dependent: boolean;
  questions_config: Array<{
    bloom: string;
    difficulty: string;
    type: string;
    points: number;
  }>;
}
