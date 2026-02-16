import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { fetchSession, type SessionWithWs } from '../../services/sessions';
import { POLL_INTERVAL } from '../../utils/constants';
import { useSSE } from '../websocket/useSSE';
import type { WsSessionEvent, WsSessionState } from '../../types';

/**
 * Fetch a single session by name with 5-second polling and SSE live updates.
 *
 * The SSE stream comes from GET /services/sessions/:name/stream and pushes
 * WsSessionEvent objects. On each event the query is invalidated for
 * an immediate re-fetch, and the latest WS state snapshot is tracked
 * locally for consumers that need it between polls.
 */
export function useSessionDetail(sessionName: string | undefined) {
  const queryClient = useQueryClient();

  const queryKey = ['session', sessionName] as const;

  const query = useQuery<SessionWithWs | undefined>({
    queryKey,
    queryFn: () => fetchSession(sessionName!),
    enabled: !!sessionName,
    refetchInterval: POLL_INTERVAL,
    staleTime: POLL_INTERVAL / 2,
  });

  // Invalidate on SSE events from this session's stream
  const handleSSEEvent = useCallback(
    (event: Record<string, unknown>) => {
      // state_snapshot events carry the full WsSessionState
      if (event.type === 'state_snapshot') {
        queryClient.setQueryData<SessionWithWs | undefined>(queryKey, (prev) => {
          if (!prev) return prev;
          const state = event.state as WsSessionState;
          return {
            ...prev,
            wsConnected: true,
            wsStatus: state.status,
            wsModel: state.model,
            wsTurnCount: state.turnCount,
            wsCost: state.totalCostUsd,
            pendingApproval: state.pendingToolApproval ?? null,
          };
        });
        return;
      }

      // For all other live events, just invalidate the query
      queryClient.invalidateQueries({ queryKey });
    },
    [queryClient, queryKey[1]],
  );

  useSSE({
    path: `/api/sessions/${encodeURIComponent(sessionName ?? '')}/stream`,
    onEvent: handleSSEEvent,
    enabled: !!sessionName,
  });

  return {
    session: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
