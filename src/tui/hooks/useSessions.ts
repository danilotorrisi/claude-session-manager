import { useEffect, useCallback, useRef } from "react";
import { listSessions } from "../../lib/tmux";
import { getHosts } from "../../lib/config";
import { wsSessionManager } from "../../lib/ws-session-manager";
import type { WsSessionStatus } from "../../lib/ws-types";
import type { AppAction } from "../types";

function mapWsStatus(wsStatus: WsSessionStatus): "working" | "idle" | "waiting_for_input" {
  if (wsStatus === "working") return "working";
  if (wsStatus === "waiting_for_input") return "waiting_for_input";
  return "idle";
}

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

      const allSessions = [...localSessions, ...remoteSessions];

      // Merge WebSocket state into sessions for real-time status
      for (const session of allSessions) {
        const wsState = wsSessionManager.getSessionState(session.name);
        if (wsState && wsState.status !== "disconnected") {
          session.claudeState = mapWsStatus(wsState.status);
          if (wsState.lastAssistantMessage) {
            session.claudeLastMessage = wsState.lastAssistantMessage;
          }
        }
      }

      dispatch({ type: "SET_SESSIONS", sessions: allSessions });
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Failed to load sessions",
      });
    }
  }, [dispatch]);

  // Poll on interval (reduced from 1s to 5s since WebSocket provides real-time updates)
  useEffect(() => {
    refresh();

    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Subscribe to WebSocket events for immediate refresh on key state changes
  useEffect(() => {
    const unsubscribe = wsSessionManager.on((event) => {
      if (
        event.type === "session_connected" ||
        event.type === "session_disconnected" ||
        event.type === "status_changed"
      ) {
        refresh();
      }
    });

    return unsubscribe;
  }, [refresh]);

  return { refresh };
}
