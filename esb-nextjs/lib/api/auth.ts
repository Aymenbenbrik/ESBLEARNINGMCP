import apiClient from './client';
import {
  LoginCredentials,
  AuthResponse,
  RegisterData,
  ProfileUpdateData,
  ChangePasswordData,
  User
} from '../types/auth';

export const authApi = {
  login: async (credentials: LoginCredentials): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/api/v1/auth/login', credentials);
    return response.data;
  },

  logout: async (): Promise<void> => {
    await apiClient.post('/api/v1/auth/logout');
  },

  refresh: async (): Promise<void> => {
    await apiClient.post('/api/v1/auth/refresh');
  },

  getCurrentUser: async (): Promise<AuthResponse> => {
    const response = await apiClient.get<AuthResponse>('/api/v1/auth/me');
    return response.data;
  },

  register: async (data: RegisterData): Promise<AuthResponse> => {
    const response = await apiClient.post<AuthResponse>('/api/v1/auth/register', data);
    return response.data;
  },

  updateProfile: async (data: ProfileUpdateData): Promise<User> => {
    const response = await apiClient.put<User>('/api/v1/auth/profile', data);
    return response.data;
  },

  changePassword: async (data: ChangePasswordData): Promise<void> => {
    await apiClient.post('/api/v1/auth/change-password', data);
  },
};
