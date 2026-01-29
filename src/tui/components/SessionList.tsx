import React from "react";
import { Box, Text, useInput } from "ink";
import type { Session } from "../../types";
import { colors } from "../theme";

interface SessionListProps {
  sessions: Session[];
  selectedIndex: number;
  inputActive?: boolean;
  onSelect: (index: number) => void;
  onActivate: (session: Session) => void;
  onPreview?: (session: Session) => void;
  onInfo?: (session: Session) => void;
  sessionGroups?: Map<string | null, Session[]>;
}

export function SessionList({
  sessions,
  selectedIndex,
  inputActive = true,
  onSelect,
  onActivate,
  onPreview,
  onInfo,
  sessionGroups,
}: SessionListProps) {
  useInput((input, key) => {
    if (key.upArrow) {
      onSelect(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      onSelect(Math.min(sessions.length - 1, selectedIndex + 1));
    } else if (key.return && sessions[selectedIndex]) {
      onActivate(sessions[selectedIndex]);
    } else if (input === " " && sessions[selectedIndex] && onPreview) {
      onPreview(sessions[selectedIndex]);
    } else if (input === "o" && sessions[selectedIndex] && onInfo) {
      onInfo(sessions[selectedIndex]);
    }
  }, { isActive: inputActive });

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color={colors.muted}>No active sessions</Text>
        <Text color={colors.muted} dimColor>
          Press [c] to create a new session
        </Text>
      </Box>
    );
  }

  // Build a flat render list with group headers interspersed
  type RenderItem =
    | { type: "header"; label: string }
    | { type: "session"; session: Session; flatIndex: number };

  const renderItems: RenderItem[] = [];

  if (sessionGroups && sessionGroups.size > 0) {
    // Render grouped: named projects first, then ungrouped
    const sortedKeys = Array.from(sessionGroups.keys()).sort((a, b) => {
      if (a === null) return 1;
      if (b === null) return -1;
      return a.localeCompare(b);
    });

    let flatIdx = 0;
    for (const key of sortedKeys) {
      const groupSessions = sessionGroups.get(key)!;
      renderItems.push({ type: "header", label: key ? `▸ ${key}` : "▸ Ungrouped" });
      for (const session of groupSessions) {
        renderItems.push({ type: "session", session, flatIndex: flatIdx });
        flatIdx++;
      }
    }
  } else {
    // No grouping, flat list
    sessions.forEach((session, idx) => {
      renderItems.push({ type: "session", session, flatIndex: idx });
    });
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header row */}
      <Box marginBottom={1}>
        <Box width={3}>
          <Text color={colors.muted}> </Text>
        </Box>
        <Box width={18}>
          <Text color={colors.muted} bold>
            SESSION
          </Text>
        </Box>
        <Box width={14}>
          <Text color={colors.muted} bold>
            STATUS
          </Text>
        </Box>
        <Box width={10}>
          <Text color={colors.muted} bold>
            AGE
          </Text>
        </Box>
        <Box width={18}>
          <Text color={colors.muted} bold>
            CHANGES
          </Text>
        </Box>
        <Box>
          <Text color={colors.muted} bold>
            LAST MESSAGE
          </Text>
        </Box>
      </Box>

      {/* Session rows with optional group headers */}
      {renderItems.map((item, renderIdx) => {
        if (item.type === "header") {
          return (
            <Box key={`header-${item.label}`} paddingX={1} marginTop={renderIdx > 0 ? 1 : 0}>
              <Text color={colors.muted} bold>{item.label}</Text>
            </Box>
          );
        }

        const { session, flatIndex: index } = item;
        const isSelected = index === selectedIndex;
        const created = formatRelativeTime(session.created);
        const displayText = (session.claudeLastMessage?.replace(/\n/g, " ") || session.title || "-");

        // Row background based on claude state
        const rowBg =
          session.claudeState === "idle"
            ? "#1a2e1a"       // dark green tint
            : session.claudeState === "waiting_for_input"
            ? "#3b1a1a"       // dark red tint
            : undefined;      // no background for working / unknown

        const textColor = isSelected ? colors.textBright : colors.text;

        return (
          <Box key={session.fullName} backgroundColor={rowBg}>
            <Box width={3}>
              {isSelected ? (
                <Text backgroundColor={colors.primary} color={colors.textBright} bold>{"›"}</Text>
              ) : (
                <Text backgroundColor={rowBg} color={colors.muted}>{" "}</Text>
              )}
            </Box>
            <Box width={18}>
              <Text
                color={isSelected ? colors.textBright : textColor}
                bold={isSelected}
                backgroundColor={isSelected ? colors.primary : rowBg}
              >
                {session.name.slice(0, 16)}
              </Text>
              {session.archived && (
                <Text color={colors.muted} dimColor backgroundColor={rowBg}> [archived]</Text>
              )}
              {session.mergedAt && !session.archived && (
                <Text color={colors.success} backgroundColor={rowBg}> [merged]</Text>
              )}
            </Box>
            {session.linearIssue && (
              <Box width={12}>
                <Text color={colors.accent} backgroundColor={rowBg}>
                  [{session.linearIssue.identifier}]
                </Text>
              </Box>
            )}
            <Box width={14}>
              {session.claudeState === "working" ? (
                <Text color={colors.warning} backgroundColor={rowBg}>{"◎ working"}</Text>
              ) : session.claudeState === "waiting_for_input" ? (
                <Text color={colors.danger} bold backgroundColor={rowBg}>{"◈ waiting"}</Text>
              ) : session.claudeState === "idle" ? (
                <Text color={colors.success} backgroundColor={rowBg}>{"◇ idle"}</Text>
              ) : (
                <Text color={colors.mutedDark} dimColor backgroundColor={rowBg}>{"-"}</Text>
              )}
            </Box>
            <Box width={10}>
              <Text color={colors.muted} backgroundColor={rowBg}>{created}</Text>
            </Box>
            <Box width={18}>
              {session.gitStats ? (
                <Text backgroundColor={rowBg}>
                  <Text color={colors.muted}>{session.gitStats.filesChanged} 📄 </Text>
                  <Text color={colors.success}>+{session.gitStats.insertions} </Text>
                  <Text color={colors.danger}>-{session.gitStats.deletions}</Text>
                </Text>
              ) : (
                <Text color={colors.mutedDark} dimColor backgroundColor={rowBg}>{"-"}</Text>
              )}
            </Box>
            <Box>
              <Text
                color={session.claudeLastMessage ? textColor : session.title ? textColor : colors.mutedDark}
                dimColor={!session.claudeLastMessage && !session.title}
                backgroundColor={rowBg}
              >
                {displayText.slice(0, 50)}
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}
