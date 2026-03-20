export type TPLanguage = 'python' | 'sql' | 'r' | 'java' | 'c' | 'cpp';
export type TPStatus = 'draft' | 'published';
export type CorrectionStatus = 'pending' | 'correcting' | 'done' | 'failed';
export type SubmissionStatus = 'submitted' | 'correcting' | 'graded';

export interface TPQuestion {
  id: number;
  title: string;
  text: string;
  points: number;
}

export interface PracticalWork {
  id: number;
  section_id: number;
  title: string;
  language: TPLanguage;
  max_grade: number;
  status: TPStatus;
  tp_nature: 'formative' | 'sommative';
  statement: string | null;
  statement_source: 'teacher' | 'ai';
  aa_codes: string[];
  reference_validated: boolean;
  correction_criteria: string | null;
  reference_solution?: string; // only for teachers
  created_at: string;
  updated_at: string;
  submission_count: number;
  questions: TPQuestion[] | null;
}

export interface PracticalWorkSubmission {
  id: number;
  tp_id: number;
  student_id: number;
  student_name: string;
  attempt_number: number;
  submitted_at: string;
  correction_status: CorrectionStatus;
  correction_report: string | null;
  proposed_grade: number | null;
  status: SubmissionStatus;
  final_grade: number | null;
  teacher_comment: string | null;
  graded_at: string | null;
  code?: string;
  answers?: { question_id: number; code: string }[];
}

export interface CreateTPData {
  title: string;
  language: TPLanguage;
  max_grade?: number;
  statement?: string;
  tp_nature?: 'formative' | 'sommative';
}

export interface UpdateTPData {
  title?: string;
  language?: TPLanguage;
  max_grade?: number;
  statement?: string;
  aa_codes?: string[];
  reference_solution?: string;
  reference_validated?: boolean;
  correction_criteria?: string;
  questions?: TPQuestion[];
}

export interface GenerateStatementResult {
  statement: string;
  title: string;
  statement_source: 'ai';
}

export interface SuggestAAResult {
  suggested_aa: string[];
  justification: string;
}

export interface GenerateReferenceResult {
  reference_solution: string;
  correction_criteria: string;
}

export interface SubmitCodeData {
  code?: string;
  answers?: { question_id: number; code: string }[];
}

export interface GradeSubmissionData {
  final_grade: number;
  teacher_comment?: string;
}
