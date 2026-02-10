import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, fontSize, borderRadius } from "../theme";
import type { Worker } from "../types";
import StatusBadge from "./StatusBadge";
import { relativeTime } from "../utils/formatters";

interface WorkerCardProps {
  worker: Worker;
}

export default function WorkerCard({ worker }: WorkerCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <MaterialCommunityIcons name="server" size={18} color={colors.textSecondary} />
        <Text style={styles.workerId} numberOfLines={1}>
          {worker.id}
        </Text>
        <StatusBadge status={worker.status} size="sm" />
      </View>

      {worker.hostInfo && (
        <View style={styles.hostInfo}>
          <Text style={styles.detail}>
            {worker.hostInfo.os} / {worker.hostInfo.arch}
          </Text>
          {worker.hostInfo.ramUsage && (
            <Text style={styles.detail}>RAM: {worker.hostInfo.ramUsage}</Text>
          )}
          <Text style={styles.detail}>Uptime: {worker.hostInfo.uptime}</Text>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.detail}>
          {worker.sessionCount} session{worker.sessionCount !== 1 ? "s" : ""}
        </Text>
        <Text style={styles.detail}>{relativeTime(worker.lastHeartbeat)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  workerId: {
    fontSize: fontSize.md,
    fontWeight: "700",
    color: colors.textPrimary,
    flex: 1,
  },
  hostInfo: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  detail: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
});
