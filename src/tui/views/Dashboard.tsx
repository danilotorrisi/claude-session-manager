import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "../components/TextInput";
import Spinner from "ink-spinner";
import { SessionList } from "../components/SessionList";
import { StatusBar } from "../components/StatusBar";
import { GitChangesPanel } from "../components/GitChangesPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useWsSessions } from "../hooks/useWsSessions";
import type { Session, GitStats, LinearIssue, Project } from "../../types";
import type { AppState, AppAction } from "../types";
import { nextTab } from "../types";
import { killSession, getSessionName, sendToSession, getDetailedGitStats, getFileDiff, getCommittedFileDiff, renameSession, writeClaudeContext } from "../../lib/tmux";
import { removeWorktree, loadSessionMetadata, deleteBranch, checkWorktreeClean, squashMergeToMain, generateCommitMessage, getWorktreePath, updateSessionProject, updateSessionTask } from "../../lib/worktree";
import { exec as cpExec } from "child_process";
import { exec as sshExec } from "../../lib/ssh";
import { getDefaultRepo, saveArchivedSession, getLinearApiKey, getProjects } from "../../lib/config";
import { searchIssues } from "../../lib/linear";
import { cleanupStateFile } from "../../lib/claude-state";
import { exitTuiAndAttachAutoReturn, exitTuiAndAttachTerminal, exitTuiAndAttachRemote, exitTuiAndAttachRemoteTerminal } from "../index";
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

function parseNotification(data: Record<string, unknown>): FeedbackNotification {
  return {
    reportUrl: (data.reportUrl || data.url || "") as string,
    sessionName: (data.sessionName || "") as string,
    timestamp: (data.timestamp || "") as string,
  };
}

