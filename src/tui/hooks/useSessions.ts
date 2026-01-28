import { useEffect, useCallback } from "react";
import { listSessions } from "../../lib/tmux";
import type { AppAction } from "../types";

export function useSessions(dispatch: React.Dispatch<AppAction>) {
  const refresh = useCallback(async () => {
    dispatch({ type: "SET_LOADING", loading: true });
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

    // Auto-refresh every 5 seconds
    const interval = setInterval(refresh, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { refresh };
}
