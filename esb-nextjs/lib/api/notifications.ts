import { apiClient } from './client';

export interface AppNotification {
  id: string;
  type: 'quiz_pending' | 'grade_available' | 'grading_needed';
  title: string;
  message: string;
  quiz_id?: number;
  section_id?: number;
  submission_id?: number;
  course_id?: number;
  score?: number;
  max_score?: number;
  created_at: string | null;
  read: boolean;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  count: number;
  unread: number;
}

export const notificationsApi = {
  getMyNotifications: async (): Promise<NotificationsResponse> => {
    const res = await apiClient.get<NotificationsResponse>('/api/v1/notifications/me');
    return res.data;
  },
};
