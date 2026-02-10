import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, fontSize, borderRadius } from "../theme";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: string;
  color?: string;
}

export default function MetricCard({ label, value, icon, color = colors.accent }: MetricCardProps) {
  return (
    <View style={styles.card}>
      <MaterialCommunityIcons
        name={icon as any}
        size={22}
        color={color}
        style={styles.icon}
      />
      <Text style={[styles.value, { color }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    alignItems: "center",
    flex: 1,
  },
  icon: {
    marginBottom: spacing.sm,
  },
  value: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
