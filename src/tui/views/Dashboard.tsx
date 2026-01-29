import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { SessionList } from "../components/SessionList";
import { StatusBar } from "../components/StatusBar";
import type { Session } from "../../types";
import type { AppState, AppAction } from "../types";
import { killSession, getSessionName, sendToSession } from "../../lib/tmux";
import { removeWorktree, loadSessionMetadata, deleteBranch } from "../../lib/worktree";
import { exec } from "child_process";
import { getDefaultRepo } from "../../lib/config";
import { cleanupStateFile } from "../../lib/claude-state";
import { exitTuiAndAttachAutoReturn, exitTuiAndAttachTerminal } from "../index";
import { colors } from "../theme";

interface DashboardProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onRefresh: () => Promise<void>;
}

function groupSessionsByProject(sessions: Session[]): Map<string | null, Session[]> {
  const groups = new Map<string | null, Session[]>();
  for (const session of sessions) {
    const key = session.projectName || null;
    const group = groups.get(key) || [];
    group.push(session);
    groups.set(key, group);
  }
  return groups;
}

export function Dashboard({ state, dispatch, onRefresh }: DashboardProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmKill, setConfirmKill] = useState<string | null>(null);
  const [previewSession, setPreviewSession] = useState<Session | null>(null);
  const [replyMode, setReplyMode] = useState(false);
  const [replyText, setReplyText] = useState("");

  // Compute grouped sessions for display
  const sessionGroups = groupSessionsByProject(state.sessions);
  const hasGroups = Array.from(sessionGroups.keys()).some((k) => k !== null);

  // Build flat ordered list matching group order
  const orderedSessions: Session[] = [];
  if (hasGroups) {
    const sortedKeys = Array.from(sessionGroups.keys()).sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    });
    for (const key of sortedKeys) {
      orderedSessions.push(...sessionGroups.get(key)!);
    }
  } else {
    orderedSessions.push(...state.sessions);
  }

  const handleAttach = useCallback(async (session: Session) => {
    // Exit TUI, attach to tmux session with auto-return when Claude starts working
    const tmuxSessionName = getSessionName(session.name);
    await exitTuiAndAttachAutoReturn(session.name, tmuxSessionName);
  }, []);

  const handleAttachTerminal = useCallback(async (session: Session) => {
    const tmuxSessionName = getSessionName(session.name);
    await exitTuiAndAttachTerminal(session.name, tmuxSessionName, session.worktreePath);
  }, []);

  const handleKill = useCallback(async (session: Session) => {
    if (confirmKill !== session.name) {
      setConfirmKill(session.name);
      dispatch({ type: "SET_MESSAGE", message: `Press 'k' again to confirm kill "${session.name}"` });
      return;
    }

    setConfirmKill(null);

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

      // Clean up Claude state file
      cleanupStateFile(session.name);

      dispatch({ type: "SET_MESSAGE", message: `Session "${session.name}" killed` });
      await onRefresh();
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Failed to kill session",
      });
    }
  }, [confirmKill, dispatch, onRefresh]);

  const handleInfo = useCallback((session: Session) => {
    dispatch({ type: "SELECT_SESSION", session });
    dispatch({ type: "SET_VIEW", view: "detail" });
  }, [dispatch]);

  const handlePreview = useCallback((session: Session) => {
    setPreviewSession((prev) => {
      if (prev?.name === session.name) {
        setReplyMode(false);
        setReplyText("");
        return null;
      }
      return session;
    });
  }, []);

  const handleReplySubmit = useCallback(async (text: string) => {
    if (!previewSession || !text.trim()) return;
    try {
      await sendToSession(previewSession.name, text.trim());
      dispatch({ type: "SET_MESSAGE", message: `Sent reply to "${previewSession.name}"` });
    } catch {
      dispatch({ type: "SET_ERROR", error: "Failed to send reply" });
    }
    setReplyText("");
    setPreviewSession(null);
    // Delay re-enabling input so the Enter keystroke doesn't propagate
    // to SessionList's onActivate
    setTimeout(() => setReplyMode(false), 50);
  }, [previewSession, dispatch]);

  // Esc handling always active (to exit reply mode)
  useInput((_input, key) => {
    if (key.escape) {
      setReplyMode(false);
      setReplyText("");
      setPreviewSession(null);
      setConfirmKill(null);
      dispatch({ type: "CLEAR_MESSAGE" });
    }
  }, { isActive: replyMode });

  // All other keybindings disabled during reply mode
  useInput((input, _key) => {
    if (_key.tab && !replyMode) {
      dispatch({ type: "SET_TAB", tab: "projects" });
      return;
    }
    if (input === "q") {
      exit();
    } else if (input === "c") {
      dispatch({ type: "SET_VIEW", view: "create" });
    } else if (input === "r" && previewSession) {
      setReplyMode(true);
      setReplyText("");
    } else if (input === "r") {
      onRefresh();
    } else if (input === "a" && orderedSessions[selectedIndex]) {
      handleAttach(orderedSessions[selectedIndex]);
    } else if (input === "k" && orderedSessions[selectedIndex]) {
      handleKill(orderedSessions[selectedIndex]);
    } else if (input === "t" && orderedSessions[selectedIndex]) {
      handleAttachTerminal(orderedSessions[selectedIndex]);
    } else if (input === "f" && orderedSessions[selectedIndex]) {
      const session = orderedSessions[selectedIndex];
      if (session.worktreePath) {
        exec(`open "${session.worktreePath}"`);
      } else {
        dispatch({ type: "SET_MESSAGE", message: `No worktree path for "${session.name}"` });
      }
    } else if (_key.escape) {
      setPreviewSession(null);
      setConfirmKill(null);
      dispatch({ type: "CLEAR_MESSAGE" });
    }
  }, { isActive: !replyMode });

  // Reset confirm state when selection changes
  const handleSelect = (index: number) => {
    if (index !== selectedIndex) {
      setConfirmKill(null);
      setPreviewSession(null);
      setReplyMode(false);
      setReplyText("");
    }
    setSelectedIndex(index);
  };

  return (
    <Box flexDirection="column">
      <StatusBar
        error={state.error}
        message={state.message}
        sessionCount={state.sessions.length}
        onClearMessage={() => {
          dispatch({ type: "CLEAR_MESSAGE" });
          setConfirmKill(null);
        }}
      />
      <SessionList
        sessions={orderedSessions}
        selectedIndex={selectedIndex}
        inputActive={!replyMode}
        onSelect={handleSelect}
        onActivate={handleAttach}
        onPreview={handlePreview}
        onInfo={handleInfo}
        sessionGroups={sessionGroups}
      />
      {previewSession?.claudeLastMessage && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.cardBorder}
          paddingX={2}
          paddingY={0}
          marginX={1}
        >
          <Box>
            <Text color={colors.muted} bold>{previewSession.name}</Text>
            <Text color={colors.muted}>{" — last message:"}</Text>
          </Box>
          <Text color={colors.text} wrap="wrap">{previewSession.claudeLastMessage}</Text>
          {!replyMode && (
            <Box marginTop={1}>
              <Text color={colors.muted} dimColor>Press [r] to reply</Text>
            </Box>
          )}
        </Box>
      )}
      {previewSession && !previewSession.claudeLastMessage && (
        <Box paddingX={2}>
          <Text color={colors.muted} dimColor>No last message available for {previewSession.name}</Text>
        </Box>
      )}
      {replyMode && previewSession && (
        <Box marginX={1} paddingX={2} paddingY={0}>
          <Text color={colors.primary} bold>{"› "}</Text>
          <TextInput
            value={replyText}
            onChange={setReplyText}
            onSubmit={handleReplySubmit}
            placeholder="Type a reply and press Enter..."
          />
        </Box>
      )}
    </Box>
  );
}
