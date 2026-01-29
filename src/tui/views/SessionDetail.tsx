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
import { cleanupStateFile } from "../../lib/claude-state";
import { exitTuiAndAttachAutoReturn, exitTuiAndAttachTerminal } from "../index";
import { colors } from "../theme";

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
    const tmuxSessionName = getSessionName(session.name);
    await exitTuiAndAttachAutoReturn(session.name, tmuxSessionName);
  }, [session]);

  const handleAttachTerminal = useCallback(async () => {
    if (!session) return;
    const tmuxSessionName = getSessionName(session.name);
    await exitTuiAndAttachTerminal(session.name, tmuxSessionName, worktreePath || undefined);
  }, [session, worktreePath]);

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

      // Clean up Claude state file
      cleanupStateFile(session.name);

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
    } else if (input === "t") {
      handleAttachTerminal();
    } else if (input === "k") {
      handleKill();
    }
  });

  if (!session) {
    return (
      <Box paddingX={2}>
        <Text color={colors.danger}>No session selected</Text>
      </Box>
    );
  }

  if (loading) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text color={colors.text}>
            <Spinner type="dots" />
          </Text>
          <Text> Processing...</Text>
        </Box>
      </Box>
    );
  }

  const statusColor = session.attached ? colors.success : colors.warning;
  const statusIcon = session.attached ? "●" : "○";

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Session header */}
      <Box marginBottom={1}>
        <Text backgroundColor={colors.accent} color={colors.textBright} bold>
          {" ◆ "}{session.name}{" "}
        </Text>
      </Box>

      {confirmKill && (
        <Box marginBottom={1} paddingX={1} paddingY={0}>
          <Text backgroundColor={colors.danger} color={colors.textBright} bold>
            {" "}
            Press 'k' again to confirm kill, [Esc] to cancel{" "}
          </Text>
        </Box>
      )}

      {/* Detail card */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.cardBorder}
        paddingX={2}
        paddingY={1}
      >
        {/* Info section */}
        <Box marginBottom={1}>
          <Text bold backgroundColor={colors.primary} color={colors.textBright}>
            {" Info "}
          </Text>
        </Box>

        {session.title && (
          <Box marginBottom={0}>
            <Box width={16}>
              <Text color={colors.muted}>Title:</Text>
            </Box>
            <Text backgroundColor={colors.accent} color={colors.textBright} bold>{` ${session.title} `}</Text>
          </Box>
        )}

        {session.claudeLastMessage && (
          <Box marginBottom={0}>
            <Box width={16}>
              <Text color={colors.muted}>Last Message:</Text>
            </Box>
            <Text color={colors.text}>{session.claudeLastMessage}</Text>
          </Box>
        )}

        <Box marginBottom={0}>
          <Box width={16}>
            <Text color={colors.muted}>Status:</Text>
          </Box>
          <Text color={statusColor}>
            {statusIcon} {session.attached ? "attached" : "detached"}
          </Text>
        </Box>

        <Box marginBottom={0}>
          <Box width={16}>
            <Text color={colors.muted}>Claude State:</Text>
          </Box>
          {session.claudeState === "working" ? (
            <Text color={colors.warning}>{"◎ working"}</Text>
          ) : session.claudeState === "waiting_for_input" ? (
            <Text color={colors.danger} bold>{"◈ waiting for input"}</Text>
          ) : session.claudeState === "idle" ? (
            <Text color={colors.muted} dimColor>{"◇ idle"}</Text>
          ) : (
            <Text color={colors.mutedDark} dimColor>{"-"}</Text>
          )}
        </Box>

        <Box marginBottom={0}>
          <Box width={16}>
            <Text color={colors.muted}>Windows:</Text>
          </Box>
          <Text>{session.windows}</Text>
        </Box>

        <Box marginBottom={0}>
          <Box width={16}>
            <Text color={colors.muted}>Created:</Text>
          </Box>
          <Text>{new Date(session.created).toLocaleString()}</Text>
        </Box>

        {/* Paths section */}
        {(worktreePath || metadata?.repoPath || metadata?.branchName) && (
          <>
            <Box marginTop={1} marginBottom={1}>
              <Text bold backgroundColor={colors.primary} color={colors.textBright}>
                {" Paths "}
              </Text>
            </Box>

            <Box marginBottom={0}>
              <Box width={16}>
                <Text color={colors.muted}>tmux session:</Text>
              </Box>
              <Text color={colors.muted}>{session.fullName}</Text>
            </Box>

            {worktreePath && (
              <Box marginBottom={0}>
                <Box width={16}>
                  <Text color={colors.muted}>Worktree:</Text>
                </Box>
                <Text color={colors.muted}>{worktreePath}</Text>
              </Box>
            )}

            {metadata?.branchName && (
              <Box marginBottom={0}>
                <Box width={16}>
                  <Text color={colors.muted}>Branch:</Text>
                </Box>
                <Text backgroundColor={colors.accent} color={colors.textBright}>{` ${metadata.branchName} `}</Text>
              </Box>
            )}

            {metadata?.repoPath && (
              <Box marginBottom={0}>
                <Box width={16}>
                  <Text color={colors.muted}>Repository:</Text>
                </Box>
                <Text color={colors.muted}>{metadata.repoPath}</Text>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* Actions section */}
      <Box marginTop={1} flexDirection="column">
        <Box marginBottom={1}>
          <Text bold backgroundColor={colors.primary} color={colors.textBright}>
            {" Actions "}
          </Text>
        </Box>
        <Box>
          <Box marginRight={2}>
            <Text color={colors.buttonBg} backgroundColor={colors.success} bold>
              {" "}a Attach{" "}
            </Text>
          </Box>
          <Box marginRight={2}>
            <Text color={colors.buttonBg} backgroundColor={colors.accent} bold>
              {" "}t Terminal{" "}
            </Text>
          </Box>
          <Box>
            <Text color={colors.buttonBg} backgroundColor={colors.danger} bold>
              {" "}k Kill{" "}
            </Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
