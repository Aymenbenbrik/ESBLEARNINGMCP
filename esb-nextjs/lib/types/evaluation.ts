export interface StudentAAScore {
  id: number;
  student_id: number;
  aa_id: number;
  aa_code: string | null;
  aa_description: string | null;
  course_id: number;
  score: number;
  calculated_at: string | null;
}

export interface StudentAAPScore {
  id: number;
  student_id: number;
  aap_id: number;
  aap_code: string | null;
  aap_description: string | null;
  program_id: number;
  score: number;
  calculated_at: string | null;
}

export interface StudentAAScoresResponse {
  scores: StudentAAScore[];
}

export interface StudentAAPScoresResponse {
  scores: StudentAAPScore[];
}

// ── Teacher / Admin heatmap types ────────────────────────────────

export interface AAEvaluationAA {
  id: number;
  number: number;
  description: string;
}

export interface AAEvaluationStudent {
  id: number;
  username: string;
  email: string;
  scores: (number | null)[];
}

export interface AAEvaluationResponse {
  aas: AAEvaluationAA[];
  students: AAEvaluationStudent[];
}

export interface AAPEvaluationAAP {
  id: number;
  code: string;
  description: string;
  order: number;
}

export interface AAPEvaluationStudent {
  id: number;
  username: string;
  email: string;
  class_name: string | null;
  scores: (number | null)[];
}

export interface AAPEvaluationResponse {
  aaps: AAPEvaluationAAP[];
  students: AAPEvaluationStudent[];
}

export interface CalculateScoresResponse {
  message: string;
  count: number;
}
