import { apiClient } from './client';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GeneratedStudent {
  id: number;
  username: string;
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
  class_id: number | null;
}

export interface GenerateStudentsRequest {
  count: number;
  class_id?: number | null;
  username_prefix?: string;
  email_domain?: string;
  names?: { first_name: string; last_name: string }[];
}

export interface StudentListItem {
  id: number;
  username: string;
  email: string;
  class_id: number | null;
  class_name: string | null;
  is_first_login: boolean;
  created_at: string | null;
  last_login: string | null;
}

export interface ClassOption {
  id: number;
  name: string;
  program_name: string | null;
}

export interface AllStudentsResponse {
  students: StudentListItem[];
  total: number;
  classes: ClassOption[];
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = '/api/v1/users';

export const studentsApi = {
  /** Generate N student accounts with auto credentials */
  generate: async (data: GenerateStudentsRequest) => {
    const r = await apiClient.post<{ students: GeneratedStudent[]; count: number }>(
      `${BASE}/students/generate`,
      data,
    );
    return r.data;
  },

  /** Get all students with class info */
  listAll: async (params?: { class_id?: number; search?: string }): Promise<AllStudentsResponse> => {
    const r = await apiClient.get<AllStudentsResponse>(`${BASE}/students/all`, { params });
    return r.data;
  },

  /** Export students as CSV download */
  exportCsv: (classId?: number) => {
    const url = classId
      ? `${BASE}/students/export?class_id=${classId}`
      : `${BASE}/students/export`;
    return apiClient.get(url, { responseType: 'blob' });
  },

  /** Reset a student's password */
  resetPassword: async (studentId: number) => {
    const r = await apiClient.post<{ message: string; new_password: string }>(
      `${BASE}/students/${studentId}/reset-password`,
    );
    return r.data;
  },
};
