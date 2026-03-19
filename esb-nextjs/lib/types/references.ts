// ─── Reference Types ──────────────────────────────────────────────────────────

export interface CourseReference {
  id: number;
  course_id: number;
  title: string;
  authors: string | null;
  url: string | null;
  ref_type: 'book' | 'article' | 'online' | 'other';
  from_bibliography: boolean;
  tn_bib_id: number | null;
  created_at: string;
  // enriched when queried with chapter_id param
  linked_to_chapter?: boolean;
  pages?: string | null;
}

export interface ChapterReferenceLink {
  reference_id: number;
  chapter_id: number;
  pages: string | null;
  is_active: boolean;
  title: string;
  authors: string | null;
  url: string | null;
  ref_type: string;
  from_bibliography: boolean;
}

export interface CreateReferenceData {
  title: string;
  authors?: string;
  url?: string;
  ref_type?: 'book' | 'article' | 'online' | 'other';
  link_all_chapters?: boolean;
}

export interface UpdateReferenceData {
  title?: string;
  authors?: string;
  url?: string;
  ref_type?: 'book' | 'article' | 'online' | 'other';
}

export interface UpdateChapterReferenceData {
  pages?: string | null;
  is_active?: boolean;
}

export interface ImportBibResult {
  message: string;
  imported: number;
  skipped: number;
}

// ─── Section Content Types ────────────────────────────────────────────────────

export type SectionContentStatus = 'pending' | 'approved' | 'rejected';

export interface SectionContent {
  id: number;
  section_id: number;
  content: string;
  status: SectionContentStatus;
  generated_at: string;
  validated_at: string | null;
  validated_by_id: number | null;
}

export interface UpdateSectionContentData {
  status?: SectionContentStatus;
  content?: string;
}

// ─── Section Activities Types ─────────────────────────────────────────────────

export type ActivityType = 'youtube' | 'quiz' | 'assignment';

export interface SectionActivity {
  id: number;
  section_id: number;
  activity_type: ActivityType;
  title: string;
  position: number;
  created_at: string;
  youtube_url?: string | null;
  youtube_embed_id?: string | null;
  section_quiz_id?: number | null;
  quiz?: SectionQuiz;
  document_id?: number | null;
  transcript_status?: 'indexing' | 'indexed' | 'failed' | null;
}

export type QuizStatus = 'draft' | 'published';
export type QuestionStatus = 'pending' | 'approved' | 'rejected';

export interface SectionQuiz {
  id: number;
  section_id: number;
  title: string;
  status: QuizStatus;
  max_score: number;
  weight_percent: number;
  created_at: string;
  question_count: number;
  approved_count: number;
  questions?: SectionQuizQuestion[];
  // Config fields
  start_date?: string | null;
  end_date?: string | null;
  duration_minutes?: number | null;
  max_attempts?: number;
  show_feedback?: boolean;
  password_protected?: boolean;
}

export interface QuizConfig {
  start_date?: string | null;
  end_date?: string | null;
  duration_minutes?: number | null;
  max_attempts?: number;
  show_feedback?: boolean;
  password?: string;
  weight_percent?: number;
}

export interface SectionQuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string;
  question_type: 'mcq' | 'true_false' | 'open_ended' | 'code' | 'drag_drop';
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  choice_d: string | null;
  correct_choice?: string;   // hidden from students
  explanation?: string;
  points: number;
  status: QuestionStatus;
  bloom_level: string;
  difficulty: 'easy' | 'medium' | 'hard';
  aa_code: string;           // e.g. "AA 1"
  position: number;
}

// ─── Quiz Bank Types ──────────────────────────────────────────────────────────

export interface QuizBankStats {
  total: number;
  aa_codes: string[];
  bloom_levels: string[];
  difficulties: string[];
}

export interface CreateQuizFromBankData {
  num_questions: number;
  aa_codes?: string[];
  bloom_levels?: string[];
  difficulties?: string[];
  title?: string;
}

export interface SectionQuizSubmission {
  id: number;
  quiz_id: number;
  student_id: number;
  student_name: string | null;
  student_email: string | null;
  answers: Record<string, string>;
  graded_answers: Record<string, GradedAnswer>;
  score: number;
  max_score: number;
  grading_status: 'auto' | 'pending' | 'graded';
  submitted_at: string;
  attempt_number?: number;
}

export interface GradedAnswer {
  answer: string;
  proposed: number;
  final: number | null;
  comment: string;
  validated: boolean;
}

export type SectionQuizSubmissionDetailed = SectionQuizSubmission;

export interface TakeQuizResponse {
  quiz: SectionQuiz;
  questions: SectionQuizQuestion[];
  already_submitted: boolean;
  result?: SectionQuizSubmission;
  attempts_used?: number;
  max_attempts?: number;
}

export interface SubmitQuizResponse {
  message?: string;
  attempt_number?: number;
  attempts_remaining?: number;
  grading_status?: 'auto' | 'pending';
  result: SectionQuizSubmission;
  // Only present if show_feedback=true
  score?: number;
  max_score?: number;
  percent?: number;
  graded_answers?: Record<string, GradedAnswer>;
}

// ─── Section Assignment Types ─────────────────────────────────────────────────

export interface SectionAssignment {
  id: number;
  section_id: number;
  title: string;
  description: string | null;
  deliverables: string | null;
  deadline: string | null; // ISO datetime
  allow_late: boolean;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  // Teacher extras
  submission_count?: number;
  // Student extras
  my_submissions?: AssignmentSubmission[];
  attempts_used?: number;
}

export interface AssignmentSubmission {
  id: number;
  assignment_id: number;
  student_id: number;
  student_name: string | null;
  student_email: string | null;
  files: AssignmentFile[];
  attempt_number: number;
  is_late: boolean;
  status: 'submitted' | 'graded';
  grade: number | null;
  feedback: string | null;
  submitted_at: string;
}

export interface AssignmentFile {
  path: string;
  original_name: string;
  file_type: string;
  size: number; // bytes
}
