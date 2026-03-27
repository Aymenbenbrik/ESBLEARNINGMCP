import {
  AADistributionItem,
  BloomDistributionItem,
  CourseDashboardStats,
  DifficultyDistributionItem,
} from './course';

// ---------------------------------------------------------------------------
// Program (formation) dashboard
// ---------------------------------------------------------------------------

export interface ProgramDashboardResponse {
  program: {
    id: number;
    name: string;
    description?: string | null;
    courses_count: number;
    classes_count: number;
  };
  stats: CourseDashboardStats;
  bloom_distribution: BloomDistributionItem[];
  difficulty_distribution: DifficultyDistributionItem[];
  aaa_distribution: AADistributionItem[];
  recent_quizzes: {
    id: number;
    student_name: string;
    score: number;
    completed_at: string;
  }[];
}

// ---------------------------------------------------------------------------
// Class dashboard
// ---------------------------------------------------------------------------

export interface ClassStudentPerformance {
  id: number;
  username: string;
  email?: string;
  quizzes_completed: number;
  avg_score: number;
}

export interface ClassDashboardResponse {
  class: {
    id: number;
    name: string;
    program_id?: number | null;
    program_name?: string | null;
    courses_count: number;
    students_count: number;
  };
  stats: CourseDashboardStats;
  bloom_distribution: BloomDistributionItem[];
  difficulty_distribution: DifficultyDistributionItem[];
  aaa_distribution: AADistributionItem[];
  recent_quizzes: {
    id: number;
    student_name: string;
    score: number;
    completed_at: string;
  }[];
  students: ClassStudentPerformance[];
}

// ---------------------------------------------------------------------------
// Student dashboard
// ---------------------------------------------------------------------------

export interface StudentCourseProgress {
  id: number;
  title: string;
  total_quizzes: number;
  quizzes_completed: number;
  avg_score: number;
  completion_rate: number;
}

export interface StudentDashboardStatsV2 {
  total_courses: number;
  total_quizzes: number;
  quizzes_completed: number;
  total_questions: number;
  avg_score: number;
  completion_rate: number;
}

export interface StudentDashboardResponseV2 {
  student: {
    id: number;
    username: string;
    email?: string;
    class_id?: number | null;
  };
  stats: StudentDashboardStatsV2;
  bloom_distribution: BloomDistributionItem[];
  difficulty_distribution: DifficultyDistributionItem[];
  aaa_distribution: AADistributionItem[];
  recent_quizzes: {
    id: number;
    student_name: string;
    score: number;
    completed_at: string;
    quiz_title?: string | null;
  }[];
  courses: StudentCourseProgress[];
}

// ---------------------------------------------------------------------------
// My dashboard (role-aware)
// ---------------------------------------------------------------------------

export interface MyDashboardResponse {
  kind: 'teacher' | 'global';
  user: {
    id: number;
    username: string;
    is_teacher: boolean;
    is_superuser: boolean;
  };
  stats: CourseDashboardStats;
  bloom_distribution: BloomDistributionItem[];
  difficulty_distribution: DifficultyDistributionItem[];
  aaa_distribution: AADistributionItem[];
  recent_quizzes: {
    id: number;
    student_name: string;
    score: number;
    completed_at: string;
  }[];
  exam_stats?: import('./course').ExamStatsDashboard;
  courses: {
    id: number;
    title: string;
    description?: string | null;
    stats: CourseDashboardStats;
    exam_stats?: import('./course').ExamStatsDashboard;
  }[];
}
