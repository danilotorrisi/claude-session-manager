import { FlatList, StyleSheet, RefreshControl } from "react-native";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useWorkers } from "../../src/api/hooks";
import WorkerCard from "../../src/components/WorkerCard";
import LoadingState from "../../src/components/LoadingState";
import EmptyState from "../../src/components/EmptyState";
import { colors, spacing, fontSize } from "../../src/theme";
import type { Worker } from "../../src/types";

const STATUS_ORDER: Record<string, number> = {
  online: 0,
  stale: 1,
  offline: 2,
};

export default function WorkersScreen() {
  const { data: workers, isLoading, refetch, isRefetching } = useWorkers();

  const sorted = [...(workers ?? [])].sort(
    (a, b) => (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3)
  );

  const onRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState message="Loading workers..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Workers</Text>
      <FlatList<Worker>
        data={sorted}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <WorkerCard worker={item} />}
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
            icon="server-off"
            title="No Workers"
            message="No workers registered. Start a CSM worker to see it here."
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
