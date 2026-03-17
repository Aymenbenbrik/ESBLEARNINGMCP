import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { classChatApi } from '@/lib/api/class-chat';

export function useMyClasses() {
  return useQuery({
    queryKey: ['class-chat', 'my-classes'],
    queryFn: classChatApi.getMyClasses,
    staleTime: 1000 * 30,
  });
}

export function useClassChatMessages(classId: number, limit: number = 50) {
  return useQuery({
    queryKey: ['class-chat', 'messages', classId, limit],
    queryFn: () => classChatApi.getMessages(classId, limit),
    enabled: !!classId,
    // Poll gently to avoid "re-downloading" UI jitter.
    // We keep previous data while refetching to stabilize rendering.
    refetchInterval: 8000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 5000,
    placeholderData: (prev) => prev,
  });
}

export function useClassChatInfo(classId: number) {
  return useQuery({
    queryKey: ['class-chat', 'info', classId],
    queryFn: () => classChatApi.getInfo(classId),
    enabled: !!classId,
    staleTime: 1000 * 30,
  });
}

export function useSendClassChatMessage(classId: number) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (content: string) => classChatApi.postMessage(classId, content),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ['class-chat', 'messages', classId],
        exact: false,
      });
    },
  });
}
