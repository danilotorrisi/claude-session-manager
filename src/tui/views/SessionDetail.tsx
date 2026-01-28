import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import type { AppState, AppAction } from "../types";
import { killSession, getSessionName } from "../../lib/tmux";
import {
  removeWorktree,
  loadSessionMetadata,
  deleteBranch,
  getWorktreePath,
} from "../../lib/worktree";
import { getDefaultRepo } from "../../lib/config";
import { exitTuiAndAttach } from "../index";

interface SessionDetailProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onRefresh: () => Promise<void>;
}

interface Metadata {
  repoPath: string;
  branchName: string;
  createdAt: string;
}

export function SessionDetail({ state, dispatch, onRefresh }: SessionDetailProps) {
  const { exit } = useApp();
  const session = state.selectedSession;
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [worktreePath, setWorktreePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);

  useEffect(() => {
    if (session) {
      loadSessionMetadata(session.name).then(setMetadata);
      getWorktreePath(session.name).then(setWorktreePath);
    }
  }, [session]);

  const handleAttach = useCallback(async () => {
    if (!session) return;
    const sessionName = getSessionName(session.name);
    await exitTuiAndAttach("tmux", ["attach", "-t", sessionName]);
  }, [session]);

  const handleKill = useCallback(async () => {
    if (!session) return;

    if (!confirmKill) {
      setConfirmKill(true);
      return;
    }

    setLoading(true);

    try {
      const repoPath = metadata?.repoPath || (await getDefaultRepo());

      await killSession(session.name);

      if (repoPath) {
        await removeWorktree(session.name, repoPath);
        if (metadata?.branchName) {
          await deleteBranch(metadata.branchName, repoPath);
        }
      }

      dispatch({ type: "SET_MESSAGE", message: `Session "${session.name}" killed` });
      dispatch({ type: "SELECT_SESSION", session: null });
      dispatch({ type: "SET_VIEW", view: "dashboard" });
      await onRefresh();
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Failed to kill session",
      });
      setLoading(false);
    }
  }, [session, metadata, confirmKill, dispatch, onRefresh]);

  useInput((input, key) => {
    if (key.escape) {
      if (confirmKill) {
        setConfirmKill(false);
      } else {
        dispatch({ type: "SELECT_SESSION", session: null });
        dispatch({ type: "SET_VIEW", view: "dashboard" });
      }
    } else if (input === "q") {
      exit();
    } else if (input === "a") {
      handleAttach();
    } else if (input === "k") {
      handleKill();
    }
  });

  if (!session) {
    return (
      <Box paddingX={2}>
        <Text color="red">No session selected</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text> Processing...</Text>
        </Box>
      </Box>
    );
  }

  const statusColor = session.attached ? "green" : "yellow";
  const statusIcon = session.attached ? "●" : "○";

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Session: {session.name}
        </Text>
      </Box>

      {confirmKill && (
        <Box marginBottom={1} paddingX={1} paddingY={0}>
          <Text backgroundColor="red" color="white" bold>
            {" "}
            Press 'k' again to confirm kill, [Esc] to cancel{" "}
          </Text>
        </Box>
      )}

      <Box flexDirection="column" paddingX={1}>
        {/* Title (Claude Code session title) */}
        {session.title && (
          <Box marginBottom={0}>
            <Box width={16}>
              <Text color="gray">Title:</Text>
            </Box>
            <Text color="magenta" bold>{session.title}</Text>
          </Box>
        )}

        {/* Status */}
        <Box marginBottom={0}>
          <Box width={16}>
            <Text color="gray">Status:</Text>
          </Box>
          <Text color={statusColor}>
            {statusIcon} {session.attached ? "attached" : "detached"}
          </Text>
        </Box>

        {/* Windows */}
        <Box marginBottom={0}>
          <Box width={16}>
            <Text color="gray">Windows:</Text>
          </Box>
          <Text>{session.windows}</Text>
        </Box>

        {/* Created */}
        <Box marginBottom={0}>
          <Box width={16}>
            <Text color="gray">Created:</Text>
          </Box>
          <Text>{new Date(session.created).toLocaleString()}</Text>
        </Box>

        {/* tmux session name */}
        <Box marginBottom={0}>
          <Box width={16}>
            <Text color="gray">tmux session:</Text>
          </Box>
          <Text color="gray">{session.fullName}</Text>
        </Box>

        {/* Worktree path */}
        {worktreePath && (
          <Box marginBottom={0}>
            <Box width={16}>
              <Text color="gray">Worktree:</Text>
            </Box>
            <Text color="gray">{worktreePath}</Text>
          </Box>
        )}

        {/* Branch */}
        {metadata?.branchName && (
          <Box marginBottom={0}>
            <Box width={16}>
              <Text color="gray">Branch:</Text>
            </Box>
            <Text color="magenta">{metadata.branchName}</Text>
          </Box>
        )}

        {/* Repository */}
        {metadata?.repoPath && (
          <Box marginBottom={0}>
            <Box width={16}>
              <Text color="gray">Repository:</Text>
            </Box>
            <Text color="gray">{metadata.repoPath}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={2} flexDirection="column">
        <Text bold>Actions:</Text>
        <Box marginTop={1}>
          <Box marginRight={3}>
            <Text color="green">[a] Attach</Text>
          </Box>
          <Box>
            <Text color="red">[k] Kill</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
