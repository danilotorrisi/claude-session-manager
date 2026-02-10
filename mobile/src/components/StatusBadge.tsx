import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, fontSize } from "../theme";

type Status = "online" | "stale" | "offline" | "idle" | "working" | "waiting_for_input";
type Size = "sm" | "md";

interface StatusBadgeProps {
  status: Status;
  size?: Size;
}

function dotColor(status: Status): string {
  switch (status) {
    case "online":
    case "idle":
      return colors.success;
    case "working":
      return "#60A5FA";
    case "stale":
    case "waiting_for_input":
      return colors.warning;
    case "offline":
      return colors.textMuted;
  }
}

function labelText(status: Status): string {
  switch (status) {
    case "online":
      return "Online";
    case "stale":
      return "Stale";
    case "offline":
      return "Offline";
    case "idle":
      return "Idle";
    case "working":
      return "Working";
    case "waiting_for_input":
      return "Waiting";
  }
}

export default function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const color = dotColor(status);
  const dotSize = size === "sm" ? 8 : 10;
  const textSize = size === "sm" ? fontSize.xs : fontSize.sm;

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.dot,
          { width: dotSize, height: dotSize, borderRadius: dotSize / 2, backgroundColor: color },
        ]}
      />
      <Text style={[styles.label, { fontSize: textSize, color }]}>{labelText(status)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  dot: {},
  label: {
    fontWeight: "600",
  },
});
