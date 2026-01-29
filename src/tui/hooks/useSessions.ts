import { useEffect, useCallback, useRef } from "react";
import { listSessions } from "../../lib/tmux";
import { getHosts } from "../../lib/config";
import type { AppAction } from "../types";

export function useSessions(dispatch: React.Dispatch<AppAction>) {
  const hostsRef = useRef<Record<string, { host: string }>>({});

  // Load hosts once on mount
  useEffect(() => {
    getHosts().then((hosts) => {
      hostsRef.current = hosts;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      // Fetch local sessions
      const localSessions = await listSessions();

      // Fetch remote sessions from all configured hosts in parallel
      const hostEntries = Object.keys(hostsRef.current);
      const remoteResults = await Promise.allSettled(
        hostEntries.map(async (hostName) => {
          const sessions = await listSessions(hostName);
          return sessions.map((s) => ({ ...s, host: hostName }));
        })
      );

      const remoteSessions = remoteResults.flatMap((r) =>
        r.status === "fulfilled" ? r.value : []
      );

      dispatch({ type: "SET_SESSIONS", sessions: [...localSessions, ...remoteSessions] });
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Failed to load sessions",
      });
    }
  }, [dispatch]);

  useEffect(() => {
    refresh();

    // Auto-refresh every second
    const interval = setInterval(refresh, 1000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { refresh };
}
