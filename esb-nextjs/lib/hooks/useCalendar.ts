import { useQuery } from '@tanstack/react-query';
import { calendarApi, CalendarActivitiesResponse } from '../api/calendar';

export const calendarKeys = {
  all: ['calendar'] as const,
  activities: () => [...calendarKeys.all, 'activities'] as const,
};

/** Get upcoming activities for the current student */
export function useCalendarActivities() {
  return useQuery<CalendarActivitiesResponse>({
    queryKey: calendarKeys.activities(),
    queryFn: calendarApi.getActivities,
    staleTime: 2 * 60 * 1000,
  });
}
