import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../api/admin';
import {
  AdminDashboardResponse,
  ClassDetails,
  AssignTeachersData,
  AssignTeachersResponse,
  ClassStudentsResponse,
  UpdateClassStudentsData,
  UpdateClassStudentsResponse,
  AdminClassesListResponse,
  AdminCreateClassData,
  AdminUpdateClassData,
  AdminClassMutationResponse,
  AdminDeleteClassResponse,
  TeachersListResponse,
  CreateTeacherData,
  CreateTeacherResponse,
  UpdateTeacherData,
  UpdateTeacherResponse,
  ResetTeacherPasswordResponse,
} from '../types/admin';
import { toast } from 'sonner';

// Query keys
export const adminKeys = {
  all: ['admin'] as const,
  dashboard: () => [...adminKeys.all, 'dashboard'] as const,
  classesList: () => [...adminKeys.all, 'classes-list'] as const,
  classes: () => [...adminKeys.all, 'class'] as const,
  class: (id: number) => [...adminKeys.classes(), id] as const,
  classStudents: (id: number) => [...adminKeys.classes(), id, 'students'] as const,
  teachers: () => [...adminKeys.all, 'teachers'] as const,
};

/**
 * Get admin dashboard statistics (superuser only)
 */
export function useAdminDashboard() {
  return useQuery<AdminDashboardResponse>({
    queryKey: adminKeys.dashboard(),
    queryFn: adminApi.getDashboard,
  });
}

/**
 * Get class details with assignments and teachers (superuser only)
 */
export function useClassDetail(classId: number) {
  return useQuery<ClassDetails>({
    queryKey: adminKeys.class(classId),
    queryFn: () => adminApi.getClassDetail(classId),
    enabled: !!classId,
  });
}

/**
 * Get students enrolled in a class (superuser only)
 */
export function useClassStudents(classId: number) {
  return useQuery<ClassStudentsResponse>({
    queryKey: adminKeys.classStudents(classId),
    queryFn: () => adminApi.getClassStudents(classId),
    enabled: !!classId,
  });
}

/**
 * Bulk assign teachers to courses for a class (superuser only)
 */
export function useAssignTeachers() {
  const queryClient = useQueryClient();

  return useMutation<AssignTeachersResponse, Error, { classId: number; data: AssignTeachersData }>(
    {
      mutationFn: ({ classId, data }) => adminApi.assignTeachers(classId, data),
      onSuccess: (data, variables) => {
        // Invalidate class detail to show updated assignments
        queryClient.invalidateQueries({ queryKey: adminKeys.class(variables.classId) });

        if (data.errors && data.errors.length > 0) {
          toast.warning(`${data.message} (${data.errors.length} errors)`);
        } else {
          toast.success(data.message);
        }
      },
      onError: (error: any) => {
        toast.error(error.response?.data?.error || 'Failed to assign teachers');
      },
    }
  );
}

/**
 * Bulk update students for a class (superuser only)
 */
export function useUpdateClassStudents() {
  const queryClient = useQueryClient();

  return useMutation<
    UpdateClassStudentsResponse,
    Error,
    { classId: number; data: UpdateClassStudentsData }
  >({
    mutationFn: ({ classId, data }) => adminApi.updateClassStudents(classId, data),
    onSuccess: (data, variables) => {
      // Invalidate class students and class detail
      queryClient.invalidateQueries({ queryKey: adminKeys.classStudents(variables.classId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.class(variables.classId) });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update class students');
    },
  });
}

// ============================================================================
// ADMIN CLASS LIST CRUD HOOKS
// ============================================================================

/**
 * List all classes (superuser only)
 */
export function useAdminClasses() {
  return useQuery<AdminClassesListResponse>({
    queryKey: adminKeys.classesList(),
    queryFn: adminApi.listClasses,
  });
}

/**
 * Create a new class (superuser only)
 */
export function useAdminCreateClass() {
  const queryClient = useQueryClient();

  return useMutation<AdminClassMutationResponse, Error, AdminCreateClassData>({
    mutationFn: adminApi.createClass,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.classesList() });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create class');
    },
  });
}

/**
 * Update a class (superuser only)
 */
export function useAdminUpdateClass() {
  const queryClient = useQueryClient();

  return useMutation<AdminClassMutationResponse, Error, { classId: number; data: AdminUpdateClassData }>({
    mutationFn: ({ classId, data }) => adminApi.updateClass(classId, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.classesList() });
      queryClient.invalidateQueries({ queryKey: adminKeys.class(variables.classId) });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update class');
    },
  });
}

/**
 * Delete a class (superuser only)
 */
export function useAdminDeleteClass() {
  const queryClient = useQueryClient();

  return useMutation<AdminDeleteClassResponse, Error, number>({
    mutationFn: adminApi.deleteClass,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.classesList() });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete class');
    },
  });
}

// ============================================================================
// ADMIN TEACHER MANAGEMENT HOOKS
// ============================================================================

/**
 * List all teachers (superuser only)
 */
export function useAdminTeachers() {
  return useQuery<TeachersListResponse>({
    queryKey: adminKeys.teachers(),
    queryFn: adminApi.listTeachers,
  });
}

/**
 * Create a new teacher (superuser only)
 */
export function useAdminCreateTeacher() {
  const queryClient = useQueryClient();

  return useMutation<CreateTeacherResponse, Error, CreateTeacherData>({
    mutationFn: adminApi.createTeacher,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminKeys.teachers() });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
      toast.success('Enseignant créé avec succès');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la création');
    },
  });
}

/**
 * Update a teacher (superuser only)
 */
export function useAdminUpdateTeacher() {
  const queryClient = useQueryClient();

  return useMutation<UpdateTeacherResponse, Error, { teacherId: number; data: UpdateTeacherData }>({
    mutationFn: ({ teacherId, data }) => adminApi.updateTeacher(teacherId, data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.teachers() });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Erreur lors de la mise à jour");
    },
  });
}

/**
 * Delete a teacher (superuser only)
 */
export function useAdminDeleteTeacher() {
  const queryClient = useQueryClient();

  return useMutation<{ message: string }, Error, number>({
    mutationFn: adminApi.deleteTeacher,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: adminKeys.teachers() });
      queryClient.invalidateQueries({ queryKey: adminKeys.dashboard() });
      toast.success(data.message);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || "Erreur lors de la suppression");
    },
  });
}

/**
 * Reset a teacher's password (superuser only)
 */
export function useAdminResetTeacherPassword() {
  return useMutation<ResetTeacherPasswordResponse, Error, { teacherId: number; password?: string }>({
    mutationFn: ({ teacherId, password }) => adminApi.resetTeacherPassword(teacherId, password),
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Erreur lors de la réinitialisation');
    },
  });
}
