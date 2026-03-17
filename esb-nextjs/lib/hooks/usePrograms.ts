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
} from '../types/admin';
import { toast } from 'sonner';

// Query keys
export const programKeys = {
  all: ['programs'] as const,
  lists: () => [...programKeys.all, 'list'] as const,
  list: () => [...programKeys.lists()] as const,
  details: () => [...programKeys.all, 'detail'] as const,
  detail: (id: number) => [...programKeys.details(), id] as const,
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
