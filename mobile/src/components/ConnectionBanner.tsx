import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, fontSize, borderRadius } from "../theme";

interface ConnectionBannerProps {
  onRetry: () => void;
  retrying?: boolean;
}

export default function ConnectionBanner({ onRetry, retrying }: ConnectionBannerProps) {
  return (
    <View style={styles.banner}>
      <View style={styles.left}>
        <MaterialCommunityIcons name="wifi-off" size={18} color={colors.danger} />
        <Text style={styles.text}>Server unreachable</Text>
      </View>
      <TouchableOpacity onPress={onRetry} style={styles.retryBtn} disabled={retrying}>
        <Text style={styles.retryText}>{retrying ? "Retrying..." : "Retry"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.dangerDim,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.danger + "40",
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  text: {
    color: colors.danger,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  retryBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
  },
  retryText: {
    color: colors.textPrimary,
    fontSize: fontSize.xs,
    fontWeight: "600",
  },
});
