export interface User {
  id: number;
  username: string;
  email: string;
  is_teacher: boolean;
  is_superuser: boolean;
  google_api_key?: string;
  created_at?: string;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface AuthResponse {
  user: User;
}

export interface RegisterData {
  username: string;
  email: string;
  password: string;
  is_teacher: boolean;
}

export interface ProfileUpdateData {
  username?: string;
  email?: string;
  google_api_key?: string;
}

export interface ChangePasswordData {
  current_password: string;
  new_password: string;
}

export interface BulkStudentAddRequest {
  emails: string[];
}

export interface BulkStudentAddResponse {
  added: User[];
  existing: User[];
  errors: string[];
}

export interface StudentStats {
  total: number;
  active: number;
  pending: number;
}

export interface TeacherStudentsResponse {
  students: User[];
  stats: StudentStats;
}
