import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { referencesApi, sectionContentApi, sectionActivitiesApi, sectionQuizApi } from '../api/references';
import {
  CourseReference,
  ChapterReferenceLink,
  CreateReferenceData,
  UpdateReferenceData,
  UpdateChapterReferenceData,
  SectionContent,
  UpdateSectionContentData,
  SectionQuizQuestion,
  CreateQuizFromBankData,
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

/** Extract section content from chapter document */
export function useExtractSectionContent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionId, documentId }: { sectionId: number; documentId?: number }) =>
      sectionContentApi.extractFromDocument(sectionId, documentId),
    onSuccess: ({ content }) => {
      qc.setQueryData(sectionContentKeys.forSection(content.section_id), content);
      toast.success('Contenu extrait du document — en attente de validation');
    },
    onError: () => toast.error('Erreur lors de l\'extraction'),
  });
}

// ─── Section Activities ───────────────────────────────────────────────────────

export const sectionActivityKeys = {
  all: ['section-activities'] as const,
  forSection: (sectionId: number) => [...sectionActivityKeys.all, sectionId] as const,
};

export const sectionQuizKeys = {
  all: ['section-quiz'] as const,
  forSection: (sectionId: number) => [...sectionQuizKeys.all, sectionId] as const,
};

export function useSectionActivities(sectionId: number) {
  return useQuery({
    queryKey: sectionActivityKeys.forSection(sectionId),
    queryFn: () => sectionActivitiesApi.list(sectionId),
    enabled: !!sectionId,
    // Poll every 4 seconds while any YouTube video is still being indexed
    refetchInterval: (query) => {
      const data = query.state.data;
      if (Array.isArray(data) && data.some((a) => a.transcript_status === 'indexing')) {
        return 4_000;
      }
      return false;
    },
  });
}

export function useAddYoutubeActivity(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ url, title }: { url: string; title?: string }) =>
      sectionActivitiesApi.addYoutube(sectionId, url, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sectionActivityKeys.forSection(sectionId) });
      toast.success('Vidéo YouTube ajoutée');
    },
    onError: () => toast.error('URL YouTube invalide ou erreur serveur'),
  });
}

export function useDeleteActivity(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (activityId: number) => sectionActivitiesApi.deleteActivity(sectionId, activityId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sectionActivityKeys.forSection(sectionId) });
      toast.success('Activité supprimée');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}

// ─── Section Quiz ─────────────────────────────────────────────────────────────

export function useSectionQuiz(sectionId: number) {
  return useQuery({
    queryKey: sectionQuizKeys.forSection(sectionId),
    queryFn: () => sectionQuizApi.get(sectionId),
    enabled: !!sectionId,
  });
}

export function useGenerateSectionQuiz(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (numQuestions: number) => sectionQuizApi.generate(sectionId, numQuestions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sectionQuizKeys.forSection(sectionId) });
      toast.success('Questions générées — validez-les avant de publier');
    },
    onError: () => toast.error('Erreur lors de la génération du quiz'),
  });
}

export function useUpdateQuizQuestion(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, data }: { questionId: number; data: Partial<SectionQuizQuestion> & { status?: string } }) =>
      sectionQuizApi.updateQuestion(sectionId, questionId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sectionQuizKeys.forSection(sectionId) });
    },
    onError: () => toast.error('Erreur lors de la mise à jour'),
  });
}

export function usePublishSectionQuiz(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => sectionQuizApi.publish(sectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sectionQuizKeys.forSection(sectionId) });
      qc.invalidateQueries({ queryKey: sectionActivityKeys.forSection(sectionId) });
      toast.success('Quiz publié ✓');
    },
    onError: () => toast.error('Impossible de publier — approuvez au moins une question'),
  });
}

export function useDeleteSectionQuiz(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => sectionQuizApi.deleteQuiz(sectionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: sectionQuizKeys.forSection(sectionId) });
      qc.invalidateQueries({ queryKey: sectionActivityKeys.forSection(sectionId) });
      toast.success('Quiz supprimé');
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
}

export function useTakeQuiz(sectionId: number) {
  return useQuery({
    queryKey: [...sectionQuizKeys.forSection(sectionId), 'take'],
    queryFn: () => sectionQuizApi.take(sectionId),
    enabled: !!sectionId,
  });
}

export function useSubmitSectionQuiz(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (answers: Record<string, string>) => sectionQuizApi.submit(sectionId, answers),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: sectionQuizKeys.forSection(sectionId) });
      toast.success(`Résultat : ${data.score}/${data.max_score} (${data.percent}%)`);
    },
    onError: () => toast.error('Erreur lors de la soumission'),
  });
}

export function useQuizBankStats(sectionId: number) {
  return useQuery({
    queryKey: [...sectionQuizKeys.forSection(sectionId), 'bank-stats'],
    queryFn: () => sectionQuizApi.bankStats(sectionId),
    enabled: !!sectionId,
    staleTime: 30_000,
  });
}

export function useCreateQuizFromBank(sectionId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateQuizFromBankData) => sectionQuizApi.createFromBank(sectionId, data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: sectionQuizKeys.forSection(sectionId) });
      toast.success(data.message || 'Quiz créé depuis la banque — validez les questions');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Erreur lors de la création du quiz';
      toast.error(msg);
    },
  });
}
