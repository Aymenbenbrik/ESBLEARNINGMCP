import apiClient from './client';
import {
  BulkStudentAddResponse,
  TeacherStudentsResponse,
  User
} from '../types/auth';

export const usersApi = {
  bulkAddStudents: async (emails: string[]): Promise<BulkStudentAddResponse> => {
    const response = await apiClient.post<BulkStudentAddResponse>(
      '/api/v1/users/students',
      { emails }
    );
    return response.data;
  },

  getTeacherStudents: async (): Promise<TeacherStudentsResponse> => {
    const response = await apiClient.get<TeacherStudentsResponse>('/api/v1/users/students');
    return response.data;
  },

  updateStudent: async (id: number, data: Partial<User>): Promise<User> => {
    const response = await apiClient.put<User>(`/api/v1/users/students/${id}`, data);
    return response.data;
  },

  removeStudent: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/v1/users/students/${id}`);
  },

  resetStudentPassword: async (id: number): Promise<void> => {
    await apiClient.post(`/api/v1/users/students/${id}/reset-password`);
  },
};
