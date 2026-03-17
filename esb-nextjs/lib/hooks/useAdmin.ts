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
} from '../types/admin';
import { toast } from 'sonner';

// Query keys
export const adminKeys = {
  all: ['admin'] as const,
  dashboard: () => [...adminKeys.all, 'dashboard'] as const,
  classes: () => [...adminKeys.all, 'class'] as const,
  class: (id: number) => [...adminKeys.classes(), id] as const,
  classStudents: (id: number) => [...adminKeys.classes(), id, 'students'] as const,
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
