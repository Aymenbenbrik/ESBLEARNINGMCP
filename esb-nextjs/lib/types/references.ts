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

export type ActivityType = 'youtube' | 'quiz';

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
}

export interface SectionQuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string;
  question_type: 'mcq';
  choice_a: string;
  choice_b: string;
  choice_c: string;
  choice_d: string;
  correct_choice?: string;   // hidden from students
  explanation?: string;
  points: number;
  status: QuestionStatus;
  bloom_level: string;
  difficulty: 'easy' | 'medium' | 'hard';
  aa_code: string;           // e.g. "AA 1"
  position: number;
}

export interface SectionQuizSubmission {
  id: number;
  quiz_id: number;
  student_id: number;
  answers: Record<string, string>;
  score: number;
  max_score: number;
  submitted_at: string;
}

export interface TakeQuizResponse {
  quiz: { id: number; title: string; max_score: number; question_count: number };
  questions: SectionQuizQuestion[];
  already_submitted: boolean;
  result?: SectionQuizSubmission;
}
