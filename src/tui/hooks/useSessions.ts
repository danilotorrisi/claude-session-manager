import { useEffect, useCallback } from "react";
import { listSessions } from "../../lib/tmux";
import type { AppAction } from "../types";

export function useSessions(dispatch: React.Dispatch<AppAction>) {
  const refresh = useCallback(async () => {
    try {
      const sessions = await listSessions();
      dispatch({ type: "SET_SESSIONS", sessions });
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
