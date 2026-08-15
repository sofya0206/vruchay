import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type ReviewStatus = 'pending' | 'published' | 'rejected';

export interface MyReview {
  id: string;
  authorName: string;
  authorRole: string;
  orgName: string;
  text: string;
  rating: number | null;
  status: ReviewStatus;
  /** Что не так с отзывом — заполняется при отклонении. */
  moderatorNote: string | null;
  createdAt: string;
  publishedAt: string | null;
}

export interface ReviewDraft {
  authorName: string;
  authorRole: string;
  orgName: string;
  text: string;
  rating?: number;
}

export function useMyReview() {
  return useQuery<MyReview | null>({
    queryKey: ['review'],
    queryFn: () => api.get<MyReview | null>('/reviews/mine'),
  });
}

export function useReviewMutations() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ['review'] });

  return {
    submit: useMutation({
      mutationFn: (v: ReviewDraft) => api.patch<MyReview>('/reviews/mine', v),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: (id: string) => api.delete<{ ok: true }>(`/reviews/${id}`),
      onSuccess: refresh,
    }),
  };
}
