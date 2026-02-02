import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, fontSize, borderRadius } from "../theme";
import type { LinearIssue } from "../types";

interface LinearIssueBadgeProps {
  issue: LinearIssue;
  onPress?: () => void;
}

export default function LinearIssueBadge({ issue, onPress }: LinearIssueBadgeProps) {
  const content = (
    <View style={styles.badge}>
      <Text style={styles.identifier}>{issue.identifier}</Text>
      <Text style={styles.title} numberOfLines={1}>
        {issue.title}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    alignSelf: "flex-start",
    maxWidth: "100%" as any,
  },
  identifier: {
    fontSize: fontSize.xs,
    fontWeight: "700",
    color: colors.textPrimary,
    marginRight: spacing.xs,
  },
  title: {
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    flexShrink: 1,
  },
});
