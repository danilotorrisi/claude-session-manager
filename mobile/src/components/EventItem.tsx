import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, fontSize } from "../theme";
import type { WorkerEvent } from "../types";
import { relativeTime, eventTypeDescription, eventTypeIcon } from "../utils/formatters";

interface EventItemProps {
  event: WorkerEvent;
}

export default function EventItem({ event }: EventItemProps) {
  const iconName = eventTypeIcon(event.type);
  const description = eventTypeDescription(event.type);

  return (
    <View style={styles.row}>
      <MaterialCommunityIcons
        name={iconName as any}
        size={20}
        color={colors.textSecondary}
        style={styles.icon}
      />
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.description} numberOfLines={1}>
            {description}
          </Text>
          <Text style={styles.time}>{relativeTime(event.timestamp)}</Text>
        </View>
        <View style={styles.bottomRow}>
          <Text style={styles.workerId} numberOfLines={1}>
            {event.workerId}
          </Text>
          {event.sessionName && (
            <Text style={styles.sessionName} numberOfLines={1}>
              {event.sessionName}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  icon: {
    marginRight: spacing.sm,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  description: {
    fontSize: fontSize.sm,
    color: colors.textPrimary,
    fontWeight: "600",
    flex: 1,
    marginRight: spacing.sm,
  },
  time: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  bottomRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  workerId: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  sessionName: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
});
