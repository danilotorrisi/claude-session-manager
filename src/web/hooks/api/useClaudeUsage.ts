import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../services/client';

interface UsageTier {
  utilization: number;
  resetsAt: string;
}

interface ClaudeUsageResponse {
  session: UsageTier;
  weekly: UsageTier;
  sonnet: UsageTier;
  plan: string;
}

async function fetchClaudeUsage(): Promise<ClaudeUsageResponse> {
  const response = await apiClient.get<ClaudeUsageResponse>('/api/claude-usage');
  return response.data;
}

export function useClaudeUsage() {
  const query = useQuery<ClaudeUsageResponse>({
    queryKey: ['claude-usage'],
    queryFn: fetchClaudeUsage,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });

  return {
    session: query.data?.session,
    weekly: query.data?.weekly,
    sonnet: query.data?.sonnet,
    plan: query.data?.plan,
    updatedAt: query.dataUpdatedAt,
    isLoading: query.isLoading,
    error: query.error,
  };
}
