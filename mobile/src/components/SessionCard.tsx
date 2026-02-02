import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, fontSize, borderRadius } from "../theme";
import type { Session } from "../types";
import StatusBadge from "./StatusBadge";
import GitStatsBar from "./GitStatsBar";
import LinearIssueBadge from "./LinearIssueBadge";
import { relativeTime } from "../utils/formatters";

interface SessionCardProps {
  session: Session;
  onPress: () => void;
}

function cardBackground(claudeState?: string): string {
  switch (claudeState) {
    case "idle":
      return colors.claudeIdle.bg;
    case "working":
      return colors.claudeWorking.bg;
    case "waiting_for_input":
      return colors.claudeWaiting.bg;
    default:
      return colors.surface;
  }
}

export default function SessionCard({ session, onPress }: SessionCardProps) {
  const bg = cardBackground(session.claudeState);

  return (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: bg }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>
          {session.name}
        </Text>
        {session.lastUpdate && (
          <Text style={styles.time}>{relativeTime(session.lastUpdate)}</Text>
        )}
      </View>

      <View style={styles.meta}>
        {session.claudeState && (
          <StatusBadge status={session.claudeState} size="sm" />
        )}
        {session.gitStats && <GitStatsBar stats={session.gitStats} />}
      </View>

      {session.claudeLastMessage ? (
        <Text style={styles.message} numberOfLines={2}>
          {session.claudeLastMessage}
        </Text>
      ) : null}

      {session.linearIssue && (
        <View style={styles.issueRow}>
          <LinearIssueBadge issue={session.linearIssue} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  name: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
    marginRight: spacing.sm,
  },
  time: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    lineHeight: 18,
    marginBottom: spacing.sm,
  },
  issueRow: {
    flexDirection: "row",
    marginTop: spacing.xs,
  },
});
