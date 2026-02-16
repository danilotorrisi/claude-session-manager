import { useEffect, useRef, useCallback } from 'react';
import { API_BASE_URL, AUTH_TOKEN_KEY, SSE_RECONNECT_DELAY } from '../../utils/constants';

export interface UseSSEOptions {
  /** SSE endpoint path (appended to API_BASE_URL). */
  path: string;
  /** Called for each parsed SSE event. */
  onEvent: (event: Record<string, unknown>) => void;
  /** Called on connection errors. */
  onError?: (error: Event) => void;
  /** Whether the connection is enabled. Defaults to true. */
  enabled?: boolean;
}

/**
 * Generic SSE (Server-Sent Events) hook.
 * Connects to the given path, auto-reconnects on failure, and
 * cleans up on unmount or when `enabled` becomes false.
 */
export function useSSE({ path, onEvent, onError, enabled = true }: UseSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Use refs for callbacks to avoid stale closures and reconnect loops
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  onEventRef.current = onEvent;
  onErrorRef.current = onError;

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      cleanup();
      return;
    }

    function connect() {
      cleanup();

      // Build URL with auth token as query param (EventSource doesn't support headers)
      const rawToken = localStorage.getItem(AUTH_TOKEN_KEY);
      let token: string | null = null;
      try {
        if (rawToken) {
          const parsed = JSON.parse(rawToken);
          token = parsed?.state?.token ?? null;
        }
      } catch {
        token = rawToken;
      }

      // When API_BASE_URL is empty (dev proxy mode), use relative path with window.location.origin
      const base = API_BASE_URL || window.location.origin;
      const url = new URL(path, base);
      if (token) {
        url.searchParams.set('token', token);
      }

      const es = new EventSource(url.toString());
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEventRef.current(data);
        } catch {
          // Ignore non-JSON messages
        }
      };

      es.onerror = (err) => {
        onErrorRef.current?.(err);
        // Only reconnect if the connection was actually closed
        if (es.readyState === EventSource.CLOSED) {
          eventSourceRef.current = null;
          reconnectTimerRef.current = setTimeout(connect, SSE_RECONNECT_DELAY);
        }
        // If readyState is CONNECTING, the browser is already reconnecting natively
      };
    }

    connect();

    return cleanup;
  }, [path, enabled, cleanup]);

  return { close: cleanup };
}
