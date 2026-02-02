import React from "react";
import { Box, Text } from "ink";
import { colors } from "../theme";

interface ConfirmDialogProps {
  title: string;
  message: string;
  details?: string[];
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmDialog({
  title,
  message,
  details,
  warning,
  confirmLabel = "Yes",
  cancelLabel = "No",
}: ConfirmDialogProps) {
  return (
    <Box
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor={colors.danger}
    >
      {/* Title */}
      <Box marginBottom={1}>
        <Text bold color={colors.warning}>
          ⚠ {title}
        </Text>
      </Box>

      {/* Main message */}
      <Box marginBottom={1}>
        <Text>{message}</Text>
      </Box>

      {/* Details list */}
      {details && details.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color={colors.muted}>This will:</Text>
          {details.map((detail, idx) => (
            <Box key={idx} marginLeft={2}>
              <Text color={colors.muted}>• {detail}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Warning */}
      {warning && (
        <Box marginBottom={1}>
          <Text color={colors.danger} italic>
            {warning}
          </Text>
        </Box>
      )}

      {/* Confirmation prompt */}
      <Box marginTop={1}>
        <Text>{title.includes("Kill") ? "Kill" : title.includes("Archive") ? "Archive" : "Confirm"}? </Text>
        <Text color={colors.success} bold>
          [{confirmLabel.charAt(0).toUpperCase()}]
        </Text>
        <Text color={colors.success}>{confirmLabel.slice(1)}</Text>
        <Text> / </Text>
        <Text color={colors.danger} bold>
          [{cancelLabel.charAt(0).toUpperCase()}]
        </Text>
        <Text color={colors.danger}>{cancelLabel.slice(1)}</Text>
        <Text color={colors.muted}> · Esc to cancel</Text>
      </Box>
    </Box>
  );
}
