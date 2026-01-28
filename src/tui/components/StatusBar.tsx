import React, { useEffect } from "react";
import { Box, Text } from "ink";
import { colors } from "../theme";

interface StatusBarProps {
  error: string | null;
  message: string | null;
  sessionCount: number;
  onClearMessage?: () => void;
}

export function StatusBar({
  error,
  message,
  sessionCount,
  onClearMessage,
}: StatusBarProps) {
  // Auto-clear messages after 3 seconds
  useEffect(() => {
    if (message && onClearMessage) {
      const timer = setTimeout(onClearMessage, 3000);
      return () => clearTimeout(timer);
    }
  }, [message, onClearMessage]);

  return (
    <Box paddingX={1} marginBottom={1}>
      {error ? (
        <Text color={colors.danger}>✗ {error}</Text>
      ) : message ? (
        <Text color={colors.success}>✓ {message}</Text>
      ) : (
        <Text color={colors.muted}>
          {sessionCount} session{sessionCount !== 1 ? "s" : ""} active
        </Text>
      )}
    </Box>
  );
}
