import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import { ConfirmDialog } from "../components/ConfirmDialog";
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
import { exitTuiAndAttachAutoReturn, exitTuiAndAttachTerminal, exitTuiAndAttachPM, exitTuiAndAttachRemote, exitTuiAndAttachRemoteTerminal, exitTuiAndAttachRemotePM } from "../index";
import { colors } from "../theme";
import { useStreamLog } from "../hooks/useStreamLog";
import { useWsSessions } from "../hooks/useWsSessions";
import type { LogEntry } from "../hooks/useStreamLog";

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

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function logEntryColor(type: LogEntry["type"]): string {
  switch (type) {
    case "assistant": return "#60A5FA";
    case "tool_approval": return colors.warning;
    case "result": return colors.success;
    case "status": return colors.muted;
    case "error": return colors.danger;
  }
}

export function SessionDetail({ state, dispatch, onRefresh }: SessionDetailProps) {
  const { exit } = useApp();
  const session = state.selectedSession;
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [worktreePath, setWorktreePath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmKill, setConfirmKill] = useState(false);
  const [showKillDialog, setShowKillDialog] = useState(false);

  const { entries, streamingText } = useStreamLog(session?.name);
  const { pendingApprovals, approveTool, denyTool } = useWsSessions();

  // Find pending approval for the current session
  const sessionApproval = session
    ? pendingApprovals.find((a) => a.sessionName === session.name)
    : undefined;

  useEffect(() => {
    if (session) {
      loadSessionMetadata(session.name).then(setMetadata);
      getWorktreePath(session.name).then(setWorktreePath);
    }
  }, [session]);

  const handleAttach = useCallback(async () => {
    if (!session) return;
    const tmuxSessionName = getSessionName(session.name);
    if (session.host) {
      await exitTuiAndAttachRemote(tmuxSessionName, session.host, session.worktreePath);
    } else {
      await exitTuiAndAttachAutoReturn(session.name, tmuxSessionName);
    }
  }, [session]);

  const handleAttachTerminal = useCallback(async () => {
    if (!session) return;
    const tmuxSessionName = getSessionName(session.name);
    if (session.host) {
      await exitTuiAndAttachRemoteTerminal(tmuxSessionName, session.host, session.worktreePath);
    } else {
      await exitTuiAndAttachTerminal(session.name, tmuxSessionName, worktreePath || undefined);
    }
  }, [session, worktreePath]);

  const handleAttachPM = useCallback(async () => {
    if (!session) return;

    const { sessionPMExists } = await import("../../lib/session-pm");
    const hasPM = await sessionPMExists(session.name, session.host);

    if (!hasPM) {
      dispatch({ type: "SET_ERROR", error: `Session "${session.name}" has no PM window` });
      return;
    }

    const tmuxSessionName = getSessionName(session.name);

    if (session.host) {
      await exitTuiAndAttachRemotePM(tmuxSessionName, session.host);
    } else {
      await exitTuiAndAttachPM(tmuxSessionName);
    }
  }, [session, dispatch]);

  const handleKill = useCallback(async () => {
    if (!session) return;
    setShowKillDialog(true);
  }, [session]);

  const executeKill = useCallback(async () => {
    if (!session) return;

    setShowKillDialog(false);
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
  }, [session, metadata, dispatch, onRefresh]);

  useInput((input, key) => {
    // Handle kill confirmation dialog
    if (showKillDialog) {
      if (input === "y" || input === "Y") {
        executeKill();
      } else if (input === "n" || input === "N" || key.escape) {
        setShowKillDialog(false);
      }
      return;
    }

    // Handle tool approval keybindings
    if (sessionApproval) {
      if (input === "y" || input === "Y") {
        approveTool(sessionApproval.sessionName, sessionApproval.requestId);
        return;
      }
      if (input === "n" || input === "N") {
        denyTool(sessionApproval.sessionName, sessionApproval.requestId, "Denied from TUI");
        return;
      }
    }

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
    } else if (input === "w") {
      handleAttachPM();
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

  // Show kill confirmation dialog as fullscreen overlay
  if (showKillDialog) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <ConfirmDialog
          title="Confirm Kill Session"
          message={`You are about to kill session "${session.name}"`}
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

  const displayedEntries = entries.slice(-10);

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {/* Tool Approval Banner */}
      {sessionApproval && (
        <Box
          marginBottom={1}
          paddingX={2}
          paddingY={0}
          borderStyle="round"
          borderColor={colors.warning}
        >
          <Box flexDirection="column">
            <Box>
              <Text color={colors.warning} bold>{"! Tool approval needed: "}</Text>
              <Text color={colors.textBright} bold>{sessionApproval.toolName}</Text>
            </Box>
            <Box>
              <Text color={colors.muted} wrap="truncate">
                {JSON.stringify(sessionApproval.toolInput, null, 2).split("\n").slice(0, 4).join("\n")}
                {JSON.stringify(sessionApproval.toolInput, null, 2).split("\n").length > 4 ? "\n..." : ""}
              </Text>
            </Box>
            <Box>
              <Box marginRight={2}>
                <Text backgroundColor={colors.success} color={colors.buttonBg} bold>{" y "}</Text>
                <Text color={colors.muted}> approve</Text>
              </Box>
              <Box>
                <Text backgroundColor={colors.danger} color={colors.buttonBg} bold>{" n "}</Text>
                <Text color={colors.muted}> deny</Text>
              </Box>
            </Box>
          </Box>
        </Box>
      )}

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

      {/* Feedback Reports section */}
      {session.feedbackReports && session.feedbackReports.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Box marginBottom={1}>
            <Text bold backgroundColor={colors.warning} color={colors.textBright}>
              {" Reports "}
            </Text>
          </Box>
          {session.feedbackReports.map((report, i) => (
            <Box key={i} marginBottom={0}>
              <Box width={16}>
                <Text color={colors.muted}>
                  {new Date(report.timestamp).toLocaleString()}
                </Text>
              </Box>
              <Text color={colors.accent}>{report.url}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Streaming text section */}
      {streamingText && (
        <Box marginTop={1} flexDirection="column">
          <Box marginBottom={0}>
            <Text bold backgroundColor={colors.primary} color={colors.textBright}>
              {" Streaming "}
            </Text>
            <Text color={colors.text}> </Text>
            <Text color={colors.text}>
              <Spinner type="dots" />
            </Text>
          </Box>
          <Box paddingX={1}>
            <Text color="#22D3EE" wrap="wrap">
              {streamingText.length > 500
                ? "..." + streamingText.slice(-500)
                : streamingText}
            </Text>
          </Box>
        </Box>
      )}

      {/* Live Log section */}
      {displayedEntries.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Box marginBottom={1}>
            <Text bold backgroundColor={colors.primary} color={colors.textBright}>
              {" Live Log "}
            </Text>
            <Text color={colors.muted} dimColor> ({entries.length} entries)</Text>
          </Box>
          {displayedEntries.map((entry, i) => (
            <Box key={i}>
              <Text color={colors.mutedDark}>[{formatTime(entry.timestamp)}]</Text>
              <Text color={logEntryColor(entry.type)}>{" "}{entry.type.padEnd(14)}</Text>
              <Text color={colors.text} wrap="truncate"> {entry.content.slice(0, 120)}</Text>
            </Box>
          ))}
        </Box>
      )}

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
