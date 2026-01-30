import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "../components/TextInput";
import type { AppState, AppAction } from "../types";
import { nextTab } from "../types";
import type { R2Config } from "../../types";
import { loadConfig, saveConfig } from "../../lib/config";
import { testR2Credentials } from "../../lib/r2";
import { installR2Credentials, installR2CredentialsLocal } from "../../lib/ssh";
import { colors } from "../theme";

interface ConfigProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

type Section = "general" | "linear" | "r2";
type GeneralField = "worktreeBase" | "projectsBase" | "defaultRepo";
type LinearField = "linearApiKey";
type R2Field = "accountId" | "accessKeyId" | "secretAccessKey" | "bucketName" | "publicUrl";

interface FieldDef {
  key: string;
  label: string;
  section: Section;
  masked?: boolean;
  placeholder?: string;
}

const FIELDS: FieldDef[] = [
  { key: "worktreeBase", label: "Worktree Base", section: "general", placeholder: "/tmp/csm-worktrees" },
  { key: "projectsBase", label: "Projects Base", section: "general", placeholder: "~/Projects" },
  { key: "defaultRepo", label: "Default Repo", section: "general", placeholder: "~/my-repo" },
  { key: "linearApiKey", label: "Linear API Key", section: "linear", masked: true, placeholder: "lin_api_..." },
  { key: "accountId", label: "Account ID", section: "r2", placeholder: "your-cf-account-id" },
  { key: "accessKeyId", label: "Access Key ID", section: "r2", masked: true, placeholder: "your-access-key" },
  { key: "secretAccessKey", label: "Secret Access Key", section: "r2", masked: true, placeholder: "your-secret-key" },
  { key: "bucketName", label: "Bucket Name", section: "r2", placeholder: "csm-reports" },
  { key: "publicUrl", label: "Public URL", section: "r2", placeholder: "https://reports.example.com" },
];

// Extra row indices for toggle and test button
const FEEDBACK_TOGGLE_INDEX = FIELDS.length;
const TEST_R2_INDEX = FIELDS.length + 1;
const TOTAL_ROWS = FIELDS.length + 2;

