import { apiClient } from './client';
import {
  AdminDashboardResponse,
  ClassDetails,
  AssignTeachersData,
  AssignTeachersResponse,
  ClassStudentsResponse,
  UpdateClassStudentsData,
  UpdateClassStudentsResponse,
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
};
