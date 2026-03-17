import apiClient from './client';
import {
  ClassDashboardResponse,
  MyDashboardResponse,
  ProgramDashboardResponse,
  StudentDashboardResponseV2,
} from '@/lib/types/dashboards';

export const dashboardsApi = {
  getMyDashboard: async () => {
    const res = await apiClient.get<MyDashboardResponse>('/api/v1/dashboards/me');
    return res.data;
  },

  getProgramDashboard: async (programId: number) => {
    const res = await apiClient.get<ProgramDashboardResponse>(
      `/api/v1/dashboards/program/${programId}`
    );
    return res.data;
  },

  getClassDashboard: async (classId: number) => {
    const res = await apiClient.get<ClassDashboardResponse>(
      `/api/v1/dashboards/class/${classId}`
    );
    return res.data;
  },

  getStudentDashboard: async (studentId: number) => {
    const res = await apiClient.get<StudentDashboardResponseV2>(
      `/api/v1/dashboards/student/${studentId}`
    );
    return res.data;
  },
};
