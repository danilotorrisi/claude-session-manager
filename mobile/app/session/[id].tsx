import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Linking } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSessions } from "../../src/api/hooks";
import StatusBadge from "../../src/components/StatusBadge";
import GitStatsBar from "../../src/components/GitStatsBar";
import LinearIssueBadge from "../../src/components/LinearIssueBadge";
import LoadingState from "../../src/components/LoadingState";
import EmptyState from "../../src/components/EmptyState";
import { relativeTime, fileStatusIcon, claudeStateLabel } from "../../src/utils/formatters";
import { colors, spacing, fontSize, borderRadius } from "../../src/theme";

export default function SessionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: sessions, isLoading } = useSessions();

  const session = sessions?.find(
    (s) => s.sessionName === id || s.name === id
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState message="Loading session..." />
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <MaterialCommunityIcons name="chevron-left" size={28} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        <EmptyState
          icon="console"
          title="Session Not Found"
          message={`Could not find session "${id}".`}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {session.sessionName || session.name}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* State & Time */}
        <View style={styles.card}>
          <View style={styles.row}>
            <StatusBadge status={session.claudeState || "idle"} size="md" />
            <Text style={styles.timeText}>
              Created {relativeTime(session.created)}
            </Text>
          </View>
        </View>

        {/* Last Message */}
        {session.claudeLastMessage && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Last Message</Text>
            <Text style={styles.messageText}>{session.claudeLastMessage}</Text>
          </View>
        )}

        {/* Git Changes */}
        {session.gitStats && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Git Changes</Text>
            <GitStatsBar stats={session.gitStats} />
            {session.gitStats.fileChanges?.map((f, i) => (
              <View key={i} style={styles.fileRow}>
                <Text style={[styles.fileStatus, {
                  color: f.status === "added" ? colors.success
                    : f.status === "deleted" ? colors.danger
                    : colors.textMuted
                }]}>
                  {fileStatusIcon(f.status)}
                </Text>
                <Text style={styles.fileName} numberOfLines={1}>{f.file}</Text>
                {(f.insertions > 0 || f.deletions > 0) && (
                  <Text style={styles.fileDiff}>
                    <Text style={{ color: colors.success }}>+{f.insertions}</Text>
                    {" "}
                    <Text style={{ color: colors.danger }}>-{f.deletions}</Text>
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Linear Issue */}
        {session.linearIssue && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Linear Issue</Text>
            <LinearIssueBadge
              issue={session.linearIssue}
              onPress={() => {
                if (session.linearIssue?.url) {
                  Linking.openURL(session.linearIssue.url);
                }
              }}
            />
            {session.linearIssue.state && (
              <Text style={styles.detailText}>
                State: {session.linearIssue.state}
              </Text>
            )}
          </View>
        )}

        {/* Info */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Info</Text>
          {session.workerId && (
            <DetailRow label="Worker" value={session.workerId} />
          )}
          {session.worktreePath && (
            <DetailRow label="Worktree" value={session.worktreePath} />
          )}
          {session.projectName && (
            <DetailRow label="Project" value={session.projectName} />
          )}
        </View>

        {/* Feedback Reports */}
        {session.feedbackReports && session.feedbackReports.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Feedback Reports</Text>
            {session.feedbackReports.map((report, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => Linking.openURL(report.url)}
                style={styles.reportRow}
              >
                <MaterialCommunityIcons
                  name="file-document-outline"
                  size={16}
                  color={colors.accent}
                />
                <Text style={styles.reportText}>
                  {relativeTime(report.timestamp)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  backBtn: {
    padding: spacing.xs,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.textPrimary,
    flex: 1,
    marginLeft: spacing.xs,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  cardLabel: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timeText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  messageText: {
    fontSize: fontSize.md,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.xs,
    gap: spacing.sm,
  },
  fileStatus: {
    fontSize: fontSize.md,
    fontWeight: "700",
    width: 16,
    textAlign: "center",
  },
  fileName: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
    fontFamily: "monospace",
  },
  fileDiff: {
    fontSize: fontSize.xs,
  },
  detailText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  detailLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    fontWeight: "500",
  },
  detailValue: {
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    flex: 1,
    textAlign: "right",
    marginLeft: spacing.md,
  },
  reportRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  reportText: {
    fontSize: fontSize.sm,
    color: colors.accent,
  },
});
