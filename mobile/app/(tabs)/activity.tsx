import { FlatList, StyleSheet, RefreshControl } from "react-native";
import { Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useEvents } from "../../src/api/hooks";
import EventItem from "../../src/components/EventItem";
import LoadingState from "../../src/components/LoadingState";
import EmptyState from "../../src/components/EmptyState";
import { colors, spacing, fontSize } from "../../src/theme";
import type { WorkerEvent } from "../../src/types";
import { useState } from "react";

export default function ActivityScreen() {
  const [limit, setLimit] = useState(50);
  const { data, isLoading, refetch, isRefetching } = useEvents(limit);

  const onRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await refetch();
  };

  const onEndReached = () => {
    if (data?.hasMore) {
      setLimit((prev) => prev + 50);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState message="Loading activity..." />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Activity</Text>
      <FlatList<WorkerEvent>
        data={data?.events ?? []}
        keyExtractor={(item, index) => `${item.timestamp}-${item.type}-${index}`}
        renderItem={({ item }) => <EventItem event={item} />}
        contentContainerStyle={styles.list}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="pulse"
            title="No Activity"
            message="No events recorded yet. Activity will appear as workers report in."
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
