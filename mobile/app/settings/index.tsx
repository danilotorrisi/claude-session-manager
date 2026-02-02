import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, Keyboard } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState, useEffect } from "react";
import { getServerUrl, setServerUrl, apiFetch } from "../../src/api/client";
import type { HealthResponse } from "../../src/types";
import { colors, spacing, fontSize, borderRadius } from "../../src/theme";

export default function SettingsScreen() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getServerUrl().then(setUrl);
  }, []);

  const testConnection = async () => {
    Keyboard.dismiss();
    setTesting(true);
    try {
      // Temporarily set URL to test it
      const oldUrl = await getServerUrl();
      await setServerUrl(url);
      const health = await apiFetch<HealthResponse>("/api/health");
      if (health.status === "ok") {
        Alert.alert("Success", `Connected. ${health.workers} workers, ${health.sessions} sessions.`);
      } else {
        await setServerUrl(oldUrl);
        Alert.alert("Error", "Server returned unexpected status.");
      }
    } catch {
      Alert.alert("Connection Failed", "Could not reach the server at this URL.");
    } finally {
      setTesting(false);
    }
  };

  const saveUrl = async () => {
    Keyboard.dismiss();
    await setServerUrl(url.replace(/\/+$/, ""));
    Alert.alert("Saved", "Server URL updated.");
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Server URL</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={setUrl}
            placeholder="http://localhost:3000"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, styles.testButton]}
              onPress={testConnection}
              disabled={testing}
            >
              <Text style={styles.buttonText}>
                {testing ? "Testing..." : "Test Connection"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.saveButton]} onPress={saveUrl}>
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>About</Text>
          <Text style={styles.aboutText}>CSM Mobile v1.0.0</Text>
          <Text style={styles.aboutSubtext}>Claude Session Manager — Mobile Client</Text>
        </View>
      </View>
    </SafeAreaView>
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
    marginLeft: spacing.xs,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
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
    marginBottom: spacing.md,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.md,
    borderWidth: 0.5,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  buttonRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: "center",
  },
  testButton: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  saveButton: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: "600",
  },
  aboutText: {
    fontSize: fontSize.md,
    color: colors.textPrimary,
    fontWeight: "500",
  },
  aboutSubtext: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
