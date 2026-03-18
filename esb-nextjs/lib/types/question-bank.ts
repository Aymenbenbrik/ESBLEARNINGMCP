// ============================================================================
// QUESTION BANK TYPES
// ============================================================================

export type QuestionType = 'mcq' | 'true_false' | 'drag_drop' | 'open_ended' | 'code';

export interface QuestionBankQuestion {
  id: number;
  question_text: string;
  question_type: 'mcq' | 'open_ended';
  bloom_level: string;
  clo: string; // CLO for BGA or AAA code for TN
  difficulty: string;
  is_approved: boolean;
  approved_at: string | null;
  chapter_id: number;
  chapter_title: string | null;
  correct_choice?: string | null; // Only visible to teachers
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
}

// ─── Course-scoped Question Bank (new in-module bank) ────────────────────────

export interface CourseQBankQuestion {
  id: number;
  question_text: string;
  question_type: QuestionType;
  bloom_level: string | null;
  difficulty: 'easy' | 'medium' | 'hard' | string;
  aa_code: string;
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  correct_choice: string | null;   // null for students
  explanation: string | null;
  answer: string | null;           // model answer (all types)
  is_approved: boolean;
  approved_at: string | null;
  created_at: string | null;
}

export interface CourseQBankGroup {
  [aa_code: string]: CourseQBankQuestion[];
}

export interface CourseQBankResponse {
  groups: CourseQBankGroup;
  total: number;
  aa_codes: string[];
}

export interface AAListItem {
  code: string;
  description: string;
}

export interface CourseAAListResponse {
  aa_list: AAListItem[];
}

export interface GenerateCourseQBankData {
  aa_codes: string[];   // multi-select (replaces old aa_code)
  bloom_level: string;
  difficulty: string;
  question_type: QuestionType;
  num_questions: number;
}

export interface GenerateCourseQBankResponse {
  message: string;
  questions: CourseQBankQuestion[];
}

export interface UpdateCourseQBankData {
  action?: 'approve' | 'reject';
  question_text?: string;
  choice_a?: string;
  choice_b?: string;
  choice_c?: string;
  correct_choice?: string;
  explanation?: string;
  answer?: string;
  bloom_level?: string;
  difficulty?: string;
  aa_code?: string;
}

export interface QuestionBankListResponse {
  questions: QuestionBankQuestion[];
  total: number;
  total_unfiltered: number; // Total questions without chapter/AAA/bloom/difficulty filters
  limit: number;
  offset: number;
}

// ============================================================================
// FILTER OPTIONS TYPES
// ============================================================================

export interface ChapterOption {
  id: number;
  title: string;
  order: number;
}

export interface AACode {
  number: number;
  code: string;
  description: string;
  section_links: number;
  chapter_links: number;
}

export interface QuestionBankFilters {
  course_id: number;
  chapter_id?: string; // Comma-separated IDs
  aaa?: string; // Comma-separated AAA codes
  bloom_level?: string;
  difficulty?: string;
  approved?: 'true' | 'false' | 'all';
  limit?: number;
  offset?: number;
}

export interface RevisionFilterOptions {
  course: {
    id: number;
    title: string;
  };
  filter_options: {
    chapters: ChapterOption[];
    aa_codes: string[];
    bloom_levels: string[];
    difficulty_levels: string[];
  };
  total_approved_questions: number;
}

// ============================================================================
// QUESTION GENERATION TYPES (BGA)
// ============================================================================

export interface BloomDistribution {
  remember?: number;
  understand?: number;
  apply?: number;
  analyze?: number;
  evaluate?: number;
  create?: number;
}

export interface DifficultyDistribution {
  easy?: number;
  medium?: number;
  hard?: number;
}

export interface GenerateQuestionsBGAData {
  course_id: number;
  chapter_id: number;
  clo: string;
  num_questions: number;
  bloom_distribution: BloomDistribution;
  difficulty_distribution: DifficultyDistribution;
}

export interface GeneratedQuestion {
  id: number;
  question_text: string;
  bloom_level: string;
  difficulty: string;
}

export interface GenerateQuestionsResponse {
  message: string;
  questions: GeneratedQuestion[];
}

// ============================================================================
// QUESTION GENERATION TYPES (TN)
// ============================================================================

export interface TNSelection {
  chapter_id: number;
  section_id: number;
  aa_number: number;
}

export interface GenerateQuestionsTNData {
  selections: TNSelection[];
  num_questions: number;
  bloom_distribution: BloomDistribution;
  difficulty_distribution: DifficultyDistribution;
}

export interface GeneratedTNQuestion {
  id: number;
  question_text: string;
  aaa_code: string;
  bloom_level: string;
  difficulty: string;
}

export interface GenerateTNQuestionsResponse {
  message: string;
  questions: GeneratedTNQuestion[];
  aa_distribution: Record<string, number>;
}

// ============================================================================
// APPROVAL TYPES
// ============================================================================

export interface MetadataUpdate {
  bloom_level?: string;
  difficulty?: string;
  clo?: string;
}

export interface ApproveQuestionsData {
  course_id: number;
  question_ids: number[];
  action: 'approve' | 'reject';
  metadata_updates?: Record<string, MetadataUpdate>;
}

export interface ApproveQuestionsResponse {
  message: string;
  approved: number;
  rejected: number;
}

export interface ApproveTNQuestionsData {
  question_ids: number[];
  chapter_mapping?: Record<string, number>;
}

export interface ApproveTNQuestionsResponse {
  message: string;
  approved: number;
}

// ============================================================================
// REVISION QUIZ TYPES
// ============================================================================

export interface RevisionQuizFilters {
  num_questions: number;
  chapter_ids?: number[];
  aa_codes?: string[];
  bloom_levels?: string[];
  difficulty_levels?: string[];
}

export interface RevisionQuizQuestion {
  id: number;
  question_text: string;
  question_type: 'mcq' | 'open_ended';
  choice_a: string | null;
  choice_b: string | null;
  choice_c: string | null;
  bloom_level: string;
  difficulty: string;
  // Note: correct_choice is NOT included in student view
}

export interface RevisionQuiz {
  id: number;
  title: string;
  course_id: number;
  created_at: string;
  num_questions: number;
}

export interface CreateRevisionQuizResponse {
  message: string;
  quiz: RevisionQuiz;
  questions: RevisionQuizQuestion[];
}

// ============================================================================
// AAA CODES TYPES
// ============================================================================

export interface aaCodesResponse {
  aaas: (AACode | { code: string })[];
}

export interface AAAOption {
  value: string;
  label: string;
}
