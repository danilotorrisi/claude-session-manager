import React from "react";
import { Box, Text } from "ink";
import type { GitFileChange } from "../../types";
import { colors } from "../theme";

const MAX_VISIBLE_PER_SECTION = 6;
const DIFF_WINDOW_SIZE = 10;

function statusIcon(status: GitFileChange["status"]): React.ReactNode {
  switch (status) {
    case "added":
      return <Text color={colors.success}>+</Text>;
    case "deleted":
      return <Text color={colors.danger}>-</Text>;
    case "renamed":
      return <Text color={colors.warning}>{"\u2192"}</Text>;
    case "modified":
    default:
      return <Text color={colors.warning}>M</Text>;
  }
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return "\u2026" + str.slice(str.length - max + 1);
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

function FileRow({ change, isSelected, globalIndex }: { change: GitFileChange; isSelected: boolean; globalIndex: number }) {
  return (
    <Box key={globalIndex} gap={1}>
      <Text>{isSelected ? "\u25B8" : " "}</Text>
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
    const sourceLabel = selectedFile?.source === "committed" ? "committed" : "uncommitted";

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color={colors.primary} bold>{truncate(selectedFile?.file || "", 35)}</Text>
          <Text color={colors.muted} dimColor>({sourceLabel})</Text>
          <Text color={colors.muted} dimColor>[{"\u2190"}] back</Text>
        </Box>
        {loadingDiff ? (
          <Text color={colors.muted} dimColor>Loading diff{"\u2026"}</Text>
        ) : (
          <>
            {hasMoreAbove && <Text color={colors.muted} dimColor>{"\u2191"} more</Text>}
            {visibleLines.map((line, i) => (
              <Text key={diffScrollOffset + i} color={diffLineColor(line)}>
                {truncate(line, 60)}
              </Text>
            ))}
            {hasMoreBelow && <Text color={colors.muted} dimColor>{"\u2193"} more</Text>}
            {diffLines.length === 0 && (
              <Text color={colors.muted} dimColor>No diff available</Text>
            )}
          </>
        )}
      </Box>
    );
  }

  // Split changes by source
  const uncommitted = changes.filter((c) => c.source !== "committed");
  const committed = changes.filter((c) => c.source === "committed");

  // Build flat list: uncommitted files first, then committed
  // selectedFileIndex indexes into this combined flat list (which is `changes` ordered by source)
  const flatList: GitFileChange[] = [...uncommitted, ...committed];

  // Compute which items are visible per section
  const uncommittedVisible = uncommitted.slice(0, MAX_VISIBLE_PER_SECTION);
  const uncommittedRemaining = uncommitted.length - uncommittedVisible.length;
  const committedVisible = committed.slice(0, MAX_VISIBLE_PER_SECTION);
  const committedRemaining = committed.length - committedVisible.length;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text color={colors.muted} bold>Git Changes ({changes.length} files)</Text>
        <Text color={colors.muted} dimColor>[{"\u2192"}] diff</Text>
      </Box>

      {/* Uncommitted section */}
      <Box gap={1}>
        <Text color={colors.warning} bold>{"\u25CF"} Uncommitted ({uncommitted.length} files)</Text>
      </Box>
      {uncommitted.length === 0 ? (
        <Text color={colors.muted} dimColor>  No changes</Text>
      ) : (
        <>
          {uncommittedVisible.map((change, i) => {
            const globalIdx = flatList.indexOf(change);
            return (
              <FileRow
                key={`u-${i}`}
                change={change}
                isSelected={globalIdx === selectedFileIndex}
                globalIndex={globalIdx}
              />
            );
          })}
          {uncommittedRemaining > 0 && (
            <Text color={colors.muted} dimColor>  {"\u2026"} and {uncommittedRemaining} more</Text>
          )}
        </>
      )}

      {/* Committed section */}
      <Box gap={1} marginTop={uncommitted.length > 0 ? 0 : 0}>
        <Text color={colors.primary} bold>{"\u25CB"} Committed ({committed.length} files)</Text>
      </Box>
      {committed.length === 0 ? (
        <Text color={colors.muted} dimColor>  No changes</Text>
      ) : (
        <>
          {committedVisible.map((change, i) => {
            const globalIdx = flatList.indexOf(change);
            return (
              <FileRow
                key={`c-${i}`}
                change={change}
                isSelected={globalIdx === selectedFileIndex}
                globalIndex={globalIdx}
              />
            );
          })}
          {committedRemaining > 0 && (
            <Text color={colors.muted} dimColor>  {"\u2026"} and {committedRemaining} more</Text>
          )}
        </>
      )}
    </Box>
  );
}