function pollNotifications(): FeedbackNotification[] {
  const dir = "/tmp/csm-notifications";
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const notifications: FeedbackNotification[] = [];
    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(`${dir}/${file}`, "utf-8"));
        notifications.push(parseNotification(data));
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
  const selectedIndex = state.selectedSessionIndex;
  const [confirmKill, setConfirmKill] = useState<string | null>(null);
  const [showKillDialog, setShowKillDialog] = useState(false);
  const [sessionToKill, setSessionToKill] = useState<Session | null>(null);
  const [mergeState, setMergeState] = useState<
    | { phase: "idle" }
    | { phase: "confirm"; sessionName: string; hostName?: string }
    | { phase: "generating"; sessionName: string; hostName?: string }
    | { phase: "editing"; sessionName: string; hostName?: string }
    | { phase: "merging"; sessionName: string; hostName?: string }
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
  // Edit modal state
  type EditField = "name" | "project" | "task";
  const [editMode, setEditMode] = useState(false);
  const [editField, setEditField] = useState<EditField>("name");
  const [editName, setEditName] = useState("");
  const [editProjectIndex, setEditProjectIndex] = useState(0);
  const [editTaskQuery, setEditTaskQuery] = useState("");
  const [editTaskResults, setEditTaskResults] = useState<LinearIssue[]>([]);
  const [editTaskSelectedIdx, setEditTaskSelectedIdx] = useState(0);
  const [editTaskSearching, setEditTaskSearching] = useState(false);
  const [editSelectedTask, setEditSelectedTask] = useState<LinearIssue | null>(null);
  const [editLinearApiKey, setEditLinearApiKey] = useState<string | null>(null);
  const [editOriginalSession, setEditOriginalSession] = useState<Session | null>(null);
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // WebSocket pending approvals
  const { pendingApprovals } = useWsSessions();

  // Run script picker state
  const [runScriptMode, setRunScriptMode] = useState(false);
  const [runScriptEntries, setRunScriptEntries] = useState<[string, string][]>([]);
  const [runScriptSelectedIdx, setRunScriptSelectedIdx] = useState(0);
  const [runScriptSession, setRunScriptSession] = useState<Session | null>(null);

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

  // Debounced Linear search for edit modal
  useEffect(() => {
    if (!editMode || editField !== "task" || !editLinearApiKey || !editTaskQuery.trim()) {
      setEditTaskResults([]);
      return;
    }

    if (editDebounceRef.current) clearTimeout(editDebounceRef.current);

    editDebounceRef.current = setTimeout(async () => {
      setEditTaskSearching(true);
      try {
        const results = await searchIssues(editTaskQuery, editLinearApiKey);
        setEditTaskResults(results);
        setEditTaskSelectedIdx(0);
      } catch {
        setEditTaskResults([]);
      } finally {
        setEditTaskSearching(false);
      }
    }, 300);

    return () => {
      if (editDebounceRef.current) clearTimeout(editDebounceRef.current);
    };
  }, [editTaskQuery, editLinearApiKey, editField, editMode]);

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
    const tmuxSessionName = getSessionName(session.name);
    if (session.host) {
      await exitTuiAndAttachRemote(tmuxSessionName, session.host, session.worktreePath);
    } else {
      // Exit TUI, attach to tmux session with auto-return when Claude starts working
      await exitTuiAndAttachAutoReturn(session.name, tmuxSessionName);
    }
  }, []);

  const handleAttachTerminal = useCallback(async (session: Session) => {
    const tmuxSessionName = getSessionName(session.name);
    if (session.host) {
      await exitTuiAndAttachRemoteTerminal(tmuxSessionName, session.host, session.worktreePath);
    } else {
      await exitTuiAndAttachTerminal(session.name, tmuxSessionName, session.worktreePath);
    }
  }, []);

  const handleKill = useCallback(async (session: Session) => {
    // Show confirmation dialog
    setSessionToKill(session);
    setShowKillDialog(true);
  }, []);

  const executeKill = useCallback(async () => {
    if (!sessionToKill) return;

    setShowKillDialog(false);
    const session = sessionToKill;
    setSessionToKill(null);

    try {
      // Load metadata for cleanup
      const metadata = await loadSessionMetadata(session.name, session.host);
      const repoPath = metadata?.repoPath || (await getDefaultRepo(session.host));

      // Kill tmux session
      await killSession(session.name, session.host);

      // Remove worktree if we have repo path
      if (repoPath) {
        await removeWorktree(session.name, repoPath, session.host);
        if (metadata?.branchName) {
          await deleteBranch(metadata.branchName, repoPath, session.host);
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
  }, [sessionToKill, dispatch, onRefresh]);

  const handleMerge = useCallback(async (session: Session) => {
    if (session.archived) {
      dispatch({ type: "SET_MESSAGE", message: "Cannot merge an archived session" });
      return;
    }

    if (mergeState.phase === "idle") {
      // First press: check worktree is clean and has commits
      const wtPath = session.worktreePath || await getWorktreePath(session.name);
      const clean = await checkWorktreeClean(wtPath, session.host);
      if (!clean) {
        dispatch({ type: "SET_MESSAGE", message: `Session has uncommitted changes — commit first` });
        return;
      }
      setMergeState({ phase: "confirm", sessionName: session.name, hostName: session.host });
      dispatch({ type: "SET_MESSAGE", message: `Press 'm' again to merge "${session.name}" into main` });
      return;
    }

    if (mergeState.phase === "confirm" && mergeState.sessionName === session.name) {
      // Second press: generate commit message
      setMergeState({ phase: "generating", sessionName: session.name, hostName: session.host });
      dispatch({ type: "SET_MESSAGE", message: `Generating commit message...` });

      try {
        const wtPath = session.worktreePath || await getWorktreePath(session.name);

        // Fetch first so origin/main is up to date
        await sshExec(`git -C "${wtPath}" fetch origin`, session.host);

        const result = await generateCommitMessage(wtPath, session.host);
        if (!result.success) {
          dispatch({ type: "SET_MESSAGE", message: result.message });
          setMergeState({ phase: "idle" });
          return;
        }

        setCommitMessage(result.message);
        setMergeState({ phase: "editing", sessionName: session.name, hostName: session.host });
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

    const hostName = mergeState.hostName;
    setMergeState({ phase: "merging", sessionName, hostName });
    dispatch({ type: "SET_MESSAGE", message: `Merging "${sessionName}" into main...` });

    try {
      const wtPath = session.worktreePath || await getWorktreePath(sessionName);
      const result = await squashMergeToMain(wtPath, text.trim(), hostName);

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
      const metadata = await loadSessionMetadata(session.name, session.host);
      const repoPath = metadata?.repoPath || (await getDefaultRepo(session.host));

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
      await killSession(session.name, session.host);

      // Remove worktree and delete branch
      if (repoPath) {
        await removeWorktree(session.name, repoPath, session.host);
        if (metadata?.branchName) {
          await deleteBranch(metadata.branchName, repoPath, session.host);
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
        getDetailedGitStats(session.worktreePath, session.host).then((stats) => {
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
      await sendToSession(previewSession.name, text.trim(), previewSession.host);
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

  const editProjectOptions: (string | null)[] = [...state.projects.map((p) => p.name), null];

  const openEditModal = useCallback(async (session: Session) => {
    setEditOriginalSession(session);
    setEditName(session.name);
    const currentProject = session.projectName || null;
    const currentIdx = editProjectOptions.findIndex((p) => p === currentProject);
    setEditProjectIndex(currentIdx >= 0 ? currentIdx : editProjectOptions.length - 1);
    setEditSelectedTask(session.linearIssue || null);
    setEditTaskQuery(session.linearIssue?.identifier || "");
    setEditTaskResults([]);
    setEditTaskSelectedIdx(0);
    setEditTaskSearching(false);
    setEditField("name");
    setEditMode(true);
    // Load linear API key
    const key = await getLinearApiKey();
    setEditLinearApiKey(key || null);
  }, [editProjectOptions]);

  const closeEditModal = useCallback(() => {
    setEditMode(false);
    setEditField("name");
    setEditName("");
    setEditProjectIndex(0);
    setEditTaskQuery("");
    setEditTaskResults([]);
    setEditTaskSelectedIdx(0);
    setEditTaskSearching(false);
    setEditSelectedTask(null);
    setEditLinearApiKey(null);
    setEditOriginalSession(null);
  }, []);

  const handleEditSubmit = useCallback(async () => {
    if (!editOriginalSession) return;
    const original = editOriginalSession;
    const newName = editName.trim();

    if (!newName) {
      dispatch({ type: "SET_ERROR", error: "Name cannot be empty" });
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
      dispatch({ type: "SET_ERROR", error: "Name must only contain alphanumeric, hyphens, and underscores" });
      return;
    }

    const nameChanged = newName !== original.name;
    const newProject = editProjectOptions[editProjectIndex] ?? null;
    const projectChanged = newProject !== (original.projectName || null);
    const newTask = editSelectedTask;
    const taskChanged = (newTask?.id || null) !== (original.linearIssue?.id || null);

    if (!nameChanged && !projectChanged && !taskChanged) {
      closeEditModal();
      dispatch({ type: "SET_MESSAGE", message: "No changes" });
      return;
    }

    try {
      let currentName = original.name;

      // 1. Rename if changed
      if (nameChanged) {
        const result = await renameSession(original.name, newName, original.host);
        if (!result.success) {
          dispatch({ type: "SET_ERROR", error: result.stderr });
          closeEditModal();
          return;
        }
        currentName = newName;
      }

      // 2. Update project if changed
      if (projectChanged) {
        await updateSessionProject(currentName, newProject, original.host);
      }

      // 3. Update task if changed
      if (taskChanged) {
        await updateSessionTask(currentName, newTask, original.host);
        // Rewrite CLAUDE.md with new issue context
        const wtPath = original.worktreePath || await getWorktreePath(currentName);
        await writeClaudeContext(wtPath, newTask || undefined, original.host);
      }

      const messages: string[] = [];
      if (nameChanged) messages.push(`renamed → "${currentName}"`);
      if (projectChanged) messages.push(newProject ? `project → "${newProject}"` : "project removed");
      if (taskChanged) messages.push(newTask ? `task → ${newTask.identifier}` : "task removed");

      closeEditModal();
      dispatch({ type: "SET_MESSAGE", message: messages.join(", ") });
      await onRefresh();
    } catch (error) {
      dispatch({ type: "SET_ERROR", error: error instanceof Error ? error.message : "Failed to update session" });
      closeEditModal();
    }
  }, [editOriginalSession, editName, editProjectIndex, editProjectOptions, editSelectedTask, closeEditModal, dispatch, onRefresh]);

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
    const diffFn = file.source === "committed" ? getCommittedFileDiff : getFileDiff;
    diffFn(previewSession.worktreePath, file.file, previewSession.host)
      .then((lines) => {
        setDiffLines(lines);
        setLoadingDiff(false);
      })
      .catch(() => {
        setDiffLines([]);
        setLoadingDiff(false);
      });
  }, [previewSession, fileChanges]);

  // Run script picker input
  useInput((input, key) => {
    if (key.escape) {
      setRunScriptMode(false);
      setRunScriptEntries([]);
      setRunScriptSession(null);
      dispatch({ type: "CLEAR_MESSAGE" });
      return;
    }
    if (key.upArrow) {
      setRunScriptSelectedIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow) {
      setRunScriptSelectedIdx((i) => Math.min(runScriptEntries.length - 1, i + 1));
      return;
    }
    if (key.return && runScriptSession && runScriptEntries.length > 0) {
      const [scriptName, command] = runScriptEntries[runScriptSelectedIdx];
      const sessionName = getSessionName(runScriptSession.name);
      const escaped = command.replace(/'/g, "'\\''");
      sshExec(`tmux send-keys -t ${sessionName}:terminal '${escaped}' Enter`, runScriptSession.host).then(() => {
        dispatch({ type: "SET_MESSAGE", message: `Running "${scriptName}" in ${runScriptSession.name}` });
      }).catch(() => {
        dispatch({ type: "SET_ERROR", error: `Failed to run "${scriptName}"` });
      });
      setRunScriptMode(false);
      setRunScriptEntries([]);
      setRunScriptSession(null);
      return;
    }
  }, { isActive: runScriptMode });

  // Esc handling always active (to exit reply mode, editing mode, or edit modal)
  useInput((_input, key) => {
    if (key.escape) {
      setReplyMode(false);
      setReplyText("");
      closeEditModal();
      setRunScriptMode(false);
      setRunScriptEntries([]);
      setRunScriptSession(null);
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
  }, { isActive: replyMode || isEditing || editMode });

  // Edit modal input handling
  useInput((input, key) => {
    if (key.escape) {
      closeEditModal();
      dispatch({ type: "CLEAR_MESSAGE" });
      return;
    }

    // Ctrl+S to save
    if (input === "s" && key.ctrl) {
      handleEditSubmit();
      return;
    }

    // Tab / Shift+Tab to cycle fields
    if (key.tab) {
      if (key.shift) {
        setEditField((f) => f === "task" ? "project" : f === "project" ? "name" : "task");
      } else {
        setEditField((f) => f === "name" ? "project" : f === "project" ? "task" : "name");
      }
      return;
    }

    // Field-specific handling
    if (editField === "project") {
      if (key.upArrow) {
        setEditProjectIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow) {
        setEditProjectIndex((i) => Math.min(editProjectOptions.length - 1, i + 1));
        return;
      }
    }

    if (editField === "task") {
      if (editTaskResults.length > 0) {
        if (key.upArrow) {
          setEditTaskSelectedIdx((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setEditTaskSelectedIdx((i) => Math.min(editTaskResults.length - 1, i + 1));
          return;
        }
        if (key.return) {
          const issue = editTaskResults[editTaskSelectedIdx];
          setEditSelectedTask(issue);
          setEditTaskResults([]);
          setEditTaskQuery(issue.identifier);
          return;
        }
      }
      // Backspace clears selected task when query is empty
      if (key.backspace && !editTaskQuery && editSelectedTask) {
        setEditSelectedTask(null);
        return;
      }
    }

    // Enter on last field (task) submits if no results shown
    if (key.return && editField === "task" && editTaskResults.length === 0) {
      handleEditSubmit();
      return;
    }
  }, { isActive: editMode });

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
    }
    
    // Handle kill confirmation dialog
    if (showKillDialog) {
      if (input === "y" || input === "Y") {
        executeKill();
      } else if (input === "n" || input === "N" || _key.escape) {
        setShowKillDialog(false);
        setSessionToKill(null);
      }
      return;
    }

    if (input === "r" && previewSession) {
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
    } else if (input === "e" && orderedSessions[selectedIndex]) {
      openEditModal(orderedSessions[selectedIndex]);
    } else if (input === "x" && orderedSessions[selectedIndex]) {
      const session = orderedSessions[selectedIndex];
      if (!session.projectName) {
        dispatch({ type: "SET_MESSAGE", message: "No project assigned to this session" });
      } else {
        getProjects().then((projects) => {
          const project = projects.find((p) => p.name === session.projectName);
          if (!project?.runScripts || Object.keys(project.runScripts).length === 0) {
            dispatch({ type: "SET_MESSAGE", message: `No run scripts configured for project "${session.projectName}"` });
          } else {
            setRunScriptEntries(Object.entries(project.runScripts));
            setRunScriptSelectedIdx(0);
            setRunScriptSession(session);
            setRunScriptMode(true);
          }
        });
      }
    } else if (input === "f" && orderedSessions[selectedIndex]) {
      const session = orderedSessions[selectedIndex];
      if (session.worktreePath) {
        cpExec(`open "${session.worktreePath}"`);
      } else {
        dispatch({ type: "SET_MESSAGE", message: `No worktree path for "${session.name}"` });
      }
    } else if (input === "p" && feedbackNotification?.reportUrl) {
      const url = feedbackNotification.reportUrl;
      cpExec(`open "${url}"`, (err) => {
        if (err) dispatch({ type: "SET_ERROR", error: `Failed to open report: ${url}` });
      });
      setFeedbackNotification(null);
    } else if (input === "p" && previewSession?.feedbackReports?.length) {
      const latest = previewSession.feedbackReports[previewSession.feedbackReports.length - 1];
      const url = latest.url;
      if (!url || (!url.startsWith("http") && !url.startsWith("/"))) {
        dispatch({ type: "SET_ERROR", error: `Invalid report URL: ${url}` });
      } else {
        cpExec(`open "${url}"`, (err) => {
          if (err) dispatch({ type: "SET_ERROR", error: `Failed to open report: ${url}` });
        });
        dispatch({ type: "SET_MESSAGE", message: "Opening feedback report…" });
      }
    } else if (input === " " && pendingApprovals.length > 0) {
      // Space navigates to the first session with a pending tool approval
      const firstApproval = pendingApprovals[0];
      const targetSession = orderedSessions.find((s) => s.name === firstApproval.sessionName);
      if (targetSession) {
        dispatch({ type: "SELECT_SESSION", session: targetSession });
        dispatch({ type: "SET_VIEW", view: "detail" });
      }
    } else if (_key.escape) {
      setFeedbackNotification(null);
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
  }, { isActive: !replyMode && !isEditing && !editMode && !runScriptMode });

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
      closeEditModal();
    }
    dispatch({ type: "SET_SELECTED_SESSION_INDEX", index });
  };

  // Show kill confirmation dialog as fullscreen overlay
  if (showKillDialog && sessionToKill) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <ConfirmDialog
          title="Confirm Kill Session"
          message={`You are about to kill session "${sessionToKill.name}"`}
          details={[
            "Stop tmux session",
            "Remove git worktree",
            "Delete local branch",
          ]}
          warning="This action cannot be undone."
          confirmLabel="Yes"
          cancelLabel="No"
        />
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {pendingApprovals.length > 0 && (
        <Box marginX={1} paddingX={2} paddingY={0}>
          <Text backgroundColor={colors.warning} color="#000000" bold>
            {" ! "}
          </Text>
          <Text color={colors.warning} bold>
            {" "}{pendingApprovals.length} tool approval{pendingApprovals.length !== 1 ? "s" : ""} pending
          </Text>
          <Text color={colors.text}>
            {" — "}
            {pendingApprovals.slice(0, 2).map((a) => `${a.sessionName}: ${a.toolName}`).join(", ")}
            {pendingApprovals.length > 2 ? `, +${pendingApprovals.length - 2} more` : ""}
          </Text>
          <Text color={colors.muted}> [Space to view]</Text>
        </Box>
      )}
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
        inputActive={!replyMode && !isEditing && !editMode && !runScriptMode}
        loading={state.loading}
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

          {/* Right side: git changes + feedback reports */}
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
            {previewSession.feedbackReports && previewSession.feedbackReports.length > 0 && (
              <Box flexDirection="column" marginTop={1}>
                <Box gap={1}>
                  <Text color={colors.success} bold>
                    Feedback Reports ({previewSession.feedbackReports.length})
                  </Text>
                  <Text color={colors.muted} dimColor>[p] open latest</Text>
                </Box>
                {previewSession.feedbackReports.slice(-3).reverse().map((report, i) => {
                  const date = new Date(report.timestamp.replace(/-/g, (m, offset) => offset <= 9 ? m : offset <= 12 ? ":" : "."));
                  const timeStr = isNaN(date.getTime())
                    ? report.timestamp.slice(0, 19)
                    : date.toLocaleString();
                  return (
                    <Box key={i} gap={1}>
                      <Text color={i === 0 ? colors.success : colors.muted}>
                        {i === 0 ? "▸" : " "}
                      </Text>
                      <Text color={colors.text}>📋 {timeStr}</Text>
                    </Box>
                  );
                })}
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
      {editMode && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.accent}
          marginX={1}
          paddingX={2}
          paddingY={0}
        >
          <Box marginBottom={0}>
            <Text backgroundColor={colors.accent} color={colors.textBright} bold>{" ◆ Edit Session "}</Text>
          </Box>

          {/* Name field */}
          <Box>
            <Box width={12}>
              <Text
                color={editField === "name" ? colors.textBright : colors.muted}
                backgroundColor={editField === "name" ? colors.primary : undefined}
                bold={editField === "name"}
              >
                Name:
              </Text>
            </Box>
            <Box>
              {editField === "name" ? (
                <TextInput
                  value={editName}
                  onChange={setEditName}
                  placeholder="session-name"
                />
              ) : (
                <Text>{editName}</Text>
              )}
            </Box>
          </Box>

          {/* Project field */}
          <Box flexDirection="column">
            <Box>
              <Box width={12}>
                <Text
                  color={editField === "project" ? colors.textBright : colors.muted}
                  backgroundColor={editField === "project" ? colors.primary : undefined}
                  bold={editField === "project"}
                >
                  Project:
                </Text>
              </Box>
              <Box>
                <Text color={editProjectOptions[editProjectIndex] ? colors.success : colors.muted}>
                  {editProjectOptions[editProjectIndex] || "None"}
                </Text>
              </Box>
            </Box>
            {editField === "project" && (
              <Box flexDirection="column" marginLeft={2}>
                {state.projects.map((project, i) => (
                  <Box key={project.name}>
                    <Text
                      color={i === editProjectIndex ? colors.textBright : colors.muted}
                      backgroundColor={i === editProjectIndex ? colors.primary : undefined}
                      bold={i === editProjectIndex}
                    >
                      {i === editProjectIndex ? "▸ " : "  "}{project.name}
                    </Text>
                  </Box>
                ))}
                <Box>
                  <Text
                    color={editProjectIndex === state.projects.length ? colors.textBright : colors.muted}
                    backgroundColor={editProjectIndex === state.projects.length ? colors.primary : undefined}
                    bold={editProjectIndex === state.projects.length}
                  >
                    {editProjectIndex === state.projects.length ? "▸ " : "  "}None
                  </Text>
                </Box>
              </Box>
            )}
          </Box>

          {/* Task field */}
          <Box flexDirection="column">
            <Box>
              <Box width={12}>
                <Text
                  color={editField === "task" ? colors.textBright : colors.muted}
                  backgroundColor={editField === "task" ? colors.primary : undefined}
                  bold={editField === "task"}
                >
                  Task:
                </Text>
              </Box>
              <Box>
                {editField === "task" ? (
                  <Box>
                    <TextInput
                      value={editTaskQuery}
                      onChange={(v) => {
                        setEditTaskQuery(v);
                        if (!v.trim()) setEditSelectedTask(null);
                      }}
                      placeholder="Search Linear issues..."
                    />
                    {editSelectedTask && !editTaskQuery.trim() && (
                      <Text color={colors.success}> {editSelectedTask.identifier}: {editSelectedTask.title.slice(0, 30)}</Text>
                    )}
                  </Box>
                ) : editSelectedTask ? (
                  <Text color={colors.success}>{editSelectedTask.identifier}: {editSelectedTask.title.slice(0, 40)}</Text>
                ) : (
                  <Text color={colors.muted}>None</Text>
                )}
              </Box>
            </Box>
            {editField === "task" && editTaskSearching && (
              <Box marginLeft={2}>
                <Text color={colors.muted}><Spinner type="dots" /> Searching...</Text>
              </Box>
            )}
            {editField === "task" && editTaskResults.length > 0 && (
              <Box flexDirection="column" marginLeft={2}>
                {editTaskResults.slice(0, 5).map((issue, idx) => (
                  <Box key={issue.id}>
                    <Text
                      color={idx === editTaskSelectedIdx ? colors.textBright : colors.muted}
                      backgroundColor={idx === editTaskSelectedIdx ? colors.primary : undefined}
                      bold={idx === editTaskSelectedIdx}
                    >
                      {idx === editTaskSelectedIdx ? "› " : "  "}
                      {issue.identifier}: {issue.title.slice(0, 50)}
                      {issue.state ? ` [${issue.state}]` : ""}
                    </Text>
                  </Box>
                ))}
              </Box>
            )}
            {!editLinearApiKey && editField === "task" && (
              <Box marginLeft={2}>
                <Text color={colors.muted} dimColor>No Linear API key configured</Text>
              </Box>
            )}
          </Box>

          <Box marginTop={0}>
            <Text color={colors.muted} dimColor>
              [Tab] next · [Shift+Tab] prev · [Ctrl+S] save · [Esc] cancel
            </Text>
          </Box>
        </Box>
      )}
      {runScriptMode && runScriptSession && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.accent}
          marginX={1}
          paddingX={2}
          paddingY={0}
        >
          <Box marginBottom={0}>
            <Text backgroundColor={colors.accent} color={colors.textBright} bold>
              {" Run Script — "}{runScriptSession.name}{" "}
            </Text>
          </Box>
          {runScriptEntries.map(([name, command], idx) => (
            <Box key={name}>
              <Text
                color={idx === runScriptSelectedIdx ? colors.textBright : colors.muted}
                backgroundColor={idx === runScriptSelectedIdx ? colors.primary : undefined}
                bold={idx === runScriptSelectedIdx}
              >
                {idx === runScriptSelectedIdx ? "› " : "  "}
                {name}
              </Text>
              <Text color={colors.muted} dimColor> — {command.length > 50 ? command.slice(0, 47) + "..." : command}</Text>
            </Box>
          ))}
          <Box marginTop={0}>
            <Text color={colors.muted} dimColor>
              ↑↓ navigate · Enter run · Esc cancel
            </Text>
          </Box>
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
          </Text>
          <Text backgroundColor={colors.primary} color={colors.textBright} bold>{" p "}</Text>
          <Text color={colors.muted}> open</Text>
          <Text color={colors.separator}> · </Text>
          <Text backgroundColor={colors.primary} color={colors.textBright} bold>{" esc "}</Text>
          <Text color={colors.muted}> dismiss</Text>
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
