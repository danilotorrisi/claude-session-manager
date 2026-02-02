import { View, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useDashboardData, useSessions } from "../../src/api/hooks";
import MetricCard from "../../src/components/MetricCard";
import SessionCard from "../../src/components/SessionCard";
import ConnectionBanner from "../../src/components/ConnectionBanner";
import LoadingState from "../../src/components/LoadingState";
import { colors, spacing, fontSize } from "../../src/theme";

export default function DashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const dashboard = useDashboardData();
  const sessions = useSessions();

  const waitingSessions = (sessions.data ?? []).filter(
    (s) => s.claudeState === "waiting_for_input"
  );

  if (dashboard.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState message="Connecting to server..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Dashboard</Text>
          <TouchableOpacity onPress={() => router.push("/settings")} style={styles.settingsBtn}>
            <MaterialCommunityIcons name="cog-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {!dashboard.isConnected && (
          <ConnectionBanner onRetry={() => queryClient.invalidateQueries({ queryKey: ["health"] })} />
        )}

        <View style={styles.grid}>
          <MetricCard
            label="Sessions"
            value={dashboard.totalSessions}
            icon="console"
            color={colors.accent}
          />
          <MetricCard
            label="Workers"
            value={dashboard.activeWorkers}
            icon="server"
            color={colors.success}
          />
          <MetricCard
            label="Working"
            value={dashboard.workingCount}
            icon="cog"
            color="#60A5FA"
          />
          <MetricCard
            label="Waiting"
            value={dashboard.waitingCount}
            icon="hand-back-left-outline"
            color={colors.warning}
          />
        </View>

        {waitingSessions.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Needs Attention</Text>
            {waitingSessions.map((session) => (
              <SessionCard
                key={session.sessionName || session.name}
                session={session}
                onPress={() =>
                  router.push(
                    `/session/${encodeURIComponent(session.sessionName || session.name)}`
                  )
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  settingsBtn: {
    padding: spacing.xs,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  section: {
    marginTop: spacing.md,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
});
