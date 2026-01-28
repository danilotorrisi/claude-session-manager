import React from "react";
import { Box, Text, useInput } from "ink";
import type { Session } from "../../types";

interface SessionListProps {
  sessions: Session[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  onActivate: (session: Session) => void;
}

export function SessionList({
  sessions,
  selectedIndex,
  onSelect,
  onActivate,
}: SessionListProps) {
  useInput((input, key) => {
    if (key.upArrow) {
      onSelect(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      onSelect(Math.min(sessions.length - 1, selectedIndex + 1));
    } else if (key.return && sessions[selectedIndex]) {
      onActivate(sessions[selectedIndex]);
    }
  });

  if (sessions.length === 0) {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text color="gray">No active sessions</Text>
        <Text color="gray" dimColor>
          Press [c] to create a new session
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header row */}
      <Box marginBottom={1}>
        <Box width={3}>
          <Text color="gray"> </Text>
        </Box>
        <Box width={18}>
          <Text color="gray" bold>
            SESSION
          </Text>
        </Box>
        <Box width={12}>
          <Text color="gray" bold>
            STATUS
          </Text>
        </Box>
        <Box width={10}>
          <Text color="gray" bold>
            AGE
          </Text>
        </Box>
        <Box>
          <Text color="gray" bold>
            TITLE
          </Text>
        </Box>
      </Box>

      {/* Session rows */}
      {sessions.map((session, index) => {
        const isSelected = index === selectedIndex;
        const statusColor = session.attached ? "green" : "yellow";
        const statusIcon = session.attached ? "●" : "○";
        const created = formatRelativeTime(session.created);
        const title = session.title || "-";

        return (
          <Box key={session.fullName}>
            <Box width={3}>
              <Text color={isSelected ? "cyan" : "gray"}>
                {isSelected ? "›" : " "}
              </Text>
            </Box>
            <Box width={18}>
              <Text
                color={isSelected ? "cyan" : "white"}
                bold={isSelected}
              >
                {session.name.slice(0, 16)}
              </Text>
            </Box>
            <Box width={12}>
              <Text color={statusColor}>
                {statusIcon} {session.attached ? "attached" : "detached"}
              </Text>
            </Box>
            <Box width={10}>
              <Text color="gray">{created}</Text>
            </Box>
            <Box>
              <Text color={isSelected ? "magenta" : "gray"} dimColor={!session.title}>
                {title.slice(0, 30)}
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
