import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, fontSize } from "../theme";
import type { GitStats } from "../types";

interface GitStatsBarProps {
  stats: GitStats;
}

export default function GitStatsBar({ stats }: GitStatsBarProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.files}>
        {stats.filesChanged} file{stats.filesChanged !== 1 ? "s" : ""}
      </Text>
      {stats.insertions > 0 && (
        <Text style={styles.insertions}>+{stats.insertions}</Text>
      )}
      {stats.deletions > 0 && (
        <Text style={styles.deletions}>-{stats.deletions}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  files: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  insertions: {
    fontSize: fontSize.xs,
    color: colors.success,
    fontWeight: "600",
  },
  deletions: {
    fontSize: fontSize.xs,
    color: colors.danger,
    fontWeight: "600",
  },
});
