import { FlatList, StyleSheet, RefreshControl } from "react-native";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { useSessions } from "../../src/api/hooks";
import SessionCard from "../../src/components/SessionCard";
import LoadingState from "../../src/components/LoadingState";
import EmptyState from "../../src/components/EmptyState";
import { colors, spacing, fontSize } from "../../src/theme";
import type { Session } from "../../src/types";

export default function SessionsScreen() {
  const router = useRouter();
  const { data: sessions, isLoading, refetch, isRefetching } = useSessions();

  const onRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState message="Loading sessions..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Sessions</Text>
      <FlatList<Session>
        data={sessions ?? []}
        keyExtractor={(item) => item.sessionName || item.name}
        renderItem={({ item }) => (
          <SessionCard
            session={item}
            onPress={() =>
              router.push(
                `/session/${encodeURIComponent(item.sessionName || item.name)}`
              )
            }
          />
        )}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="console"
            title="No Sessions"
            message="No active sessions found. Start a session with CSM to see it here."
          />
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  title: {
    fontSize: fontSize.xxl,
    fontWeight: "700",
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  list: {
    padding: spacing.lg,
    paddingTop: spacing.sm,
  },
});
