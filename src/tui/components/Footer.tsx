import React from "react";
import { Box, Text } from "ink";
import type { View, Tab } from "../types";
import { colors } from "../theme";

interface FooterProps {
  view: View;
  activeTab?: Tab;
}

interface KeyHint {
  key: string;
  label: string;
}

const keyHints: Record<string, KeyHint[]> = {
  dashboard: [
    { key: "↑↓", label: "navigate" },
    { key: "enter", label: "manage" },
    { key: "a", label: "attach" },
    { key: "t", label: "terminal" },
    { key: "c", label: "create" },
    { key: "k", label: "kill" },
    { key: "f", label: "finder" },
    { key: "r", label: "refresh" },
    { key: "tab", label: "switch tab" },
    { key: "q", label: "quit" },
  ],
  projects: [
    { key: "↑↓", label: "navigate" },
    { key: "c", label: "create" },
    { key: "r", label: "rename" },
    { key: "d", label: "delete" },
    { key: "tab", label: "switch tab" },
    { key: "q", label: "quit" },
  ],
  hosts: [
    { key: "↑↓", label: "navigate" },
    { key: "c", label: "create" },
    { key: "e", label: "edit" },
    { key: "d", label: "delete" },
    { key: "t", label: "test" },
    { key: "r", label: "refresh" },
    { key: "tab", label: "switch tab" },
    { key: "q", label: "quit" },
  ],
  tasks: [
    { key: "↑↓", label: "navigate" },
    { key: "enter", label: "detail" },
    { key: "s", label: "status" },
    { key: "o", label: "open" },
    { key: "/", label: "search" },
    { key: "f", label: "filter" },
    { key: "r", label: "refresh" },
    { key: "tab", label: "switch tab" },
    { key: "q", label: "quit" },
  ],
  create: [
    { key: "enter", label: "submit" },
    { key: "tab", label: "next field" },
    { key: "esc", label: "cancel" },
  ],
  detail: [
    { key: "a", label: "attach" },
    { key: "t", label: "terminal" },
    { key: "k", label: "kill" },
    { key: "esc", label: "back" },
    { key: "q", label: "quit" },
  ],
};

export function Footer({ view, activeTab }: FooterProps) {
  let hintsKey: string;
  if (view === "dashboard" && activeTab === "projects") {
    hintsKey = "projects";
  } else if (view === "dashboard" && activeTab === "hosts") {
    hintsKey = "hosts";
  } else if (view === "dashboard" && activeTab === "tasks") {
    hintsKey = "tasks";
  } else {
    hintsKey = view;
  }
  const hints = keyHints[hintsKey] || keyHints.dashboard;

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
