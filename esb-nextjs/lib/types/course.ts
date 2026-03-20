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

export interface ExamEvaluation {
  overview: string;
  questions_count: number;
  estimated_duration: string;
  avg_difficulty: string;
  bloom_distribution: BloomDistribution;
  aa_alignment: AAAlignment[];
  strengths: string[];
  feedback: string[];
  suggestions: string[];
  overall_score: number;
}

export interface CourseExam {
  id: number;
  course_id: number;
  file_path: string | null;
  original_name: string | null;
  status: 'uploaded' | 'analyzing' | 'done' | 'error';
  ai_evaluation: ExamEvaluation | null;
  created_at: string;
  updated_at: string;
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
  analysis_results: Record<string, unknown> | null;
  total_questions: number | null;
  source_coverage_rate: number | null;
  difficulty_index: number | null;
  bloom_index: number | null;
}
