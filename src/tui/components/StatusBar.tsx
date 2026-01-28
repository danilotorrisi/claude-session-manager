import React, { useEffect } from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface StatusBarProps {
  loading: boolean;
  error: string | null;
  message: string | null;
  sessionCount: number;
  onClearMessage?: () => void;
}

export function StatusBar({
  loading,
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
      {loading ? (
        <Box>
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
          <Text color="gray"> Loading sessions...</Text>
        </Box>
      ) : error ? (
        <Text color="red">✗ {error}</Text>
      ) : message ? (
        <Text color="green">✓ {message}</Text>
      ) : (
        <Text color="gray">
          {sessionCount} session{sessionCount !== 1 ? "s" : ""} active
        </Text>
      )}
    </Box>
  );
}
