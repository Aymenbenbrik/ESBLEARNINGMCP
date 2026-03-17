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
