import { apiClient } from './client';
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

const BASE_URL = '/api/v1/admin';

export const adminApi = {
  /**
   * Get admin dashboard statistics (superuser only)
   * Returns counts and recent activity
   */
  getDashboard: async (): Promise<AdminDashboardResponse> => {
    const response = await apiClient.get<AdminDashboardResponse>(`${BASE_URL}/dashboard`);
    return response.data;
  },

  /**
   * List all classes with counts (superuser only)
   */
  listClasses: async (): Promise<AdminClassesListResponse> => {
    const response = await apiClient.get<AdminClassesListResponse>(`${BASE_URL}/classes`);
    return response.data;
  },

  /**
   * Create a new class (superuser only)
   */
  createClass: async (data: AdminCreateClassData): Promise<AdminClassMutationResponse> => {
    const response = await apiClient.post<AdminClassMutationResponse>(`${BASE_URL}/classes`, data);
    return response.data;
  },

  /**
   * Update a class (superuser only)
   */
  updateClass: async (classId: number, data: AdminUpdateClassData): Promise<AdminClassMutationResponse> => {
    const response = await apiClient.put<AdminClassMutationResponse>(`${BASE_URL}/classes/${classId}`, data);
    return response.data;
  },

  /**
   * Delete a class (superuser only)
   */
  deleteClass: async (classId: number): Promise<AdminDeleteClassResponse> => {
    const response = await apiClient.delete<AdminDeleteClassResponse>(`${BASE_URL}/classes/${classId}`);
    return response.data;
  },

  /**
   * Get class details with assignments and available teachers (superuser only)
   */
  getClassDetail: async (classId: number): Promise<ClassDetails> => {
    const response = await apiClient.get<ClassDetails>(`${BASE_URL}/classes/${classId}`);
    return response.data;
  },

  /**
   * Bulk assign teachers to courses for a class (superuser only)
   */
  assignTeachers: async (
    classId: number,
    data: AssignTeachersData
  ): Promise<AssignTeachersResponse> => {
    const response = await apiClient.post<AssignTeachersResponse>(
      `${BASE_URL}/classes/${classId}/assign-teachers`,
      data
    );
    return response.data;
  },

  /**
   * Get students enrolled in a class (superuser only)
   */
  getClassStudents: async (classId: number): Promise<ClassStudentsResponse> => {
    const response = await apiClient.get<ClassStudentsResponse>(
      `${BASE_URL}/classes/${classId}/students`
    );
    return response.data;
  },

  /**
   * Bulk update students for a class (superuser only)
   * Assigns specified students and unassigns others
   */
  updateClassStudents: async (
    classId: number,
    data: UpdateClassStudentsData
  ): Promise<UpdateClassStudentsResponse> => {
    const response = await apiClient.post<UpdateClassStudentsResponse>(
      `${BASE_URL}/classes/${classId}/students`,
      data
    );
    return response.data;
  },

  // ──────────────────────────────────────────────────────────────────────
  // TEACHER MANAGEMENT
  // ──────────────────────────────────────────────────────────────────────

  /**
   * List all teachers (superuser only)
   */
  listTeachers: async (): Promise<TeachersListResponse> => {
    const response = await apiClient.get<TeachersListResponse>('/api/v1/users/teachers');
    return response.data;
  },

  /**
   * Create a new teacher (superuser only)
   */
  createTeacher: async (data: CreateTeacherData): Promise<CreateTeacherResponse> => {
    const response = await apiClient.post<CreateTeacherResponse>('/api/v1/users/teachers', data);
    return response.data;
  },

  /**
   * Update a teacher (superuser only)
   */
  updateTeacher: async (teacherId: number, data: UpdateTeacherData): Promise<UpdateTeacherResponse> => {
    const response = await apiClient.put<UpdateTeacherResponse>(`/api/v1/users/teachers/${teacherId}`, data);
    return response.data;
  },

  /**
   * Delete a teacher (superuser only)
   */
  deleteTeacher: async (teacherId: number): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/api/v1/users/teachers/${teacherId}`);
    return response.data;
  },

  /**
   * Reset a teacher's password (superuser only)
   */
  resetTeacherPassword: async (teacherId: number, password?: string): Promise<ResetTeacherPasswordResponse> => {
    const response = await apiClient.post<ResetTeacherPasswordResponse>(
      `/api/v1/users/teachers/${teacherId}/reset-password`,
      password ? { password } : {}
    );
    return response.data;
  },
};
