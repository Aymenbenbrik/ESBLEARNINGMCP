export interface Quiz {
  id: number;
  document_id: number;
  student_id: number;
  score: number | null;
  completed_at: string | null;
  feedback: string | null;
  num_questions: number;
  created_at: string;
  is_disqualified: boolean;
  violations_count: number;
  disqualified_at: string | null;
}

export type ViolationType =
  | 'fullscreen_exit'
  | 'copy'
  | 'paste'
  | 'tab_switch'
  | 'right_click'
  | 'print_screen'
  | 'select_all';

export interface QuizViolation {
  id: number;
  quiz_id: number;
  violation_type: ViolationType;
  occurred_at: string;
  is_warning: boolean;
}

export interface QuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string;
  question_type: 'mcq' | 'open_ended';
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  correct_choice: string | null;
  student_choice: string | null;
  is_correct: boolean | null;
  explanation: string | null;
  bloom_level: string;
  clo: string;
  difficulty: string;
  score: number | null;
}

export interface QuizSetupData {
  num_questions: number;
  difficulty?: string;
  num_mcq?: number;
  num_open?: number;
  bloom_remember?: number;
  bloom_understand?: number;
  bloom_apply?: number;
  bloom_analyze?: number;
  bloom_evaluate?: number;
  bloom_create?: number;
}

export interface ChapterQuizGenerateData {
  chapter_ids?: number[];
  section_ids?: number[];
  num_mcq: number;
  num_open: number;
  bloom_distribution: {
    remember: number;
    understand: number;
    apply: number;
    analyze: number;
    evaluate: number;
    create: number;
  };
  difficulty_distribution: {
    easy: number;
    medium: number;
    hard: number;
  };
  exam_style?: string;
}

export interface QuizResults {
  quiz: Quiz;
  questions: QuizQuestion[];
  bloom_stats: Record<string, { total: number; correct: number; success_rate: number }>;
  clo_stats: Record<string, { total: number; correct: number; success_rate: number }>;
}

export interface QuizHistoryItem {
  id: number;
  score: number;
  completed_at: string;
  num_questions: number;
  document_title: string;
}

export interface QuizAnswerData {
  answer: string;
}

export interface QuizSubmission {
  quiz_id: number;
  student_id: number;
  student_name: string;
  student_email: string;
  score: number | null;
  completed_at: string | null;
  created_at: string;
  is_disqualified: boolean;
  violations_count: number;
  disqualified_at: string | null;
}

export interface QuizSubmissionsResponse {
  chapter_title: string;
  total_submissions: number;
  disqualified_count: number;
  passed_count: number;
  failed_count: number;
  submissions: QuizSubmission[];
}
