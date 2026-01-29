import React, { useState, useCallback, useEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import type { AppState, AppAction } from "../types";
import { nextTab } from "../types";
import type { Project } from "../../types";
import { addProject, deleteProject, renameProject, loadConfig, getProjectsBase } from "../../lib/config";
import { colors } from "../theme";

interface ProjectsProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onReloadProjects: () => Promise<void>;
}

type Mode = "list" | "create" | "rename";
type CreateField = "name" | "path";

export function Projects({ state, dispatch, onReloadProjects }: ProjectsProps) {
  const { exit } = useApp();
  const [mode, setMode] = useState<Mode>("list");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Create mode state
  const [createName, setCreateName] = useState("");
  const [createPath, setCreatePath] = useState("");
  const [createField, setCreateField] = useState<CreateField>("name");
  const [createError, setCreateError] = useState<string | null>(null);

  // Rename mode state
  const [renameName, setRenameName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

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

  const handleRename = useCallback(async () => {
    const project = projects[selectedIndex];
    if (!project) return;
    if (!renameName.trim()) {
      setRenameError("Name cannot be empty");
      return;
    }
    const newName = renameName.trim();
    if (newName === project.name) {
      setMode("list");
      return;
    }
    await renameProject(project.name, newName);
    await onReloadProjects();
    setRenameName("");
    setRenameError(null);
    setMode("list");
    dispatch({ type: "SET_MESSAGE", message: `Project renamed to "${newName}"` });
  }, [projects, selectedIndex, renameName, dispatch, onReloadProjects]);

  // List mode input
  useInput((input, key) => {
    if (mode !== "list") return;

    if (input === "q") {
      exit();
    } else if (key.tab) {
      dispatch({ type: "SET_TAB", tab: nextTab(state.activeTab) });
    } else if (input === "c") {
      setMode("create");
      setCreateField("name");
    } else if (input === "r" && projects[selectedIndex]) {
      setRenameName(projects[selectedIndex].name);
      setRenameError(null);
      setMode("rename");
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
    if (mode !== "create") return;

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

  // Rename mode input
  useInput((_input, key) => {
    if (mode !== "rename") return;

    if (key.escape) {
      setMode("list");
      setRenameName("");
      setRenameError(null);
    } else if (key.return) {
      handleRename();
    }
  }, { isActive: mode === "rename" });

  if (mode === "rename") {
    const project = projects[selectedIndex];
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text backgroundColor={colors.accent} color={colors.textBright} bold>
            {" ◆ Rename Project "}
          </Text>
        </Box>

        {renameError && (
          <Box marginBottom={1} paddingX={1}>
            <Text color={colors.danger}>✗ {renameError}</Text>
          </Box>
        )}

        <Box marginBottom={1} paddingX={1}>
          <Text color={colors.muted}>Renaming: {project?.name}</Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.primary}
          paddingX={2}
          marginBottom={1}
        >
          <Box>
            <Box width={16}>
              <Text color={colors.textBright} backgroundColor={colors.primary} bold>
                New Name:
              </Text>
            </Box>
            <Box>
              <TextInput
                value={renameName}
                onChange={setRenameName}
                placeholder="new-name"
              />
            </Box>
          </Box>
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text color={colors.muted}>
            [Enter] confirm · [Esc] cancel
          </Text>
        </Box>
      </Box>
    );
  }

  if (mode === "create") {
    const fieldBorderColor = (field: CreateField) =>
      createField === field ? colors.primary : colors.cardBorder;

    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1}>
          <Text backgroundColor={colors.accent} color={colors.textBright} bold>
            {" ◆ Create New Project "}
          </Text>
        </Box>

        {createError && (
          <Box marginBottom={1} paddingX={1}>
            <Text color={colors.danger}>✗ {createError}</Text>
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
              <Text color={createField === "name" ? colors.textBright : colors.muted} backgroundColor={createField === "name" ? colors.primary : undefined} bold={createField === "name"}>
                Project Name:
              </Text>
            </Box>
            <Box>
              {createField === "name" ? (
                <TextInput
                  value={createName}
                  onChange={setCreateName}
                  placeholder="my-project"
                />
              ) : (
                <Text>{createName || <Text color={colors.muted}>my-project</Text>}</Text>
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
              <Text color={createField === "path" ? colors.textBright : colors.muted} backgroundColor={createField === "path" ? colors.primary : undefined} bold={createField === "path"}>
                Repo Path:
              </Text>
            </Box>
            <Box>
              {createField === "path" ? (
                <TextInput
                  value={createPath}
                  onChange={setCreatePath}
                  placeholder={projectsBase ? "org/repo-name" : "/path/to/repo"}
                />
              ) : (
                <Text>{createPath || <Text color={colors.muted}>{projectsBase ? "org/repo-name" : "/path/to/repo"}</Text>}</Text>
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
            [Tab] switch field · [Enter] on path to create · [Esc] cancel
          </Text>
        </Box>
      </Box>
    );
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
