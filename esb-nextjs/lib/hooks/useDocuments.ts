import { useQuery } from '@tanstack/react-query';
import { documentsApi } from '../api/documents';

export const documentKeys = {
  all: ['documents'] as const,
  details: () => [...documentKeys.all, 'detail'] as const,
  detail: (id: number) => [...documentKeys.details(), id] as const,
};

export function useDocument(documentId: number) {
  return useQuery({
    queryKey: documentKeys.detail(documentId),
    queryFn: () => documentsApi.get(documentId),
    enabled: !!documentId && documentId > 0,
  });
}
