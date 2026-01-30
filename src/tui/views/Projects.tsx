import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
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
type FormField = "name" | "path";

export function Projects({ state, dispatch, onReloadProjects }: ProjectsProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Create mode state
  const [createName, setCreateName] = useState("");
  const [createPath, setCreatePath] = useState("");
  const [createField, setCreateField] = useState<FormField>("name");
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit mode state
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");
  const [editField, setEditField] = useState<FormField>("name");
  const [editError, setEditError] = useState<string | null>(null);
  const [editOriginalName, setEditOriginalName] = useState("");

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
    };
    await addProject(project);
    await onReloadProjects();
    setCreateName("");
    setCreatePath("");
    setCreateField("name");
    setCreateError(null);
    setMode("list");
    dispatch({ type: "SET_MESSAGE", message: `Project "${project.name}" created` });
  }, [createName, createPath, dispatch, onReloadProjects]);

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
    };
    await updateProject(editOriginalName, updated);
    await onReloadProjects();
    setEditName("");
    setEditPath("");
    setEditError(null);
    setMode("list");
    dispatch({ type: "SET_MESSAGE", message: `Project "${updated.name}" updated` });
  }, [editName, editPath, editOriginalName, dispatch, onReloadProjects]);

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
      setEditField("name");
      setEditError(null);
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

  // Create mode input
  useInput((_input, key) => {
    if (key.escape) {
      setMode("list");
      setCreateName("");
      setCreatePath("");
      setCreateError(null);
    } else if (key.tab) {
      setCreateField((f) => (f === "name" ? "path" : "name"));
    } else if (key.return && createField === "path") {
      handleCreate();
    } else if (key.return && createField === "name") {
      setCreateField("path");
    }
  }, { isActive: mode === "create" });

  // Edit mode input
  useInput((_input, key) => {
    if (key.escape) {
      setMode("list");
      setEditName("");
      setEditPath("");
      setEditError(null);
    } else if (key.tab) {
      setEditField((f) => (f === "name" ? "path" : "name"));
    } else if (key.return && editField === "path") {
      handleEdit();
    } else if (key.return && editField === "name") {
      setEditField("path");
    }
  }, { isActive: mode === "edit" });

  const renderForm = (opts: {
    title: string;
    nameValue: string;
    pathValue: string;
    activeField: FormField;
    error: string | null;
    onNameChange: (v: string) => void;
    onPathChange: (v: string) => void;
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

        <Box marginTop={1} paddingX={1}>
          <Text color={colors.muted}>
            [Tab] switch field · [Enter] on path to save · [Esc] cancel
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
      activeField: editField,
      error: editError,
      onNameChange: setEditName,
      onPathChange: setEditPath,
    });
  }

  if (mode === "create") {
    return renderForm({
      title: "Create New Project",
      nameValue: createName,
      pathValue: createPath,
      activeField: createField,
      error: createError,
      onNameChange: setCreateName,
      onPathChange: setCreatePath,
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
