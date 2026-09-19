import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export interface DropOffRow {
  flow: string;
  step: string;
  action: string;
  count: number;
}

export function useDropOff(enabled: boolean) {
  return useQuery({
    queryKey: ['onboarding', 'drop-off'],
    queryFn: () => api.get<{ days: number; rows: DropOffRow[] }>('/onboarding/drop-off'),
    enabled,
  });
}
