import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { programsApi } from '../api/programs';
import {
  ProgramsListResponse,
  ProgramDetails,
  CreateProgramData,
  UpdateProgramData,
  CreateProgramResponse,
  UpdateProgramResponse,
  DeleteProgramResponse,
  AddCourseToProgramData,
  AddCourseToProgramResponse,
  RemoveCourseFromProgramResponse,
  CreateClassData,
  CreateClassResponse,
  ProgramAAP,
  ProgramCompetence,
  AAPCompetenceMatrix,
  ExtractDescriptorResult,
  ProcessDescriptorResult,
} from '../types/admin';
import { toast } from 'sonner';

// Query keys
export const programKeys = {
  all: ['programs'] as const,
  lists: () => [...programKeys.all, 'list'] as const,
  list: () => [...programKeys.lists()] as const,
  details: () => [...programKeys.all, 'detail'] as const,
  detail: (id: number) => [...programKeys.details(), id] as const,
  aaps: (id: number) => [...programKeys.all, 'aaps', id] as const,
  competences: (id: number) => [...programKeys.all, 'competences', id] as const,
  matrix: (id: number) => [...programKeys.all, 'matrix', id] as const,
};

/**
 * Get list of all programs (superuser only)
 */
export function usePrograms() {
  return useQuery<ProgramsListResponse>({
    queryKey: programKeys.list(),
    queryFn: programsApi.list,
  });
}

/**
 * Get program details by ID (superuser only)
 */
export function useProgram(id: number) {
  return useQuery<ProgramDetails>({
    queryKey: programKeys.detail(id),
    queryFn: () => programsApi.get(id),
    enabled: !!id,
  });
}

/**
 * Create a new program (superuser only)
 */
