// Types for the Syllabus Versioning system

export type SyllabusVersionStatus =
  | 'baseline'
  | 'draft'
  | 'proposed'
  | 'validated'
  | 'rejected';

export interface VersionUser {
  id: number;
  name: string;
}

// ---- Snapshot sub-types ----

export interface SnapshotAdmin {
  module_name?: string;
  code_ue?: string;
  code_ecue?: string;
  field?: string;
  department?: string;
  option?: string;
  volume_presentiel?: string;
  volume_personnel?: string;
  coefficient?: number;
  credits?: number;
  responsible?: string;
  teachers?: string[];
}

export interface SnapshotAA {
  number: number;
  description: string;
}

export interface SnapshotAAP {
  number: number;
  selected: boolean;
}

export interface SnapshotSection {
  index: string;
  title: string;
  aa_links?: number[];
}

export interface SnapshotChapter {
  index: number;
  title: string;
  aa_links?: number[];
  sections: SnapshotSection[];
}

export interface SnapshotEvaluation {
  methods?: unknown[];
  criteria?: unknown[];
  measures?: unknown[];
  final_grade_formula?: string;
}

export interface SnapshotBibEntry {
  position: number;
  entry: string;
}

export interface SyllabusSnapshot {
  admin: SnapshotAdmin;
  aa: SnapshotAA[];
  aap: SnapshotAAP[];
  chapters: SnapshotChapter[];
  evaluation: SnapshotEvaluation;
  bibliography: SnapshotBibEntry[];
}

// ---- Diff types ----

export interface FieldChange {
  from: unknown;
  to: unknown;
}

export interface AAChange {
  number: number;
  description?: string;
  from?: string;
  to?: string;
}

export interface SectionChange {
  index: string;
  title?: string;
  from?: string;
  to?: string;
}

export interface ChapterChange {
  index: number;
  title?: string;
  from?: string;
  to?: string;
  sections?: {
    added: SectionChange[];
    removed: SectionChange[];
    modified: SectionChange[];
  };
}

export interface BibChange {
  position: number;
  entry?: string;
  from?: string;
  to?: string;
}

export interface SyllabusDiff {
  admin?: Record<string, FieldChange>;
  aa?: {
    added: AAChange[];
    removed: AAChange[];
    modified: AAChange[];
  };
  chapters?: {
    added: ChapterChange[];
    removed: ChapterChange[];
    modified: ChapterChange[];
  };
  bibliography?: {
    added: BibChange[];
    removed: BibChange[];
    modified: BibChange[];
  };
}

// ---- Version ----

export interface SyllabusVersion {
  id: number;
  syllabus_id: number;
  version_number: number;
  label: string | null;
  notes: string | null;
  rejection_notes: string | null;
  status: SyllabusVersionStatus;
  is_baseline: boolean;
  diff_summary: SyllabusDiff | null;
  snapshot?: SyllabusSnapshot; // only present when include_snapshot=true
  created_by: VersionUser | null;
  created_at: string | null;
  validated_by: VersionUser | null;
  validated_at: string | null;
  applied_at: string | null;
}

export interface SyllabusVersionsResponse {
  versions: SyllabusVersion[];
  total: number;
  syllabus_id: number;
}

export interface DiffResponse {
  from: SyllabusVersion;
  to: SyllabusVersion;
  diff: SyllabusDiff;
  has_changes: boolean;
}

export interface ChangeReportResponse {
  course: { id: number; title: string };
  baseline: SyllabusVersion;
  latest: SyllabusVersion | null;
  timeline: Array<{
    version_number: number;
    label: string | null;
    status: SyllabusVersionStatus;
    created_at: string | null;
    notes: string | null;
    diff_summary: SyllabusDiff | null;
  }>;
  diff: SyllabusDiff;
  has_changes: boolean;
  ai_narrative: string | null;
  total_versions: number;
}

// ---- Request types ----

export interface CreateVersionRequest {
  label?: string;
  notes?: string;
  snapshot?: Partial<SyllabusSnapshot>;
}

export interface UpdateVersionRequest {
  label?: string;
  notes?: string;
  snapshot?: Partial<SyllabusSnapshot>;
}

export interface RejectVersionRequest {
  rejection_notes?: string;
}
