import React from "react";
import { Box, Text } from "ink";
import type { GitFileChange } from "../../types";
import { colors } from "../theme";

const MAX_VISIBLE = 10;
const DIFF_WINDOW_SIZE = 10;

function statusIcon(status: GitFileChange["status"]): React.ReactNode {
  switch (status) {
    case "added":
      return <Text color={colors.success}>+</Text>;
    case "deleted":
      return <Text color={colors.danger}>-</Text>;
    case "renamed":
      return <Text color={colors.warning}>→</Text>;
    case "modified":
    default:
      return <Text color={colors.warning}>M</Text>;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return "…" + str.slice(str.length - max + 1);
}

function diffLineColor(line: string): string {
  if (line.startsWith("@@")) return "cyan";
  if (line.startsWith("+")) return colors.success;
  if (line.startsWith("-")) return colors.danger;
  return colors.muted;
}

interface GitChangesPanelProps {
  changes: GitFileChange[];
  selectedFileIndex: number;
  diffLines: string[] | null;
  diffScrollOffset: number;
  loadingDiff: boolean;
}

export function GitChangesPanel({
  changes,
  selectedFileIndex,
  diffLines,
  diffScrollOffset,
  loadingDiff,
}: GitChangesPanelProps) {
  if (changes.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color={colors.muted} bold>Git Changes</Text>
        <Text color={colors.muted} dimColor>No changes</Text>
      </Box>
    );
  }

  // Diff view mode
  if (diffLines !== null) {
    const selectedFile = changes[selectedFileIndex];
    const visibleLines = diffLines.slice(diffScrollOffset, diffScrollOffset + DIFF_WINDOW_SIZE);
    const hasMoreAbove = diffScrollOffset > 0;
    const hasMoreBelow = diffScrollOffset + DIFF_WINDOW_SIZE < diffLines.length;

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color={colors.primary} bold>{truncate(selectedFile?.file || "", 35)}</Text>
          <Text color={colors.muted} dimColor>[←] back</Text>
        </Box>
        {loadingDiff ? (
          <Text color={colors.muted} dimColor>Loading diff…</Text>
        ) : (
          <>
            {hasMoreAbove && <Text color={colors.muted} dimColor>↑ more</Text>}
            {visibleLines.map((line, i) => (
              <Text key={diffScrollOffset + i} color={diffLineColor(line)}>
                {truncate(line, 60)}
              </Text>
            ))}
            {hasMoreBelow && <Text color={colors.muted} dimColor>↓ more</Text>}
            {diffLines.length === 0 && (
              <Text color={colors.muted} dimColor>No diff available</Text>
            )}
          </>
        )}
      </Box>
    );
  }

  // File list mode
  const visible = changes.slice(0, MAX_VISIBLE);
  const remaining = changes.length - visible.length;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={colors.muted} bold>Git Changes ({changes.length} files)</Text>
        <Text color={colors.muted} dimColor>[→] diff</Text>
      </Box>
      {visible.map((change, i) => {
        const isSelected = i === selectedFileIndex;
        return (
          <Box key={i} gap={1}>
            <Text>{isSelected ? "▸" : " "}</Text>
            {statusIcon(change.status)}
            <Text color={isSelected ? colors.primary : colors.text} bold={isSelected}>
              {truncate(change.file, 38)}
            </Text>
            {(change.insertions > 0 || change.deletions > 0) && (
              <Box gap={0}>
                {change.insertions > 0 && (
                  <Text color={colors.success}>+{change.insertions}</Text>
                )}
                {change.insertions > 0 && change.deletions > 0 && <Text> </Text>}
                {change.deletions > 0 && (
                  <Text color={colors.danger}>-{change.deletions}</Text>
                )}
              </Box>
            )}
          </Box>
        );
      })}
      {remaining > 0 && (
        <Text color={colors.muted} dimColor>… and {remaining} more files</Text>
      )}
    </Box>
  );
}
