import { apiClient } from './client';
import {
  CourseReference,
  ChapterReferenceLink,
  CreateReferenceData,
  UpdateReferenceData,
  UpdateChapterReferenceData,
  ImportBibResult,
  SectionContent,
  UpdateSectionContentData,
} from '../types/references';

// ─── Course References ────────────────────────────────────────────────────────

export const referencesApi = {
  /**
   * List all references for a course.
   * Pass chapterId to also get linked_to_chapter + pages for each ref.
   */
  listForCourse: async (courseId: number, chapterId?: number): Promise<CourseReference[]> => {
    const params = chapterId ? `?chapter_id=${chapterId}` : '';
    const res = await apiClient.get<{ references: CourseReference[] }>(
      `/api/v1/courses/${courseId}/references${params}`
    );
    return res.data.references;
  },

  /** Create a manual reference for a course */
  create: async (courseId: number, data: CreateReferenceData): Promise<CourseReference> => {
    const res = await apiClient.post<CourseReference>(
      `/api/v1/courses/${courseId}/references`,
      data
    );
    return res.data;
  },

  /** Update reference metadata */
  update: async (refId: number, data: UpdateReferenceData): Promise<CourseReference> => {
    const res = await apiClient.put<CourseReference>(`/api/v1/references/${refId}`, data);
    return res.data;
  },

  /** Delete a reference */
  delete: async (refId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/references/${refId}`);
  },

  /** Import TN bibliography entries as references (idempotent) */
  importBibliography: async (courseId: number): Promise<ImportBibResult> => {
    const res = await apiClient.post<ImportBibResult>(
      `/api/v1/courses/${courseId}/references/import-bib`
    );
    return res.data;
  },

  // ── Chapter-level links ────────────────────────────────────────────────────

  /** List active references linked to a chapter */
  listForChapter: async (chapterId: number): Promise<ChapterReferenceLink[]> => {
    const res = await apiClient.get<{ references: ChapterReferenceLink[] }>(
      `/api/v1/chapters/${chapterId}/references`
    );
    return res.data.references;
  },

  /** Link a reference to a chapter (or reactivate) */
  linkToChapter: async (
    chapterId: number,
    referenceId: number,
    pages?: string
  ): Promise<ChapterReferenceLink> => {
    const res = await apiClient.post<ChapterReferenceLink>(
      `/api/v1/chapters/${chapterId}/references`,
      { reference_id: referenceId, pages }
    );
    return res.data;
  },

  /** Update pages or active status */
  updateChapterLink: async (
    chapterId: number,
    referenceId: number,
    data: UpdateChapterReferenceData
  ): Promise<ChapterReferenceLink> => {
    const res = await apiClient.put<ChapterReferenceLink>(
      `/api/v1/chapters/${chapterId}/references/${referenceId}`,
      data
    );
    return res.data;
  },

  /** Unlink (deactivate) a reference from a chapter */
  unlinkFromChapter: async (chapterId: number, referenceId: number): Promise<void> => {
    await apiClient.delete(`/api/v1/chapters/${chapterId}/references/${referenceId}`);
  },
};

// ─── Section Content ──────────────────────────────────────────────────────────

export const sectionContentApi = {
  /** Generate AI content for a section */
  generate: async (sectionId: number): Promise<SectionContent> => {
    const res = await apiClient.post<SectionContent>(
      `/api/v1/sections/${sectionId}/content/generate`
    );
    return res.data;
  },

  /** Get current content for a section */
  get: async (sectionId: number): Promise<SectionContent | null> => {
    const res = await apiClient.get<{ content: SectionContent | null }>(
      `/api/v1/sections/${sectionId}/content`
    );
    return res.data.content;
  },

  /** Approve / reject / edit content */
  update: async (sectionId: number, data: UpdateSectionContentData): Promise<SectionContent> => {
    const res = await apiClient.put<SectionContent>(
      `/api/v1/sections/${sectionId}/content`,
      data
    );
    return res.data;
  },
};
