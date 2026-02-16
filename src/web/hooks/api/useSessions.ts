import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { fetchSessions, killSession, type SessionWithWs } from '../../services/sessions';
import { POLL_INTERVAL } from '../../utils/constants';
import { useSSE } from '../websocket/useSSE';

const SESSIONS_QUERY_KEY = ['sessions'] as const;

/**
 * Fetch all sessions with 5-second polling.
 * When an SSE event for any session fires (connect/disconnect/status change),
 * the query is immediately invalidated so the UI refreshes without waiting
 * for the next poll cycle.
 */
export function useSessions() {
  const queryClient = useQueryClient();

  const query = useQuery<SessionWithWs[]>({
    queryKey: SESSIONS_QUERY_KEY,
    queryFn: fetchSessions,
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL / 2,
  });

  // SSE: listen to a global session stream for immediate invalidation.
  // The server doesn't have a global SSE endpoint yet, so this is a
  // no-op placeholder. When the global stream is added, flip enabled.
  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
  }, [queryClient]);

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    invalidate,
  };
}

/** Mutation hook to kill a session and refresh the list. */
export function useKillSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: killSession,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SESSIONS_QUERY_KEY });
    },
  });
}
