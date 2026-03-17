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

export interface AAADistributionItem {
  aaa_code: string;
  count: number;
  avg_score: number;
}

export interface CourseDashboardResponse {
  stats: CourseDashboardStats;
  bloom_distribution: BloomDistributionItem[];
  difficulty_distribution: DifficultyDistributionItem[];
  aaa_distribution?: AAADistributionItem[];
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
  aaa_stats?: AAADistributionItem[];
  recent_quizzes: {
    id: number;
    course_title: string;
    quiz_title: string;
    score: number;
    completed_at: string;
  }[];
}