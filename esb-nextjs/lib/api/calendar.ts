import { apiClient } from './client';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ActivityType = 'quiz' | 'exam' | 'assignment' | 'attendance' | 'revision';

export interface CalendarActivity {
  id: string;
  title: string;
  type: ActivityType;
  date: string; // YYYY-MM-DD
  course_title: string | null;
  description: string | null;
}

export interface CalendarActivitiesResponse {
  activities: CalendarActivity[];
}

// ─── API ─────────────────────────────────────────────────────────────────────

const BASE = '/api/v1/calendar';

export const calendarApi = {
  /** Get upcoming activities for the current student */
  getActivities: async (): Promise<CalendarActivitiesResponse> => {
    const r = await apiClient.get<CalendarActivitiesResponse>(`${BASE}/activities`);
    return r.data;
  },
};
