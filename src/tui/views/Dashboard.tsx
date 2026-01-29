import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { SessionList } from "../components/SessionList";
import { StatusBar } from "../components/StatusBar";
import { GitChangesPanel } from "../components/GitChangesPanel";
import type { Session, GitStats } from "../../types";
import type { AppState, AppAction } from "../types";
import { nextTab } from "../types";
import { killSession, getSessionName, sendToSession, getDetailedGitStats, getFileDiff } from "../../lib/tmux";
import { removeWorktree, loadSessionMetadata, deleteBranch, checkWorktreeClean, squashMergeToMain, generateCommitMessage, getWorktreePath } from "../../lib/worktree";
import { exec as cpExec } from "child_process";
import { exec as sshExec } from "../../lib/ssh";
import { getDefaultRepo, saveArchivedSession } from "../../lib/config";
import { cleanupStateFile } from "../../lib/claude-state";
import { exitTuiAndAttachAutoReturn, exitTuiAndAttachTerminal } from "../index";
import { colors } from "../theme";
import { readFileSync, readdirSync, unlinkSync } from "fs";

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

interface FeedbackNotification {
  reportUrl: string;
  sessionName: string;
  timestamp: string;
}

function pollNotifications(): FeedbackNotification[] {
  const dir = "/tmp/csm-notifications";
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const notifications: FeedbackNotification[] = [];
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(`${dir}/${file}`, "utf-8"));
        notifications.push(data);
        unlinkSync(`${dir}/${file}`);
      } catch {
        // skip malformed notifications
      }
    }
    return notifications;
  } catch {
    return [];
  }
}