export function useCreateProgram() {
  const queryClient = useQueryClient();

  return useMutation<CreateProgramResponse, Error, CreateProgramData>({
    mutationFn: programsApi.create,
    onSuccess: (data) => {
      // Invalidate programs list to refetch
      queryClient.invalidateQueries({ queryKey: programKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create program');
    },
  });
}

/**
 * Update a program (superuser only)
 */
export function useUpdateProgram() {
  const queryClient = useQueryClient();

  return useMutation<UpdateProgramResponse, Error, { id: number; data: UpdateProgramData }>({
    mutationFn: ({ id, data }) => programsApi.update(id, data),
    onSuccess: (data, variables) => {
      // Invalidate program detail and list
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: programKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update program');
    },
  });
}

/**
 * Delete a program (superuser only)
 */
export function useDeleteProgram() {
  const queryClient = useQueryClient();

  return useMutation<DeleteProgramResponse, Error, number>({
    mutationFn: programsApi.delete,
    onSuccess: (data) => {
      // Invalidate programs list
      queryClient.invalidateQueries({ queryKey: programKeys.lists() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete program');
    },
  });
}

/**
 * Add a course to a program (superuser only)
 */
export function useAddCourseToProgram() {
  const queryClient = useQueryClient();

  return useMutation<
    AddCourseToProgramResponse,
    Error,
    { programId: number; data: AddCourseToProgramData }
  >({
    mutationFn: ({ programId, data }) => programsApi.addCourse(programId, data),
    onSuccess: (data, variables) => {
      // Invalidate program detail to show new course
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to add course to program');
    },
  });
}

/**
 * Remove a course from a program (superuser only)
 */
export function useRemoveCourseFromProgram() {
  const queryClient = useQueryClient();

  return useMutation<
    RemoveCourseFromProgramResponse,
    Error,
    { programId: number; courseId: number }
  >({
    mutationFn: ({ programId, courseId }) => programsApi.removeCourse(programId, courseId),
    onSuccess: (data, variables) => {
      // Invalidate program detail to remove course from list
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to remove course from program');
    },
  });
}

/**
 * Create a class within a program (superuser only)
 */
export function useCreateClass() {
  const queryClient = useQueryClient();

  return useMutation<CreateClassResponse, Error, { programId: number; data: CreateClassData }>({
    mutationFn: ({ programId, data }) => programsApi.createClass(programId, data),
    onSuccess: (data, variables) => {
      // Invalidate program detail to show new class
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create class');
    },
  });
}

// ===========================================================================
// DESCRIPTOR HOOKS
// ===========================================================================

export function useUploadDescriptor() {
  const queryClient = useQueryClient();

  return useMutation<any, Error, { programId: number; file: File }>({
    mutationFn: ({ programId, file }) => programsApi.uploadDescriptor(programId, file),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      toast.success('Descripteur téléchargé avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec du téléchargement du descripteur');
    },
  });
}

export function useExtractDescriptor() {
  const queryClient = useQueryClient();

  return useMutation<ExtractDescriptorResult, Error, number>({
    mutationFn: (programId) => programsApi.extractDescriptor(programId),
    onSuccess: (data, programId) => {
      queryClient.invalidateQueries({ queryKey: programKeys.detail(programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.aaps(programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.competences(programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(programId) });
      toast.success(
        `Extraction réussie : ${data.result.aaps_count} AAP, ${data.result.competences_count} compétences, ${data.result.links_count} liens` +
        (data.result.courses_linked ? `, ${data.result.courses_linked} modules reliés` : '')
      );
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Échec de l'extraction du descripteur");
    },
  });
}

export function useProcessDescriptor() {
  const queryClient = useQueryClient();

  return useMutation<ProcessDescriptorResult, Error, number>({
    mutationFn: (programId) => programsApi.processDescriptor(programId),
    onSuccess: (data, programId) => {
      queryClient.invalidateQueries({ queryKey: programKeys.detail(programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.aaps(programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.competences(programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(programId) });
      const steps = data.steps || [];
      const modulesCount = data.modules_table?.length || 0;
      const teachersCount = data.teachers_created?.length || 0;
      toast.success(
        `Pipeline terminé : ${steps.length} étapes, ${modulesCount} modules, ${teachersCount} enseignants créés`
      );
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Échec du pipeline de traitement");
    },
  });
}

// ===========================================================================
// AAP HOOKS
// ===========================================================================

export function useAAPs(programId: number) {
  return useQuery<ProgramAAP[]>({
    queryKey: programKeys.aaps(programId),
    queryFn: () => programsApi.listAAPs(programId),
    enabled: !!programId,
  });
}

export function useCreateAAP() {
  const queryClient = useQueryClient();

  return useMutation<
    ProgramAAP,
    Error,
    { programId: number; data: { code: string; description: string; order: number } }
  >({
    mutationFn: ({ programId, data }) => programsApi.createAAP(programId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: programKeys.aaps(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(variables.programId) });
      toast.success('AAP créé avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Échec de la création de l'AAP");
    },
  });
}

export function useUpdateAAP() {
  const queryClient = useQueryClient();

  return useMutation<
    ProgramAAP,
    Error,
    {
      programId: number;
      aapId: number;
      data: { code?: string; description?: string; order?: number };
    }
  >({
    mutationFn: ({ programId, aapId, data }) => programsApi.updateAAP(programId, aapId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: programKeys.aaps(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(variables.programId) });
      toast.success('AAP modifié avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Échec de la modification de l'AAP");
    },
  });
}

export function useDeleteAAP() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, { programId: number; aapId: number }>({
    mutationFn: ({ programId, aapId }) => programsApi.deleteAAP(programId, aapId),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: programKeys.aaps(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(variables.programId) });
      toast.success(data.message || 'AAP supprimé avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Échec de la suppression de l'AAP");
    },
  });
}

// ===========================================================================
// COMPETENCE HOOKS
// ===========================================================================

export function useCompetences(programId: number) {
  return useQuery<ProgramCompetence[]>({
    queryKey: programKeys.competences(programId),
    queryFn: () => programsApi.listCompetences(programId),
    enabled: !!programId,
  });
}

export function useCreateCompetence() {
  const queryClient = useQueryClient();

  return useMutation<
    ProgramCompetence,
    Error,
    { programId: number; data: { code: string; description: string } }
  >({
    mutationFn: ({ programId, data }) => programsApi.createCompetence(programId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: programKeys.competences(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(variables.programId) });
      toast.success('Compétence créée avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la création de la compétence');
    },
  });
}

export function useUpdateCompetence() {
  const queryClient = useQueryClient();

  return useMutation<
    ProgramCompetence,
    Error,
    {
      programId: number;
      compId: number;
      data: { code?: string; description?: string };
    }
  >({
    mutationFn: ({ programId, compId, data }) =>
      programsApi.updateCompetence(programId, compId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: programKeys.competences(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(variables.programId) });
      toast.success('Compétence modifiée avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la modification de la compétence');
    },
  });
}

export function useDeleteCompetence() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, { programId: number; compId: number }>({
    mutationFn: ({ programId, compId }) => programsApi.deleteCompetence(programId, compId),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: programKeys.competences(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.detail(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(variables.programId) });
      toast.success(data.message || 'Compétence supprimée avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la suppression de la compétence');
    },
  });
}

// ===========================================================================
// MATRIX HOOKS
// ===========================================================================

export function useMatrix(programId: number) {
  return useQuery<AAPCompetenceMatrix>({
    queryKey: programKeys.matrix(programId),
    queryFn: () => programsApi.getMatrix(programId),
    enabled: !!programId,
  });
}

export function useUpdateMatrix() {
  const queryClient = useQueryClient();

  return useMutation<
    AAPCompetenceMatrix,
    Error,
    { programId: number; links: { competence_id: number; aap_ids: number[] }[] }
  >({
    mutationFn: ({ programId, links }) => programsApi.updateMatrix(programId, links),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: programKeys.matrix(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.aaps(variables.programId) });
      queryClient.invalidateQueries({ queryKey: programKeys.competences(variables.programId) });
      toast.success('Matrice mise à jour avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Échec de la mise à jour de la matrice');
    },
  });
}
