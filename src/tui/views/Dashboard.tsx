import React, { useState, useCallback } from "react";
import { Box, useInput, useApp } from "ink";
import { SessionList } from "../components/SessionList";
import { StatusBar } from "../components/StatusBar";
import type { Session } from "../../types";
import type { AppState, AppAction } from "../types";
import { killSession, getSessionName } from "../../lib/tmux";
import { removeWorktree, loadSessionMetadata, deleteBranch } from "../../lib/worktree";
import { getDefaultRepo } from "../../lib/config";
import { exitTuiAndRun } from "../index";

interface DashboardProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onRefresh: () => Promise<void>;
}

export function Dashboard({ state, dispatch, onRefresh }: DashboardProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmKill, setConfirmKill] = useState<string | null>(null);

  const handleAttach = useCallback(async (session: Session) => {
    // Exit TUI and attach to tmux session
    const sessionName = getSessionName(session.name);
    await exitTuiAndRun("tmux", ["attach", "-t", sessionName]);
  }, []);

  const handleKill = useCallback(async (session: Session) => {
    if (confirmKill !== session.name) {
      setConfirmKill(session.name);
      dispatch({ type: "SET_MESSAGE", message: `Press 'k' again to confirm kill "${session.name}"` });
      return;
    }

    setConfirmKill(null);
    dispatch({ type: "SET_LOADING", loading: true });

    try {
      // Load metadata for cleanup
      const metadata = await loadSessionMetadata(session.name);
      const repoPath = metadata?.repoPath || (await getDefaultRepo());

      // Kill tmux session
      await killSession(session.name);

      // Remove worktree if we have repo path
      if (repoPath) {
        await removeWorktree(session.name, repoPath);
        if (metadata?.branchName) {
          await deleteBranch(metadata.branchName, repoPath);
        }
      }

      dispatch({ type: "SET_MESSAGE", message: `Session "${session.name}" killed` });
      await onRefresh();
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Failed to kill session",
      });
    }
  }, [confirmKill, dispatch, onRefresh]);

  const handleSelectSession = useCallback((session: Session) => {
    dispatch({ type: "SELECT_SESSION", session });
    dispatch({ type: "SET_VIEW", view: "detail" });
  }, [dispatch]);

  useInput((input, key) => {
    if (input === "q") {
      exit();
    } else if (input === "c") {
      dispatch({ type: "SET_VIEW", view: "create" });
    } else if (input === "r") {
      onRefresh();
    } else if (input === "a" && state.sessions[selectedIndex]) {
      handleAttach(state.sessions[selectedIndex]);
    } else if (input === "k" && state.sessions[selectedIndex]) {
      handleKill(state.sessions[selectedIndex]);
    } else if (key.escape) {
      setConfirmKill(null);
      dispatch({ type: "CLEAR_MESSAGE" });
    }
  });

  // Reset confirm state when selection changes
  const handleSelect = (index: number) => {
    if (index !== selectedIndex) {
      setConfirmKill(null);
    }
    setSelectedIndex(index);
  };

  return (
    <Box flexDirection="column">
      <StatusBar
        loading={state.loading}
        error={state.error}
        message={state.message}
        sessionCount={state.sessions.length}
        onClearMessage={() => {
          dispatch({ type: "CLEAR_MESSAGE" });
          setConfirmKill(null);
        }}
      />
      <SessionList
        sessions={state.sessions}
        selectedIndex={selectedIndex}
        onSelect={handleSelect}
        onActivate={handleSelectSession}
      />
    </Box>
  );
}
