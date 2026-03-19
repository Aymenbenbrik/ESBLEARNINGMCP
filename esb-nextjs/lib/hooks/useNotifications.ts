'use client';
import { useQuery } from '@tanstack/react-query';
import { notificationsApi, NotificationsResponse } from '@/lib/api/notifications';

export function useMyNotifications() {
  return useQuery<NotificationsResponse>({
    queryKey: ['notifications', 'me'],
    queryFn: () => notificationsApi.getMyNotifications(),
    refetchInterval: 60_000, // poll every 60s
    staleTime: 30_000,
  });
}
