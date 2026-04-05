export type ExamStatus = 'draft' | 'active' | 'archived';
export type ExamSessionStatus = 'started' | 'submitted' | 'graded' | 'disqualified';
export type ExamQuestionType = 'mcq' | 'open_ended' | 'code' | 'true_false' | 'practical';
export type ExamViolationType =
  | 'fullscreen_exit'
  | 'face_not_detected'
  | 'multiple_faces'
  | 'copy'
  | 'paste'
  | 'tab_switch'
  | 'window_blur';

export interface ValidatedExam {
  id: number;
  course_id: number;
  title: string;
  description?: string;
  duration_minutes: number;
  total_points: number;
  status: ExamStatus;
  is_available: boolean;
  allow_retake: boolean;
  max_attempts: number;
  // Safe Exam settings
  safe_exam_enabled: boolean;
  fullscreen_required: boolean;
  disable_copy_paste: boolean;
  face_id_required: boolean;
  camera_monitoring: boolean;
  // Access control
  password_protected?: boolean;
  tn_exam_id?: number | null;
  // Metadata
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  question_count: number;
  has_file: boolean;
  questions?: ExamBankQuestion[];
}

export interface ExamBankQuestion {
  id: number;
  exam_id: number;
  order: number;
  question_text: string;
  question_type: ExamQuestionType;
  // MCQ choices
  choice_a?: string;
  choice_b?: string;
  choice_c?: string;
  choice_d?: string;
  correct_choice?: string; // Only visible to teachers
  // Answer
  answer?: string;          // Model answer, visible after submission
  answer_generated: boolean;
  // Metadata
  points: number;
  bloom_level?: string;
  clo?: string;
  difficulty?: string;
  programming_language?: string;
  expected_output?: string;
}

export interface ExamSession {
  id: number;
  exam_id: number;
  student_id: number;
  student_name?: string;
  attempt_number: number;
  status: ExamSessionStatus;
  face_verified: boolean;
  face_verification_score?: number;
  started_at?: string;
  submitted_at?: string;
  time_spent_seconds?: number;
  score?: number;
  max_score?: number;
  feedback?: string;
  feedback_published?: boolean;
  graded_at?: string;
  violation_count: number;
  answers?: ExamSessionAnswer[];
  exam?: ValidatedExam;
}

export interface ExamSessionAnswer {
  id: number;
  session_id: number;
  question_id: number;
  student_answer?: string;
  student_choice?: string;
  is_correct?: boolean;
  score?: number;
  ai_feedback?: string;
  answered_at?: string;
}

export interface ExamViolation {
  id: number;
  session_id: number;
  violation_type: ExamViolationType;
  occurred_at?: string;
  is_warning: boolean;
  details?: string;
}

export interface CreateExamData {
  course_id: number;
  title: string;
  description?: string;
  duration_minutes?: number;
  total_points?: number;
  allow_retake?: boolean;
  max_attempts?: number;
  safe_exam_enabled?: boolean;
  fullscreen_required?: boolean;
  disable_copy_paste?: boolean;
  face_id_required?: boolean;
  camera_monitoring?: boolean;
  exam_password?: string;
}

export interface GenerateFromTnData {
  tn_exam_id: number;
  course_id: number;
  title?: string;
  description?: string;
  duration_minutes?: number;
  total_points?: number;
  exam_password?: string;
  questions?: Array<{
    text?: string;
    Text?: string;
    points?: number;
    Bloom_Level?: string;
    Difficulty?: string;
    Type?: string;
  }>;
  safe_exam_enabled?: boolean;
  fullscreen_required?: boolean;
  disable_copy_paste?: boolean;
  face_id_required?: boolean;
  camera_monitoring?: boolean;
}

export interface ExamQuestionStats {
  question_id: number;
  question_text: string;
  bloom_level?: string;
  difficulty?: string;
  question_type?: string;
  clo?: string;
  points: number;
  avg_score: number | null;
  correct_count: number;
  total_answers: number;
  success_rate?: number | null;
}

export interface ExamResultsSummary {
  exam: ValidatedExam;
  total_sessions: number;
  submitted_count: number;
  graded_count: number;
  avg_score: number;
  pass_rate: number;
  sessions: ExamSession[];
  stats_by_question: ExamQuestionStats[];
}

export interface FaceVerificationResult {
  verified: boolean;
  score: number;
  message: string;
  no_reference?: boolean;
}
