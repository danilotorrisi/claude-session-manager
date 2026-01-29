import { useEffect, useCallback, useRef } from "react";
import { listAllMyIssues } from "../../lib/linear";
import { loadConfig } from "../../lib/config";
import type { AppAction } from "../types";
import type { LinearIssue } from "../../types";

export interface PaginationState {
  hasNextPage: boolean;
  endCursor: string | null;
}

export function useLinearTasks(dispatch: React.Dispatch<AppAction>) {
  const paginationRef = useRef<PaginationState>({
    hasNextPage: false,
    endCursor: null,
  });
  const allIssuesRef = useRef<LinearIssue[]>([]);

  const fetchPage = useCallback(
    async (cursor?: string) => {
      const config = await loadConfig();
      if (!config.linearApiKey) return;

      const result = await listAllMyIssues(config.linearApiKey, cursor);
      if (cursor) {
        // Appending next page
        allIssuesRef.current = [...allIssuesRef.current, ...result.issues];
      } else {
        // Fresh fetch
        allIssuesRef.current = result.issues;
      }
      paginationRef.current = {
        hasNextPage: result.hasNextPage,
        endCursor: result.endCursor,
      };
      dispatch({ type: "SET_TASKS", tasks: allIssuesRef.current });
    },
    [dispatch]
  );

  const refresh = useCallback(async () => {
    allIssuesRef.current = [];
    paginationRef.current = { hasNextPage: false, endCursor: null };
    await fetchPage();
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (!paginationRef.current.hasNextPage || !paginationRef.current.endCursor)
      return;
    await fetchPage(paginationRef.current.endCursor);
  }, [fetchPage]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { refresh, loadMore, paginationRef };
}