export function Config({ state, dispatch }: ConfigProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [feedbackEnabled, setFeedbackEnabled] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Load config on mount
  useEffect(() => {
    (async () => {
      const config = await loadConfig();
      const v: Record<string, string> = {};
      v.worktreeBase = config.worktreeBase || "";
      v.projectsBase = config.projectsBase || "";
      v.defaultRepo = config.defaultRepo || "";
      v.linearApiKey = config.linearApiKey || "";
      v.accountId = config.r2?.accountId || "";
      v.accessKeyId = config.r2?.accessKeyId || "";
      v.secretAccessKey = config.r2?.secretAccessKey || "";
      v.bucketName = config.r2?.bucketName || "";
      v.publicUrl = config.r2?.publicUrl || "";
      setValues(v);
      setFeedbackEnabled(config.feedbackEnabled ?? false);
    })();
  }, []);

  const saveAllConfig = useCallback(async () => {
    const config = await loadConfig();
    config.worktreeBase = values.worktreeBase || "/tmp/csm-worktrees";
    config.projectsBase = values.projectsBase || undefined;
    config.defaultRepo = values.defaultRepo || undefined;
    config.linearApiKey = values.linearApiKey || undefined;
    config.feedbackEnabled = feedbackEnabled;

    if (values.accountId && values.accessKeyId && values.secretAccessKey && values.bucketName) {
      config.r2 = {
        accountId: values.accountId,
        accessKeyId: values.accessKeyId,
        secretAccessKey: values.secretAccessKey,
        bucketName: values.bucketName,
        publicUrl: values.publicUrl && values.publicUrl.startsWith("http") ? values.publicUrl : undefined,
      };
    } else {
      config.r2 = undefined;
    }

    await saveConfig(config);
    setStatusMessage("Config saved");
    setTimeout(() => setStatusMessage(null), 3000);

    // Deploy R2 credentials to all hosts if configured
    if (config.r2) {
      await installR2CredentialsLocal(config.r2);
      const hostNames = Object.keys(config.hosts);
      for (const hostName of hostNames) {
        await installR2Credentials(hostName, config.r2);
      }
    }
  }, [values, feedbackEnabled]);

  const handleTestR2 = useCallback(async () => {
    const { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl } = values;
    if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
      setStatusMessage("Fill in all R2 fields first");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }
    setTesting(true);
    const r2Config: R2Config = { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl: publicUrl || undefined };
    const result = await testR2Credentials(r2Config);
    setStatusMessage(result.message);
    setTesting(false);
    setTimeout(() => setStatusMessage(null), 5000);
  }, [values]);

  useInput((input, key) => {
    if (editing) {
      if (key.return) {
        const field = FIELDS[selectedIndex];
        if (field) {
          setValues((prev) => ({ ...prev, [field.key]: editValue }));
        }
        setEditing(false);
      } else if (key.escape) {
        setEditing(false);
      }
      return;
    }

    if (key.escape) {
      dispatch({ type: "SET_TAB", tab: "sessions" });
      dispatch({ type: "SET_VIEW", view: "dashboard" });
      return;
    }

    if (input === "q") {
      exit();
      return;
    }

    if (key.tab) {
      dispatch({ type: "SET_TAB", tab: nextTab(state.activeTab) });
      return;
    }

    if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow) {
      setSelectedIndex((i) => Math.min(TOTAL_ROWS - 1, i + 1));
      return;
    }

    if (key.return) {
      if (selectedIndex < FIELDS.length) {
        // Edit a field
        const field = FIELDS[selectedIndex];
        setEditValue(values[field.key] || "");
        setEditing(true);
      } else if (selectedIndex === FEEDBACK_TOGGLE_INDEX) {
        setFeedbackEnabled((prev) => !prev);
      } else if (selectedIndex === TEST_R2_INDEX) {
        handleTestR2();
      }
      return;
    }

    if (input === "s") {
      saveAllConfig();
      return;
    }

    if (input === "t" && !editing) {
      handleTestR2();
      return;
    }
  });

  const maskValue = (value: string): string => {
    if (!value) return "";
    if (value.length <= 4) return "****";
    return "****" + value.slice(-4);
  };

  const renderField = (field: FieldDef, index: number) => {
    const isSelected = selectedIndex === index;
    const isEditing = editing && isSelected;
    const rawValue = values[field.key] || "";
    const displayValue = field.masked ? maskValue(rawValue) : rawValue;

    return (
      <Box key={field.key} paddingX={2}>
        <Text color={isSelected ? colors.textBright : colors.muted}>
          {isSelected ? "> " : "  "}
        </Text>
        <Box width={20}>
          <Text color={isSelected ? colors.textBright : colors.text}>
            {field.label}
          </Text>
        </Box>
        <Box>
          {isEditing ? (
            <TextInput
              value={editValue}
              onChange={setEditValue}
              placeholder={field.placeholder}
            />
          ) : (
            <Text color={displayValue ? colors.text : colors.muted}>
              {displayValue || field.placeholder || "(not set)"}
            </Text>
          )}
        </Box>
      </Box>
    );
  };

  const renderSection = (title: string, section: Section) => {
    const sectionFields = FIELDS.map((f, i) => ({ ...f, index: i })).filter(
      (f) => f.section === section
    );

    return (
      <Box flexDirection="column" marginBottom={1} key={section}>
        <Box paddingX={2} marginBottom={0}>
          <Text color={colors.accent} bold>
            {title}
          </Text>
        </Box>
        {sectionFields.map((f) => renderField(f, f.index))}
      </Box>
    );
  };

  const isToggleSelected = selectedIndex === FEEDBACK_TOGGLE_INDEX;
  const isTestSelected = selectedIndex === TEST_R2_INDEX;

  return (
    <Box flexDirection="column" flexGrow={1} paddingTop={1}>
      {renderSection("General", "general")}
      {renderSection("Linear", "linear")}
      {renderSection("R2 (Feedback Reports)", "r2")}

      {/* Feedback toggle */}
      <Box paddingX={2}>
        <Text color={isToggleSelected ? colors.textBright : colors.muted}>
          {isToggleSelected ? "> " : "  "}
        </Text>
        <Box width={20}>
          <Text color={isToggleSelected ? colors.textBright : colors.text}>
            Feedback Loop
          </Text>
        </Box>
        <Text color={feedbackEnabled ? colors.success : colors.muted}>
          {feedbackEnabled ? "[ON]" : "[OFF]"}
        </Text>
        <Text color={colors.muted}> (press Enter to toggle)</Text>
      </Box>

      {/* Test R2 button */}
      <Box paddingX={2} marginTop={1}>
        <Text color={isTestSelected ? colors.textBright : colors.muted}>
          {isTestSelected ? "> " : "  "}
        </Text>
        <Text
          color={isTestSelected ? colors.textBright : colors.accent}
          bold={isTestSelected}
        >
          {testing ? "Testing..." : "[Test R2 Credentials]"}
        </Text>
      </Box>

      {/* Status / save hint */}
      <Box paddingX={2} marginTop={1}>
        {statusMessage ? (
          <Text
            color={
              statusMessage.includes("success") || statusMessage === "Config saved"
                ? colors.success
                : statusMessage.includes("fail") || statusMessage.includes("Fill")
                ? colors.danger
                : colors.warning
            }
          >
            {statusMessage}
          </Text>
        ) : (
          <Text color={colors.muted}>
            Press [s] to save, [t] to test R2, [Enter] to edit field
          </Text>
        )}
      </Box>

      {/* Help text */}
      <Box paddingX={2} marginTop={1}>
        <Text color={colors.muted} dimColor>
          R2 auto-deletion: Set a lifecycle rule on your bucket for 14-day expiry on reports/ prefix
        </Text>
      </Box>
    </Box>
  );
}
