import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referencesApi, sectionContentApi } from '../api/references';
import {
  CourseReference,
  ChapterReferenceLink,
  CreateReferenceData,
  UpdateReferenceData,
  UpdateChapterReferenceData,
  SectionContent,
  UpdateSectionContentData,
} from '../types/references';
import { toast } from 'sonner';

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const referenceKeys = {
  all: ['references'] as const,
  forCourse: (courseId: number, chapterId?: number) =>
    [...referenceKeys.all, 'course', courseId, chapterId] as const,
  forChapter: (chapterId: number) =>
    [...referenceKeys.all, 'chapter', chapterId] as const,
};

export const sectionContentKeys = {
  all: ['section-content'] as const,
  forSection: (sectionId: number) =>
    [...sectionContentKeys.all, sectionId] as const,
};

// ─── References — Course-level ────────────────────────────────────────────────

/** List all references for a course, with optional chapter link status */
export function useCourseReferences(courseId: number, chapterId?: number) {
  return useQuery({
    queryKey: referenceKeys.forCourse(courseId, chapterId),
    queryFn: () => referencesApi.listForCourse(courseId, chapterId),
    enabled: !!courseId,
  });
}

/** Create a manual reference */
export function useCreateReference(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateReferenceData) => referencesApi.create(courseId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referenceKeys.all });
      toast.success('Référence ajoutée');
    },
    onError: () => toast.error('Erreur lors de l\'ajout'),
  });
}

/** Update a reference */
export function useUpdateReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ refId, data }: { refId: number; data: UpdateReferenceData }) =>
      referencesApi.update(refId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referenceKeys.all });
      toast.success('Référence mise à jour');
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });
}

/** Delete a reference */
export function useDeleteReference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (refId: number) => referencesApi.delete(refId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: referenceKeys.all });
      toast.success('Référence supprimée');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}

/** Import TN bibliography entries */
export function useImportBibliography(courseId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => referencesApi.importBibliography(courseId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: referenceKeys.all });
      toast.success(`${data.imported} référence(s) importée(s)`);
    },
    onError: () => toast.error('Erreur lors de l\'import'),
  });
}

// ─── References — Chapter-level ───────────────────────────────────────────────

/** List active references for a chapter */
export function useChapterReferences(chapterId: number) {
  return useQuery({
    queryKey: referenceKeys.forChapter(chapterId),
    queryFn: () => referencesApi.listForChapter(chapterId),
    enabled: !!chapterId,
  });
}

/** Link / reactivate a reference for a chapter */
export function useLinkReference(chapterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ referenceId, pages }: { referenceId: number; pages?: string }) =>
      referencesApi.linkToChapter(chapterId, referenceId, pages),
    onSuccess: () => qc.invalidateQueries({ queryKey: referenceKeys.all }),
    onError: () => toast.error('Erreur lors de la liaison'),
  });
}

/** Update pages / is_active for a chapter-reference link */
export function useUpdateChapterReference(chapterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ referenceId, data }: { referenceId: number; data: UpdateChapterReferenceData }) =>
      referencesApi.updateChapterLink(chapterId, referenceId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: referenceKeys.all }),
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });
}

/** Unlink a reference from a chapter */
export function useUnlinkReference(chapterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (referenceId: number) => referencesApi.unlinkFromChapter(chapterId, referenceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: referenceKeys.all }),
    onError: () => toast.error('Erreur lors de la déliaison'),
  });
}

// ─── Section Content ──────────────────────────────────────────────────────────

/** Get AI content for a section */
export function useSectionContent(sectionId: number) {
  return useQuery({
    queryKey: sectionContentKeys.forSection(sectionId),
    queryFn: () => sectionContentApi.get(sectionId),
    enabled: !!sectionId,
  });
}

/** Generate AI content for a section */
export function useGenerateSectionContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sectionId: number) => sectionContentApi.generate(sectionId),
    onSuccess: (data) => {
      qc.setQueryData(sectionContentKeys.forSection(data.section_id), data);
      toast.success('Contenu généré — en attente de validation');
    },
    onError: () => toast.error('Erreur lors de la génération'),
  });
}

/** Approve / reject / edit section content */
export function useUpdateSectionContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, data }: { sectionId: number; data: UpdateSectionContentData }) =>
      sectionContentApi.update(sectionId, data),
    onSuccess: (data) => {
      qc.setQueryData(sectionContentKeys.forSection(data.section_id), data);
      if (data.status === 'approved') toast.success('Contenu approuvé ✓');
      else if (data.status === 'rejected') toast.info('Contenu rejeté');
    },
    onError: () => toast.error('Erreur lors de la validation'),
  });
}