export function Dashboard({ state, dispatch, onRefresh }: DashboardProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmKill, setConfirmKill] = useState<string | null>(null);
  const [mergeState, setMergeState] = useState<
    | { phase: "idle" }
    | { phase: "confirm"; sessionName: string }
    | { phase: "generating"; sessionName: string }
    | { phase: "editing"; sessionName: string }
    | { phase: "merging"; sessionName: string }
  >({ phase: "idle" });
  const [commitMessage, setCommitMessage] = useState("");
  const [pendingArchive, setPendingArchive] = useState<string | null>(null);
  const [previewSession, setPreviewSession] = useState<Session | null>(null);
  const [replyMode, setReplyMode] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [feedbackNotification, setFeedbackNotification] = useState<FeedbackNotification | null>(null);
  const [detailedGitStats, setDetailedGitStats] = useState<GitStats | null>(null);
  const [loadingGitDetails, setLoadingGitDetails] = useState(false);
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [diffLines, setDiffLines] = useState<string[] | null>(null);
  const [diffScrollOffset, setDiffScrollOffset] = useState(0);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Poll for feedback report notifications
  useEffect(() => {
    const interval = setInterval(() => {
      const notifications = pollNotifications();
      if (notifications.length > 0) {
        // Show the most recent notification
        setFeedbackNotification(notifications[notifications.length - 1]);
        onRefresh();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [onRefresh]);

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

  const handleMerge = useCallback(async (session: Session) => {
    if (session.archived) {
      dispatch({ type: "SET_MESSAGE", message: "Cannot merge an archived session" });
      return;
    }

    if (mergeState.phase === "idle") {
      // First press: check worktree is clean and has commits
      const wtPath = session.worktreePath || await getWorktreePath(session.name);
      const clean = await checkWorktreeClean(wtPath);
      if (!clean) {
        dispatch({ type: "SET_MESSAGE", message: `Session has uncommitted changes — commit first` });
        return;
      }
      setMergeState({ phase: "confirm", sessionName: session.name });
      dispatch({ type: "SET_MESSAGE", message: `Press 'm' again to merge "${session.name}" into main` });
      return;
    }

    if (mergeState.phase === "confirm" && mergeState.sessionName === session.name) {
      // Second press: generate commit message
      setMergeState({ phase: "generating", sessionName: session.name });
      dispatch({ type: "SET_MESSAGE", message: `Generating commit message...` });

      try {
        const wtPath = session.worktreePath || await getWorktreePath(session.name);

        // Fetch first so origin/main is up to date
        await sshExec(`git -C "${wtPath}" fetch origin`);

        const result = await generateCommitMessage(wtPath);
        if (!result.success) {
          dispatch({ type: "SET_MESSAGE", message: result.message });
          setMergeState({ phase: "idle" });
          return;
        }

        setCommitMessage(result.message);
        setMergeState({ phase: "editing", sessionName: session.name });
        dispatch({ type: "SET_MESSAGE", message: `Edit commit message, Enter to merge, Esc to cancel` });
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          error: error instanceof Error ? error.message : "Failed to generate commit message",
        });
        setMergeState({ phase: "idle" });
      }
    }
  }, [mergeState, dispatch]);

  const handleCommitSubmit = useCallback(async (text: string) => {
    if (!text.trim()) {
      dispatch({ type: "SET_MESSAGE", message: "Commit message cannot be empty" });
      return;
    }
    if (mergeState.phase !== "editing") return;

    const sessionName = mergeState.sessionName;
    const session = orderedSessions.find((s) => s.name === sessionName);
    if (!session) return;

    setMergeState({ phase: "merging", sessionName });
    dispatch({ type: "SET_MESSAGE", message: `Merging "${sessionName}" into main...` });

    try {
      const wtPath = session.worktreePath || await getWorktreePath(sessionName);
      const result = await squashMergeToMain(wtPath, text.trim());

      if (!result.success) {
        dispatch({ type: "SET_ERROR", error: `Merge failed: ${result.stderr}` });
        setMergeState({ phase: "idle" });
        return;
      }

      session.mergedAt = new Date().toISOString();
      setMergeState({ phase: "idle" });
      setCommitMessage("");
      setPendingArchive(sessionName);
      dispatch({ type: "SET_MESSAGE", message: `Merged! Archive session? [y/n]` });
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Failed to merge",
      });
      setMergeState({ phase: "idle" });
    }
  }, [mergeState, orderedSessions, dispatch]);

  const handleArchive = useCallback(async (session: Session) => {
    try {
      const metadata = await loadSessionMetadata(session.name);
      const repoPath = metadata?.repoPath || (await getDefaultRepo());

      // Save to archived sessions storage
      await saveArchivedSession({
        name: session.name,
        branchName: metadata?.branchName || "",
        repoPath: repoPath || "",
        projectName: session.projectName,
        linearIssue: session.linearIssue,
        createdAt: session.created,
        mergedAt: session.mergedAt || new Date().toISOString(),
        archivedAt: new Date().toISOString(),
      });

      // Kill tmux session
      await killSession(session.name);

      // Remove worktree and delete branch
      if (repoPath) {
        await removeWorktree(session.name, repoPath);
        if (metadata?.branchName) {
          await deleteBranch(metadata.branchName, repoPath);
        }
      }

      // Clean up Claude state file
      cleanupStateFile(session.name);

      setPendingArchive(null);
      dispatch({ type: "SET_MESSAGE", message: `Session "${session.name}" archived` });
      await onRefresh();
    } catch (error) {
      dispatch({
        type: "SET_ERROR",
        error: error instanceof Error ? error.message : "Failed to archive session",
      });
    }
  }, [dispatch, onRefresh]);

  const handleInfo = useCallback((session: Session) => {
    dispatch({ type: "SELECT_SESSION", session });
    dispatch({ type: "SET_VIEW", view: "detail" });
  }, [dispatch]);

  const handlePreview = useCallback((session: Session) => {
    setPreviewSession((prev) => {
      if (prev?.name === session.name) {
        setReplyMode(false);
        setReplyText("");
        setDetailedGitStats(null);
        setSelectedFileIndex(0);
        setDiffLines(null);
        setDiffScrollOffset(0);
        return null;
      }
      // Lazily fetch detailed git stats when preview opens
      setDetailedGitStats(null);
      setSelectedFileIndex(0);
      setDiffLines(null);
      setDiffScrollOffset(0);
      if (session.worktreePath) {
        setLoadingGitDetails(true);
        getDetailedGitStats(session.worktreePath).then((stats) => {
          setDetailedGitStats(stats ?? null);
          setLoadingGitDetails(false);
        }).catch(() => {
          setLoadingGitDetails(false);
        });
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

  const isEditing = mergeState.phase === "editing";

  const fileChanges = detailedGitStats?.fileChanges;
  const hasFileChanges = previewSession && fileChanges && fileChanges.length > 0;

  const openDiffForFile = useCallback((index: number) => {
    if (!previewSession?.worktreePath || !fileChanges) return;
    const file = fileChanges[index];
    if (!file) return;
    setLoadingDiff(true);
    setDiffLines([]);
    setDiffScrollOffset(0);
    getFileDiff(previewSession.worktreePath, file.file)
      .then((lines) => {
        setDiffLines(lines);
        setLoadingDiff(false);
      })
      .catch(() => {
        setDiffLines([]);
        setLoadingDiff(false);
      });
  }, [previewSession, fileChanges]);

  // Esc handling always active (to exit reply mode or editing mode)
  useInput((_input, key) => {
    if (key.escape) {
      setReplyMode(false);
      setReplyText("");
      setPreviewSession(null);
      setConfirmKill(null);
      setMergeState({ phase: "idle" });
      setCommitMessage("");
      setPendingArchive(null);
      setDetailedGitStats(null);
      setSelectedFileIndex(0);
      setDiffLines(null);
      setDiffScrollOffset(0);
      dispatch({ type: "CLEAR_MESSAGE" });
    }
  }, { isActive: replyMode || isEditing });

  // All other keybindings disabled during reply mode
  useInput((input, _key) => {
    // File list / diff navigation when preview is open with file changes
    if (hasFileChanges && !replyMode) {
      if (diffLines !== null) {
        // Diff view mode: scroll or escape back
        if (_key.upArrow) {
          setDiffScrollOffset((o) => Math.max(0, o - 1));
          return;
        }
        if (_key.downArrow) {
          setDiffScrollOffset((o) => Math.min(diffLines.length - 1, o + 1));
          return;
        }
        if (_key.escape || _key.leftArrow) {
          setDiffLines(null);
          setDiffScrollOffset(0);
          return;
        }
      } else {
        // File list mode: navigate or open diff
        if (_key.upArrow) {
          setSelectedFileIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (_key.downArrow) {
          setSelectedFileIndex((i) => Math.min(fileChanges!.length - 1, i + 1));
          return;
        }
        if (_key.rightArrow || input === "d") {
          openDiffForFile(selectedFileIndex);
          return;
        }
      }
    }

    if (_key.tab && !replyMode) {
      dispatch({ type: "SET_TAB", tab: nextTab(state.activeTab) });
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
    } else if (input === "m" && orderedSessions[selectedIndex]) {
      handleMerge(orderedSessions[selectedIndex]);
    } else if (input === "y" && pendingArchive) {
      const session = orderedSessions.find((s) => s.name === pendingArchive);
      if (session) handleArchive(session);
    } else if (input === "n" && pendingArchive) {
      setPendingArchive(null);
      dispatch({ type: "SET_MESSAGE", message: "Archive skipped — session kept with [merged] tag" });
    } else if (input === "f" && orderedSessions[selectedIndex]) {
      const session = orderedSessions[selectedIndex];
      if (session.worktreePath) {
        cpExec(`open "${session.worktreePath}"`);
      } else {
        dispatch({ type: "SET_MESSAGE", message: `No worktree path for "${session.name}"` });
      }
    } else if (_key.escape) {
      setPreviewSession(null);
      setConfirmKill(null);
      setMergeState({ phase: "idle" });
      setCommitMessage("");
      setPendingArchive(null);
      setDetailedGitStats(null);
      setSelectedFileIndex(0);
      setDiffLines(null);
      setDiffScrollOffset(0);
      dispatch({ type: "CLEAR_MESSAGE" });
    }
  }, { isActive: !replyMode && !isEditing });

  // Reset confirm state when selection changes
  const handleSelect = (index: number) => {
    if (index !== selectedIndex) {
      setConfirmKill(null);
      setMergeState({ phase: "idle" });
      setCommitMessage("");
      setPendingArchive(null);
      setPreviewSession(null);
      setDetailedGitStats(null);
      setSelectedFileIndex(0);
      setDiffLines(null);
      setDiffScrollOffset(0);
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
        inputActive={!replyMode && !isEditing}
        onSelect={handleSelect}
        onActivate={handleAttach}
        onPreview={handlePreview}
        onInfo={handleInfo}
        sessionGroups={sessionGroups}
      />
      {previewSession && (
        <Box
          borderStyle="round"
          borderColor={colors.cardBorder}
          paddingX={2}
          paddingY={0}
          marginX={1}
        >
          {/* Left side: last message */}
          <Box flexDirection="column" width="50%">
            <Box>
              <Text color={colors.muted} bold>{previewSession.name}</Text>
              <Text color={colors.muted}>{" — last message:"}</Text>
            </Box>
            {previewSession.claudeLastMessage ? (
              <Text color={colors.text} wrap="wrap">{previewSession.claudeLastMessage}</Text>
            ) : (
              <Text color={colors.muted} dimColor>No last message available</Text>
            )}
            {!replyMode && (
              <Box marginTop={1}>
                <Text color={colors.muted} dimColor>Press [r] to reply</Text>
              </Box>
            )}
          </Box>

          {/* Vertical separator */}
          <Box flexDirection="column" marginX={1}>
            <Text color={colors.separator}>│</Text>
          </Box>

          {/* Right side: git changes */}
          <Box flexDirection="column" width="50%">
            {loadingGitDetails ? (
              <Text color={colors.muted} dimColor>Loading git changes…</Text>
            ) : detailedGitStats?.fileChanges ? (
              <GitChangesPanel
                changes={detailedGitStats.fileChanges}
                selectedFileIndex={selectedFileIndex}
                diffLines={diffLines}
                diffScrollOffset={diffScrollOffset}
                loadingDiff={loadingDiff}
              />
            ) : (
              <Box flexDirection="column">
                <Text color={colors.muted} bold>Git Changes</Text>
                <Text color={colors.muted} dimColor>No changes</Text>
              </Box>
            )}
          </Box>
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
      {feedbackNotification && (
        <Box
          marginX={1}
          paddingX={2}
          paddingY={0}
          borderStyle="round"
          borderColor={colors.success}
        >
          <Text color={colors.success} bold>{"📋 "}</Text>
          <Text color={colors.text}>
            Feedback report ready for <Text bold>{feedbackNotification.sessionName}</Text>
            {" — "}
            <Text color={colors.accent}>{feedbackNotification.reportUrl}</Text>
          </Text>
        </Box>
      )}
      {mergeState.phase === "generating" && (
        <Box marginX={1} paddingX={2}>
          <Text color={colors.muted}>Generating commit message...</Text>
        </Box>
      )}
      {mergeState.phase === "editing" && (
        <Box marginX={1} paddingX={2} paddingY={0} flexDirection="column">
          <Text color={colors.muted} dimColor>Commit message (Enter to merge, Esc to cancel):</Text>
          <Box>
            <Text color={colors.primary} bold>{"› "}</Text>
            <TextInput
              value={commitMessage}
              onChange={setCommitMessage}
              onSubmit={handleCommitSubmit}
              placeholder="Enter commit message..."
            />
          </Box>
        </Box>
      )}
    </Box>
  );
}
