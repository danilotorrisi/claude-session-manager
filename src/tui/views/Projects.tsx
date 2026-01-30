import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "../components/TextInput";
import type { AppState, AppAction } from "../types";
import { nextTab } from "../types";
import type { Project } from "../../types";
import { addProject, deleteProject, updateProject, loadConfig, getProjectsBase } from "../../lib/config";
import { colors } from "../theme";

interface ProjectsProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onReloadProjects: () => Promise<void>;
}

type Mode = "list" | "create" | "edit";
type FormField = "name" | "path" | "setupScript" | "envVars" | "runScripts";

export function Projects({ state, dispatch, onReloadProjects }: ProjectsProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Create mode state
  const [createName, setCreateName] = useState("");
  const [createPath, setCreatePath] = useState("");
  const [createSetupScript, setCreateSetupScript] = useState("");
  const [createEnvVars, setCreateEnvVars] = useState<Record<string, string>>({});
  const [createRunScripts, setCreateRunScripts] = useState<Record<string, string>>({});
  const [createField, setCreateField] = useState<FormField>("name");
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit mode state
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");
  const [editSetupScript, setEditSetupScript] = useState("");
  const [editEnvVars, setEditEnvVars] = useState<Record<string, string>>({});
  const [editRunScripts, setEditRunScripts] = useState<Record<string, string>>({});
  const [editField, setEditField] = useState<FormField>("name");
  const [editError, setEditError] = useState<string | null>(null);
  const [editOriginalName, setEditOriginalName] = useState("");

  // Key-value editor state (shared between envVars and runScripts fields)
  const [kvSelectedIndex, setKvSelectedIndex] = useState(0);
  const [kvAddingKey, setKvAddingKey] = useState(false);
  const [kvAddingValue, setKvAddingValue] = useState(false);
  const [kvNewKey, setKvNewKey] = useState("");
  const [kvNewValue, setKvNewValue] = useState("");

  // Projects base
  const [projectsBase, setProjectsBase] = useState<string | null>(null);

  useEffect(() => {
    loadConfig().then((cfg) => {
      const base = getProjectsBase(cfg);
      setProjectsBase(base || null);
    });
  }, []);

  const projects = state.projects;

  const handleCreate = useCallback(async () => {
    if (!createName.trim()) {
      setCreateError("Project name is required");
      return;
    }
    if (!createPath.trim()) {
      setCreateError("Repository path is required");
      return;
    }
    const project: Project = {
      name: createName.trim(),
      repoPath: createPath.trim(),
      ...(createSetupScript.trim() ? { setupScript: createSetupScript.trim() } : {}),
      ...(Object.keys(createEnvVars).length > 0 ? { envVars: createEnvVars } : {}),
      ...(Object.keys(createRunScripts).length > 0 ? { runScripts: createRunScripts } : {}),
    };
    await addProject(project);
    await onReloadProjects();
    setCreateName("");
    setCreatePath("");
    setCreateSetupScript("");
    setCreateEnvVars({});
    setCreateRunScripts({});
    setCreateField("name");
    setCreateError(null);
    setMode("list");
    dispatch({ type: "SET_MESSAGE", message: `Project "${project.name}" created` });
  }, [createName, createPath, createSetupScript, createEnvVars, createRunScripts, dispatch, onReloadProjects]);

  const handleDelete = useCallback(async (project: Project) => {
    if (confirmDelete !== project.name) {
      setConfirmDelete(project.name);
      dispatch({ type: "SET_MESSAGE", message: `Press 'd' again to confirm delete "${project.name}"` });
      return;
    }
    setConfirmDelete(null);
    await deleteProject(project.name);
    await onReloadProjects();
    dispatch({ type: "SET_MESSAGE", message: `Project "${project.name}" deleted` });
    setSelectedIndex((i) => Math.max(0, Math.min(i, projects.length - 2)));
  }, [confirmDelete, projects.length, dispatch, onReloadProjects]);

  const handleEdit = useCallback(async () => {
    if (!editName.trim()) {
      setEditError("Project name is required");
      return;
    }
    if (!editPath.trim()) {
      setEditError("Repository path is required");
      return;
    }
    const updated: Project = {
      name: editName.trim(),
      repoPath: editPath.trim(),
      ...(editSetupScript.trim() ? { setupScript: editSetupScript.trim() } : {}),
      ...(Object.keys(editEnvVars).length > 0 ? { envVars: editEnvVars } : {}),
      ...(Object.keys(editRunScripts).length > 0 ? { runScripts: editRunScripts } : {}),
    };
    await updateProject(editOriginalName, updated);
    await onReloadProjects();
    setEditName("");
    setEditPath("");
    setEditSetupScript("");
    setEditEnvVars({});
    setEditRunScripts({});
    setEditError(null);
    setMode("list");
    dispatch({ type: "SET_MESSAGE", message: `Project "${updated.name}" updated` });
  }, [editName, editPath, editSetupScript, editEnvVars, editRunScripts, editOriginalName, dispatch, onReloadProjects]);

  // List mode input
  useInput((input, key) => {
    if (input === "q") {
      exit();
    } else if (key.tab) {
      dispatch({ type: "SET_TAB", tab: nextTab(state.activeTab) });
    } else if (input === "c") {
      setMode("create");
      setCreateField("name");
    } else if (input === "e" && projects[selectedIndex]) {
      const p = projects[selectedIndex];
      setEditOriginalName(p.name);
      setEditName(p.name);
      setEditPath(p.repoPath);
      setEditSetupScript(p.setupScript || "");
      setEditEnvVars(p.envVars ? { ...p.envVars } : {});
      setEditRunScripts(p.runScripts ? { ...p.runScripts } : {});
      setEditField("name");
      setEditError(null);
      setKvSelectedIndex(0);
      setKvAddingKey(false);
      setKvAddingValue(false);
      setKvNewKey("");
      setKvNewValue("");
      setMode("edit");
    } else if (input === "d" && projects[selectedIndex]) {
      handleDelete(projects[selectedIndex]);
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
      setConfirmDelete(null);
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(projects.length - 1, i + 1));
      setConfirmDelete(null);
    } else if (key.escape) {
      setConfirmDelete(null);
      dispatch({ type: "CLEAR_MESSAGE" });
    }
  }, { isActive: mode === "list" });

  const formFieldOrder: FormField[] = ["name", "path", "setupScript", "envVars", "runScripts"];
  const nextFormField = (f: FormField): FormField => {
    const idx = formFieldOrder.indexOf(f);
    return formFieldOrder[(idx + 1) % formFieldOrder.length];
  };
  const prevFormField = (f: FormField): FormField => {
    const idx = formFieldOrder.indexOf(f);
    return formFieldOrder[(idx - 1 + formFieldOrder.length) % formFieldOrder.length];
  };

  const resetKvState = () => {
    setKvSelectedIndex(0);
    setKvAddingKey(false);
    setKvAddingValue(false);
    setKvNewKey("");
    setKvNewValue("");
  };

  // Helper to get/set the active kv map based on mode and field
  const getActiveKvMap = (formMode: "create" | "edit", field: FormField): Record<string, string> => {
    if (field === "envVars") return formMode === "create" ? createEnvVars : editEnvVars;
    return formMode === "create" ? createRunScripts : editRunScripts;
  };
  const setActiveKvMap = (formMode: "create" | "edit", field: FormField, map: Record<string, string>) => {
    if (field === "envVars") {
      formMode === "create" ? setCreateEnvVars(map) : setEditEnvVars(map);
    } else {
      formMode === "create" ? setCreateRunScripts(map) : setEditRunScripts(map);
    }
  };

  // Create mode input
  useInput((input, key) => {
    if (key.escape) {
      if (kvAddingKey || kvAddingValue) {
        resetKvState();
        return;
      }
      setMode("list");
      setCreateName("");
      setCreatePath("");
      setCreateSetupScript("");
      setCreateEnvVars({});
      setCreateRunScripts({});
      setCreateError(null);
      resetKvState();
    } else if (kvAddingKey || kvAddingValue) {
      // Handled by TextInput
      return;
    } else if (key.tab) {
      if (key.shift) {
        setCreateField(prevFormField(createField));
      } else {
        setCreateField(nextFormField(createField));
      }
      resetKvState();
    } else if (key.return && createField === "runScripts" && !kvAddingKey && !kvAddingValue) {
      handleCreate();
    } else if (key.return && (createField === "name" || createField === "path" || createField === "setupScript")) {
      setCreateField(nextFormField(createField));
    } else if ((createField === "envVars" || createField === "runScripts") && !kvAddingKey && !kvAddingValue) {
      const map = getActiveKvMap("create", createField);
      const entries = Object.entries(map);
      if (input === "a") {
        setKvAddingKey(true);
        setKvNewKey("");
        setKvNewValue("");
      } else if (input === "d" && entries.length > 0) {
        const keyToDelete = entries[kvSelectedIndex]?.[0];
        if (keyToDelete) {
          const newMap = { ...map };
          delete newMap[keyToDelete];
          setActiveKvMap("create", createField, newMap);
          setKvSelectedIndex(Math.max(0, kvSelectedIndex - 1));
        }
      } else if (key.upArrow) {
        setKvSelectedIndex(Math.max(0, kvSelectedIndex - 1));
      } else if (key.downArrow) {
        setKvSelectedIndex(Math.min(entries.length - 1, kvSelectedIndex + 1));
      }
    }
  }, { isActive: mode === "create" && !kvAddingKey && !kvAddingValue });

  // KV add key/value input (shared for create & edit modes)
  useInput((_input, key) => {
    if (key.escape) {
      resetKvState();
      return;
    }
    if (key.return && kvAddingKey) {
      if (!kvNewKey.trim()) {
        resetKvState();
        return;
      }
      setKvAddingKey(false);
      setKvAddingValue(true);
      return;
    }
    if (key.return && kvAddingValue) {
      const activeMode = mode === "create" ? "create" : "edit";
      const activeField = mode === "create" ? createField : editField;
      const map = getActiveKvMap(activeMode as "create" | "edit", activeField);
      setActiveKvMap(activeMode as "create" | "edit", activeField, { ...map, [kvNewKey.trim()]: kvNewValue });
      resetKvState();
    }
  }, { isActive: (mode === "create" || mode === "edit") && (kvAddingKey || kvAddingValue) });

  // Edit mode input
  useInput((input, key) => {
    if (key.escape) {
      if (kvAddingKey || kvAddingValue) {
        resetKvState();
        return;
      }
      setMode("list");
      setEditName("");
      setEditPath("");
      setEditSetupScript("");
      setEditEnvVars({});
      setEditRunScripts({});
      setEditError(null);
      resetKvState();
    } else if (kvAddingKey || kvAddingValue) {
      return;
    } else if (key.tab) {
      if (key.shift) {
        setEditField(prevFormField(editField));
      } else {
        setEditField(nextFormField(editField));
      }
      resetKvState();
    } else if (key.return && editField === "runScripts" && !kvAddingKey && !kvAddingValue) {
      handleEdit();
    } else if (key.return && (editField === "name" || editField === "path" || editField === "setupScript")) {
      setEditField(nextFormField(editField));
    } else if ((editField === "envVars" || editField === "runScripts") && !kvAddingKey && !kvAddingValue) {
      const map = getActiveKvMap("edit", editField);
      const entries = Object.entries(map);
      if (input === "a") {
        setKvAddingKey(true);
        setKvNewKey("");
        setKvNewValue("");
      } else if (input === "d" && entries.length > 0) {
        const keyToDelete = entries[kvSelectedIndex]?.[0];
        if (keyToDelete) {
          const newMap = { ...map };
          delete newMap[keyToDelete];
          setActiveKvMap("edit", editField, newMap);
          setKvSelectedIndex(Math.max(0, kvSelectedIndex - 1));
        }
      } else if (key.upArrow) {
        setKvSelectedIndex(Math.max(0, kvSelectedIndex - 1));
      } else if (key.downArrow) {
        setKvSelectedIndex(Math.min(entries.length - 1, kvSelectedIndex + 1));
      }
    }
  }, { isActive: mode === "edit" && !kvAddingKey && !kvAddingValue });

  const renderKvEditor = (map: Record<string, string>, field: FormField, isActive: boolean, label: string) => {
    const entries = Object.entries(map);
    const fieldBorderColor = isActive ? colors.primary : colors.cardBorder;

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={fieldBorderColor}
        paddingX={2}
        marginBottom={1}
      >
        <Box>
          <Box width={16}>
            <Text color={isActive ? colors.textBright : colors.muted} backgroundColor={isActive ? colors.primary : undefined} bold={isActive}>
              {label}:
            </Text>
          </Box>
          <Text color={colors.muted}>{entries.length} entries</Text>
        </Box>
        {isActive && (
          <Box flexDirection="column" marginTop={1}>
            {entries.length === 0 ? (
              <Text color={colors.muted} dimColor>No entries. Press [a] to add.</Text>
            ) : (
              entries.map(([k, v], idx) => (
                <Box key={k}>
                  <Text
                    color={idx === kvSelectedIndex ? colors.textBright : colors.text}
                    backgroundColor={idx === kvSelectedIndex ? colors.primary : undefined}
                    bold={idx === kvSelectedIndex}
                  >
                    {idx === kvSelectedIndex ? "› " : "  "}
                    {k} = {v}
                  </Text>
                </Box>
              ))
            )}
            {kvAddingKey && (
              <Box>
                <Text color={colors.primary}>+ Key: </Text>
                <TextInput value={kvNewKey} onChange={setKvNewKey} placeholder={field === "envVars" ? "VAR_NAME" : "script-name"} />
              </Box>
            )}
            {kvAddingValue && (
              <Box>
                <Text color={colors.primary}>+ Value for "{kvNewKey}": </Text>
                <TextInput value={kvNewValue} onChange={setKvNewValue} placeholder={field === "envVars" ? "value" : "command to run"} />
              </Box>
            )}
            {!kvAddingKey && !kvAddingValue && (
              <Text color={colors.muted} dimColor>[a] add · [d] delete · ↑↓ navigate</Text>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const renderForm = (opts: {
    title: string;
    nameValue: string;
    pathValue: string;
    setupScriptValue: string;
    envVarsValue: Record<string, string>;
    runScriptsValue: Record<string, string>;
    activeField: FormField;
    error: string | null;
    onNameChange: (v: string) => void;
    onPathChange: (v: string) => void;
    onSetupScriptChange: (v: string) => void;
  }) => {
    const fieldBorderColor = (field: FormField) =>
      opts.activeField === field ? colors.primary : colors.cardBorder;

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text backgroundColor={colors.accent} color={colors.textBright} bold>
            {` ◆ ${opts.title} `}
          </Text>
        </Box>

        {opts.error && (
          <Box marginBottom={1} paddingX={1}>
            <Text color={colors.danger}>✗ {opts.error}</Text>
          </Box>
        )}

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={fieldBorderColor("name")}
          paddingX={2}
          marginBottom={1}
        >
          <Box>
            <Box width={16}>
              <Text color={opts.activeField === "name" ? colors.textBright : colors.muted} backgroundColor={opts.activeField === "name" ? colors.primary : undefined} bold={opts.activeField === "name"}>
                Project Name:
              </Text>
            </Box>
            <Box>
              {opts.activeField === "name" ? (
                <TextInput
                  value={opts.nameValue}
                  onChange={opts.onNameChange}
                  placeholder="my-project"
                />
              ) : (
                <Text>{opts.nameValue || <Text color={colors.muted}>my-project</Text>}</Text>
              )}
            </Box>
          </Box>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={fieldBorderColor("path")}
          paddingX={2}
          marginBottom={1}
        >
          <Box>
            <Box width={16}>
              <Text color={opts.activeField === "path" ? colors.textBright : colors.muted} backgroundColor={opts.activeField === "path" ? colors.primary : undefined} bold={opts.activeField === "path"}>
                Repo Path:
              </Text>
            </Box>
            <Box>
              {opts.activeField === "path" ? (
                <TextInput
                  value={opts.pathValue}
                  onChange={opts.onPathChange}
                  placeholder={projectsBase ? "org/repo-name" : "/path/to/repo"}
                />
              ) : (
                <Text>{opts.pathValue || <Text color={colors.muted}>{projectsBase ? "org/repo-name" : "/path/to/repo"}</Text>}</Text>
              )}
            </Box>
          </Box>
          {projectsBase && (
            <Text color={colors.muted} dimColor>
              base: {projectsBase}/
            </Text>
          )}
        </Box>

        {/* Setup Script */}
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={fieldBorderColor("setupScript")}
          paddingX={2}
          marginBottom={1}
        >
          <Box>
            <Box width={16}>
              <Text color={opts.activeField === "setupScript" ? colors.textBright : colors.muted} backgroundColor={opts.activeField === "setupScript" ? colors.primary : undefined} bold={opts.activeField === "setupScript"}>
                Setup Script:
              </Text>
            </Box>
            <Box>
              {opts.activeField === "setupScript" ? (
                <TextInput
                  value={opts.setupScriptValue}
                  onChange={opts.onSetupScriptChange}
                  placeholder="bun install && bun run build"
                />
              ) : (
                <Text>{opts.setupScriptValue || <Text color={colors.muted}>(none)</Text>}</Text>
              )}
            </Box>
          </Box>
          {opts.activeField === "setupScript" && (
            <Text color={colors.muted} dimColor>Runs in terminal window on session create. Use && or ; for multiple commands.</Text>
          )}
        </Box>

        {/* Env Vars */}
        {renderKvEditor(opts.envVarsValue, "envVars", opts.activeField === "envVars", "Env Vars")}

        {/* Run Scripts */}
        {renderKvEditor(opts.runScriptsValue, "runScripts", opts.activeField === "runScripts", "Run Scripts")}

        <Box marginTop={1} paddingX={1}>
          <Text color={colors.muted}>
            [Tab/Shift+Tab] switch field · [Enter] on last field to save · [Esc] cancel
          </Text>
        </Box>
      </Box>
    );
  };

  if (mode === "edit") {
    return renderForm({
      title: "Edit Project",
      nameValue: editName,
      pathValue: editPath,
      setupScriptValue: editSetupScript,
      envVarsValue: editEnvVars,
      runScriptsValue: editRunScripts,
      activeField: editField,
      error: editError,
      onNameChange: setEditName,
      onPathChange: setEditPath,
      onSetupScriptChange: setEditSetupScript,
    });
  }

  if (mode === "create") {
    return renderForm({
      title: "Create New Project",
      nameValue: createName,
      pathValue: createPath,
      setupScriptValue: createSetupScript,
      envVarsValue: createEnvVars,
      runScriptsValue: createRunScripts,
      activeField: createField,
      error: createError,
      onNameChange: setCreateName,
      onPathChange: setCreatePath,
      onSetupScriptChange: setCreateSetupScript,
    });
  }

  // List mode
  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {projectsBase && (
        <Box paddingX={1} marginBottom={1}>
          <Text color={colors.muted}>Projects base: {projectsBase}/</Text>
        </Box>
      )}
      {projects.length === 0 ? (
        <Box paddingX={1}>
          <Text color={colors.muted}>No projects configured. Press [c] to create one.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {projects.map((project, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <Box key={project.name} paddingX={1}>
                <Text
                  color={isSelected ? colors.textBright : colors.text}
                  backgroundColor={isSelected ? colors.primary : undefined}
                  bold={isSelected}
                >
                  {isSelected ? "› " : "  "}
                  {project.name}
                </Text>
                <Text color={colors.muted}> — {project.repoPath}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
