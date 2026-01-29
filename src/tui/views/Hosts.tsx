import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import type { AppState, AppAction } from "../types";
import { nextTab } from "../types";
import type { HostConfig } from "../../types";
import { addHost, deleteHost, updateHost } from "../../lib/config";
import { testConnection } from "../../lib/ssh";
import { colors } from "../theme";

interface HostsProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onReloadHosts: () => Promise<void>;
}

type Mode = "list" | "create" | "edit";
type Field = "name" | "host" | "repo";
const fieldOrder: Field[] = ["name", "host", "repo"];

export function Hosts({ state, dispatch, onReloadHosts }: HostsProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form state
  const [fieldName, setFieldName] = useState("");
  const [fieldHost, setFieldHost] = useState("");
  const [fieldRepo, setFieldRepo] = useState("");
  const [activeField, setActiveField] = useState<Field>("name");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const hostEntries = Object.entries(state.hosts);

  const resetForm = () => {
    setFieldName("");
    setFieldHost("");
    setFieldRepo("");
    setActiveField("name");
    setFormError(null);
    setEditingKey(null);
  };

  const nextField = () => {
    const idx = fieldOrder.indexOf(activeField);
    setActiveField(fieldOrder[(idx + 1) % fieldOrder.length]);
  };

  const handleSubmit = useCallback(async () => {
    const name = fieldName.trim();
    const host = fieldHost.trim();
    const repo = fieldRepo.trim();

    if (!name) {
      setFormError("Name is required");
      return;
    }
    if (!host) {
      setFormError("Host is required");
      return;
    }

    if (mode === "create" && state.hosts[name]) {
      setFormError(`Host "${name}" already exists`);
      return;
    }

    const hostConfig: HostConfig = { host };
    if (repo) hostConfig.defaultRepo = repo;

    if (mode === "edit" && editingKey && editingKey !== name) {
      await deleteHost(editingKey);
    }

    if (mode === "create") {
      await addHost(name, hostConfig);
    } else {
      await updateHost(name, hostConfig);
    }

    await onReloadHosts();
    resetForm();
    setMode("list");
    dispatch({
      type: "SET_MESSAGE",
      message: mode === "create" ? `Host "${name}" created` : `Host "${name}" updated`,
    });
  }, [fieldName, fieldHost, fieldRepo, mode, state.hosts, editingKey, dispatch, onReloadHosts]);

  const handleDelete = useCallback(
    async (name: string) => {
      if (confirmDelete !== name) {
        setConfirmDelete(name);
        dispatch({ type: "SET_MESSAGE", message: `Press 'd' again to confirm delete "${name}"` });
        return;
      }
      setConfirmDelete(null);
      await deleteHost(name);
      await onReloadHosts();
      dispatch({ type: "SET_MESSAGE", message: `Host "${name}" deleted` });
      setSelectedIndex((i) => Math.max(0, Math.min(i, hostEntries.length - 2)));
    },
    [confirmDelete, hostEntries.length, dispatch, onReloadHosts]
  );

  const handleTest = useCallback(
    async (name: string) => {
      dispatch({ type: "SET_MESSAGE", message: `Testing connection to "${name}"...` });
      const result = await testConnection(name);
      dispatch({
        type: "SET_MESSAGE",
        message: result.success
          ? `Connection to "${name}" succeeded`
          : `Connection to "${name}" failed: ${result.stderr}`,
      });
    },
    [dispatch]
  );

  // List mode input
  useInput(
    (input, key) => {
      if (mode !== "list") return;

      if (input === "q") {
        exit();
      } else if (key.tab) {
        dispatch({ type: "SET_TAB", tab: nextTab(state.activeTab) });
      } else if (input === "c") {
        resetForm();
        setMode("create");
      } else if (input === "e" && hostEntries[selectedIndex]) {
        const [name, config] = hostEntries[selectedIndex];
        setFieldName(name);
        setFieldHost(config.host);
        setFieldRepo(config.defaultRepo || "");
        setActiveField("name");
        setFormError(null);
        setEditingKey(name);
        setMode("edit");
      } else if (input === "d" && hostEntries[selectedIndex]) {
        handleDelete(hostEntries[selectedIndex][0]);
      } else if (input === "t" && hostEntries[selectedIndex]) {
        handleTest(hostEntries[selectedIndex][0]);
      } else if (key.upArrow) {
        setSelectedIndex((i) => Math.max(0, i - 1));
        setConfirmDelete(null);
      } else if (key.downArrow) {
        setSelectedIndex((i) => Math.min(hostEntries.length - 1, i + 1));
        setConfirmDelete(null);
      } else if (key.escape) {
        setConfirmDelete(null);
        dispatch({ type: "CLEAR_MESSAGE" });
      }
    },
    { isActive: mode === "list" }
  );

  // Form mode input (create/edit)
  useInput(
    (_input, key) => {
      if (mode !== "create" && mode !== "edit") return;

      if (key.escape) {
        resetForm();
        setMode("list");
      } else if (key.tab) {
        nextField();
      } else if (key.return && activeField === "repo") {
        handleSubmit();
      } else if (key.return) {
        nextField();
      }
    },
    { isActive: mode === "create" || mode === "edit" }
  );

  // Form view (create or edit)
  if (mode === "create" || mode === "edit") {
    const title = mode === "create" ? "Create New Host" : "Edit Host";
    const fieldBorderColor = (field: Field) =>
      activeField === field ? colors.primary : colors.cardBorder;

    const fields: { field: Field; label: string; value: string; onChange: (v: string) => void; placeholder: string }[] = [
      { field: "name", label: "Name:", value: fieldName, onChange: setFieldName, placeholder: "my-server" },
      { field: "host", label: "Host:", value: fieldHost, onChange: setFieldHost, placeholder: "user@hostname" },
      { field: "repo", label: "Default Repo:", value: fieldRepo, onChange: setFieldRepo, placeholder: "/path/to/repo (optional)" },
    ];

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text backgroundColor={colors.accent} color={colors.textBright} bold>
            {` ◆ ${title} `}
          </Text>
        </Box>

        {formError && (
          <Box marginBottom={1} paddingX={1}>
            <Text color={colors.danger}>✗ {formError}</Text>
          </Box>
        )}

        {fields.map(({ field, label, value, onChange, placeholder }) => (
          <Box
            key={field}
            flexDirection="column"
            borderStyle="round"
            borderColor={fieldBorderColor(field)}
            paddingX={2}
            marginBottom={1}
          >
            <Box>
              <Box width={16}>
                <Text
                  color={activeField === field ? colors.textBright : colors.muted}
                  backgroundColor={activeField === field ? colors.primary : undefined}
                  bold={activeField === field}
                >
                  {label}
                </Text>
              </Box>
              <Box>
                {activeField === field ? (
                  <TextInput value={value} onChange={onChange} placeholder={placeholder} />
                ) : (
                  <Text>{value || <Text color={colors.muted}>{placeholder}</Text>}</Text>
                )}
              </Box>
            </Box>
          </Box>
        ))}

        <Box marginTop={1} paddingX={1}>
          <Text color={colors.muted}>
            [Tab] switch field · [Enter] on last field to submit · [Esc] cancel
          </Text>
        </Box>
      </Box>
    );
  }

  // List mode
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {hostEntries.length === 0 ? (
        <Box paddingX={1}>
          <Text color={colors.muted}>No hosts configured. Press [c] to create one.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {hostEntries.map(([name, config], idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <Box key={name} paddingX={1}>
                <Text
                  color={isSelected ? colors.textBright : colors.text}
                  backgroundColor={isSelected ? colors.primary : undefined}
                  bold={isSelected}
                >
                  {isSelected ? "› " : "  "}
                  {name}
                </Text>
                <Text color={colors.muted}>
                  {" "}— {config.host}
                  {config.defaultRepo ? ` (repo: ${config.defaultRepo})` : ""}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
