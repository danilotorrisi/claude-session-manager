import React from "react";
import { Box, Text } from "ink";
import type { View } from "../types";
import { colors } from "../theme";

interface FooterProps {
  view: View;
}

interface KeyHint {
  key: string;
  label: string;
}

const keyHints: Record<View, KeyHint[]> = {
  dashboard: [
    { key: "↑↓", label: "navigate" },
    { key: "enter", label: "manage" },
    { key: "a", label: "attach" },
    { key: "c", label: "create" },
    { key: "k", label: "kill" },
    { key: "r", label: "refresh" },
    { key: "q", label: "quit" },
  ],
  create: [
    { key: "enter", label: "submit" },
    { key: "tab", label: "next field" },
    { key: "esc", label: "cancel" },
  ],
  detail: [
    { key: "a", label: "attach" },
    { key: "k", label: "kill" },
    { key: "esc", label: "back" },
    { key: "q", label: "quit" },
  ],
};

export function Footer({ view }: FooterProps) {
  const hints = keyHints[view];

  return (
    <Box marginTop={1} paddingX={1} paddingY={0}>
      {hints.map((hint, index) => (
        <React.Fragment key={`${hint.key}-${index}`}>
          {index > 0 && <Text color={colors.separator}> · </Text>}
          <Text backgroundColor={colors.primary} color={colors.textBright} bold>
            {` ${hint.key} `}
          </Text>
          <Text color={colors.muted}> {hint.label}</Text>
        </React.Fragment>
      ))}
    </Box>
  );
}
