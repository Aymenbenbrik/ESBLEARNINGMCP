'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { feedbackApi, type EvaluationFeedback } from '../api/feedback';

export const feedbackKeys = {
  all: ['feedback'] as const,
  session: (examSessionId: number) => [...feedbackKeys.all, examSessionId] as const,
};

/** Fetch existing feedback for an exam session */
export function useFeedback(examSessionId: number) {
  return useQuery<EvaluationFeedback>({
    queryKey: feedbackKeys.session(examSessionId),
    queryFn: () => feedbackApi.get(examSessionId),
    enabled: !!examSessionId,
    retry: false, // 404 is expected when not yet generated
  });
}

/** Generate AI feedback for an exam session */
export function useGenerateFeedback() {
  const qc = useQueryClient();
  return useMutation<EvaluationFeedback, Error, number>({
    mutationFn: (examSessionId: number) => feedbackApi.generate(examSessionId),
    onSuccess: (data) => {
      qc.setQueryData(feedbackKeys.session(data.exam_session_id), data);
    },
  });
}
