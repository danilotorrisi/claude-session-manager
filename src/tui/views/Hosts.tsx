import React, { useState, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import type { AppState, AppAction } from "../types";
import { nextTab } from "../types";
import type { HostConfig } from "../../types";
import { addHost, updateHost, deleteHost, renameHost } from "../../lib/config";
import { installHooks } from "../../lib/ssh";
import { LOCAL_HOST_KEY } from "../hooks/useHosts";
import { colors } from "../theme";

interface HostsProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onReload: () => Promise<Record<string, HostConfig>>;
  onCheckHost: (name: string) => Promise<void>;
  onRefreshStatus: () => Promise<void>;
}

type Mode = "list" | "create" | "edit";
type FormField = "name" | "host" | "repo";

export function Hosts({ state, dispatch, onReload, onCheckHost, onRefreshStatus }: HostsProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formHost, setFormHost] = useState("");
  const [formRepo, setFormRepo] = useState("");
  const [formField, setFormField] = useState<FormField>("name");
  const [formError, setFormError] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);

  const remoteEntries = Object.entries(state.hosts);
  // Combined list: local host first, then remote hosts
  const allEntries: { name: string; host: string; defaultRepo?: string; isLocal: boolean }[] = [
    { name: LOCAL_HOST_KEY, host: "localhost", isLocal: true },
    ...remoteEntries.map(([name, config]) => ({
      name,
      host: config.host,
      defaultRepo: config.defaultRepo,
      isLocal: false,
    })),
  ];

  const resetForm = useCallback(() => {
    setFormName("");
    setFormHost("");
    setFormRepo("");
    setFormField("name");
    setFormError(null);
    setEditingName(null);
  }, []);

  const handleCreate = useCallback(async () => {
    if (!formName.trim()) {
      setFormError("Host name is required");
      return;
    }
    if (!formHost.trim()) {
      setFormError("SSH host is required");
      return;
    }
    if (state.hosts[formName.trim()] && formName.trim() !== editingName) {
      setFormError("Host name already exists");
      return;
    }
    const config: HostConfig = { host: formHost.trim() };
    if (formRepo.trim()) config.defaultRepo = formRepo.trim();

    if (editingName) {
      if (editingName !== formName.trim()) {
        await renameHost(editingName, formName.trim());
      }
      await updateHost(formName.trim(), config);
      dispatch({ type: "SET_MESSAGE", message: `Host "${formName.trim()}" updated` });
    } else {
      await addHost(formName.trim(), config);
      dispatch({ type: "SET_MESSAGE", message: `Host "${formName.trim()}" created. Installing hooks...` });
    }

    await onReload();
    resetForm();
    setMode("list");

    const hostName = formName.trim();
    // Check the new/updated host
    onCheckHost(hostName);

    // Auto-install hooks on new hosts
    if (!editingName) {
      const hookResult = await installHooks(hostName);
      dispatch({
        type: "SET_MESSAGE",
        message: hookResult.success
          ? `Host "${hostName}" created. ${hookResult.stdout}`
          : `Host "${hostName}" created but hook install failed: ${hookResult.stderr}`,
      });
    }
  }, [formName, formHost, formRepo, editingName, state.hosts, dispatch, onReload, onCheckHost, resetForm]);

  const handleDelete = useCallback(async (name: string) => {
    if (confirmDelete !== name) {
      setConfirmDelete(name);
      dispatch({ type: "SET_MESSAGE", message: `Press 'd' again to confirm delete "${name}"` });
      return;
    }
    setConfirmDelete(null);
    await deleteHost(name);
    await onReload();
    dispatch({ type: "SET_MESSAGE", message: `Host "${name}" deleted` });
    setSelectedIndex((i) => Math.max(0, Math.min(i, allEntries.length - 2)));
  }, [confirmDelete, allEntries.length, dispatch, onReload]);

  const handleInstallHooks = useCallback(
    async (name: string) => {
      dispatch({ type: "SET_MESSAGE", message: `Installing hooks on "${name}"...` });
      const result = await installHooks(name);
      dispatch({
        type: "SET_MESSAGE",
        message: result.success
          ? result.stdout
          : `Failed to install hooks on "${name}": ${result.stderr}`,
      });
    },
    [dispatch]
  );

  // List mode input
  useInput((input, key) => {
    if (mode !== "list") return;

    const selected = allEntries[selectedIndex];
    const isLocalSelected = selected?.isLocal;

    if (input === "q") {
      exit();
    } else if (key.tab) {
      dispatch({ type: "SET_TAB", tab: nextTab(state.activeTab) });
    } else if (input === "c") {
      resetForm();
      setMode("create");
    } else if (input === "e" && selected && !isLocalSelected) {
      const config = state.hosts[selected.name];
      setEditingName(selected.name);
      setFormName(selected.name);
      setFormHost(config.host);
      setFormRepo(config.defaultRepo || "");
      setFormField("name");
      setFormError(null);
      setMode("edit");
    } else if (input === "d" && selected && !isLocalSelected) {
      handleDelete(selected.name);
    } else if (input === "t" && selected) {
      onCheckHost(selected.name);
      const label = isLocalSelected ? "local" : selected.name;
      dispatch({ type: "SET_MESSAGE", message: `Testing ${label}...` });
    } else if (input === "i" && selected && !isLocalSelected) {
      handleInstallHooks(selected.name);
    } else if (input === "r") {
      onRefreshStatus();
      dispatch({ type: "SET_MESSAGE", message: "Refreshing all host statuses..." });
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      setConfirmDelete(null);
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(allEntries.length - 1, i + 1));
      setConfirmDelete(null);
    } else if (key.escape) {
      setConfirmDelete(null);
      dispatch({ type: "CLEAR_MESSAGE" });
    }
  }, { isActive: mode === "list" });

  // Form mode input
  useInput((_input, key) => {
    if (mode !== "create" && mode !== "edit") return;

    if (key.escape) {
      resetForm();
      setMode("list");
    } else if (key.tab) {
      const fields: FormField[] = ["name", "host", "repo"];
      const idx = fields.indexOf(formField);
      setFormField(fields[(idx + 1) % fields.length]);
    } else if (key.return && formField === "repo") {
      handleCreate();
    } else if (key.return) {
      const fields: FormField[] = ["name", "host", "repo"];
      const idx = fields.indexOf(formField);
      if (idx < fields.length - 1) {
        setFormField(fields[idx + 1]);
      }
    }
  }, { isActive: mode === "create" || mode === "edit" });

  // Form rendering
  if (mode === "create" || mode === "edit") {
    const title = mode === "edit" ? "Edit Host" : "Create New Host";
    const fieldBorderColor = (field: FormField) =>
      formField === field ? colors.primary : colors.cardBorder;

    const renderField = (field: FormField, label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={fieldBorderColor(field)}
        paddingX={2}
        marginBottom={1}
        key={field}
      >
        <Box>
          <Box width={16}>
            <Text
              color={formField === field ? colors.textBright : colors.muted}
              backgroundColor={formField === field ? colors.primary : undefined}
              bold={formField === field}
            >
              {label}:
            </Text>
          </Box>
          <Box>
            {formField === field ? (
              <TextInput value={value} onChange={onChange} placeholder={placeholder} />
            ) : (
              <Text>{value || <Text color={colors.muted}>{placeholder}</Text>}</Text>
            )}
          </Box>
        </Box>
      </Box>
    );

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

        {renderField("name", "Name", formName, setFormName, "dev-server")}
        {renderField("host", "SSH Host", formHost, setFormHost, "user@hostname")}
        {renderField("repo", "Default Repo", formRepo, setFormRepo, "/path/to/repo (optional)")}

        <Box marginTop={1} paddingX={1}>
          <Text color={colors.muted}>
            [Tab] switch field · [Enter] on repo to save · [Esc] cancel
          </Text>
        </Box>
      </Box>
    );
  }

  // List mode
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box flexDirection="column">
        {allEntries.map((entry, idx) => {
          const isSelected = idx === selectedIndex;
          const status = state.hostStatus[entry.name];
          const displayName = entry.isLocal
            ? (status?.hostname || "local")
            : entry.name;
          const statusText = !status || status.status === "unknown"
            ? { label: "Unknown", color: colors.muted, dot: "○" }
            : status.status === "checking"
            ? { label: "Checking...", color: colors.warning, dot: "◌" }
            : status.status === "online"
            ? { label: "Online", color: colors.success, dot: "●" }
            : { label: "Offline", color: colors.danger, dot: "●" };

          return (
            <Box key={entry.name} flexDirection="column" marginBottom={1}>
              <Box paddingX={1}>
                <Text
                  color={isSelected ? colors.textBright : colors.text}
                  backgroundColor={isSelected ? colors.primary : undefined}
                  bold={isSelected}
                >
                  {isSelected ? "› " : "  "}
                  {displayName}
                </Text>
                {entry.isLocal && (
                  <Text color={colors.muted} dimColor>  (local)</Text>
                )}
                <Text>  </Text>
                <Text color={statusText.color}>{statusText.dot} {statusText.label}</Text>
                {status?.latencyMs !== undefined && (
                  <Text color={colors.muted}>  {status.latencyMs}ms</Text>
                )}
              </Box>
              <Box paddingX={1}>
                <Text color={colors.muted}>
                  {"    "}
                  {entry.isLocal ? "localhost" : entry.host}
                </Text>
                {status?.os && (
                  <Text color={colors.muted}>  {status.os}</Text>
                )}
                {status?.uptime && (
                  <Text color={colors.muted}> · {status.uptime}</Text>
                )}
                {status?.ramUsage && (
                  <Text color={colors.muted}> · RAM {status.ramUsage}</Text>
                )}
              </Box>
              {entry.defaultRepo && (
                <Box paddingX={1}>
                  <Text color={colors.muted}>{"    "}repo: {entry.defaultRepo}</Text>
                </Box>
              )}
            </Box>
          );
        })}
        {remoteEntries.length === 0 && (
          <Box paddingX={1}>
            <Text color={colors.muted}>No remote hosts configured. Press [c] to add one.</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
