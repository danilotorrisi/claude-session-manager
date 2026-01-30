import React, { useState, useCallback, useEffect, useRef } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { AppState, AppAction } from "../types";
import type { LinearIssue, Project } from "../../types";
import { sessionExists, createSession } from "../../lib/tmux";
import {
  createWorktree,
  getWorktreePath,
  isWorktreeConflictError,
  cleanupStaleWorktree,
} from "../../lib/worktree";
import { getDefaultRepo, getLinearApiKey, getProjects, getHosts, loadConfig, resolveProjectPath, getProjectsBase } from "../../lib/config";
import { searchIssues, listMyIssues } from "../../lib/linear";
import { colors } from "../theme";

interface CreateSessionProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onRefresh: () => Promise<void>;
}

type Field = "linear" | "name" | "project" | "repo" | "host";
type Status = "input" | "creating" | "confirm-cleanup" | "cleaning";

export function CreateSession({ state, dispatch, onRefresh }: CreateSessionProps) {
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [host, setHost] = useState("");
  const [activeField, setActiveField] = useState<Field>("name");
  const [status, setStatus] = useState<Status>("input");
  const [error, setError] = useState<string | null>(null);
  const [defaultRepo, setDefaultRepo] = useState<string | null>(null);
  const [pendingRepoPath, setPendingRepoPath] = useState<string | null>(null);

  // Linear issue state
  const [linearApiKey, setLinearApiKey] = useState<string | null>(null);
  const [linearQuery, setLinearQuery] = useState("");
  const [linearResults, setLinearResults] = useState<LinearIssue[]>([]);
  const [linearSelectedIdx, setLinearSelectedIdx] = useState(0);
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [linearSearching, setLinearSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Project picker state
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectSelectedIdx, setProjectSelectedIdx] = useState(0);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectsBase, setProjectsBase] = useState<string | null>(null);

  // Host picker state
  const [hostNames, setHostNames] = useState<string[]>([]);
  const [hostSelectedIdx, setHostSelectedIdx] = useState(0);

  // Load default repo, Linear API key, and projects on mount
  useEffect(() => {
    getDefaultRepo().then((r) => setDefaultRepo(r || null));
    getLinearApiKey().then((key) => setLinearApiKey(key || null));
    getProjects().then((p) => {
      setProjects(p);
      if (p.length > 0) setActiveField("project");
    });
    loadConfig().then((cfg) => {
      const base = getProjectsBase(cfg);
      setProjectsBase(base || null);
    });
    getHosts().then((hosts) => {
      setHostNames(Object.keys(hosts));
    });

    // Pre-fill from Linear issue if dispatched from Tasks view
    if (state.prefillIssue) {
      const issue = state.prefillIssue;
      setSelectedIssue(issue);
      setName(slugifyIssueName(issue));
      setLinearQuery(issue.identifier);
      dispatch({ type: "SET_PREFILL_ISSUE", issue: null });
    }
  }, []);

  // Debounced Linear search
  useEffect(() => {
    if (activeField !== "linear" || !linearApiKey || !linearQuery.trim()) {
      setLinearResults([]);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLinearSearching(true);
      try {
        const results = await searchIssues(linearQuery, linearApiKey);
        setLinearResults(results);
        setLinearSelectedIdx(0);
      } catch {
        setLinearResults([]);
      } finally {
        setLinearSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [linearQuery, linearApiKey, activeField]);

  const slugifyIssueName = (issue: LinearIssue): string => {
    const raw = `${issue.identifier}-${issue.title}`;
    return raw
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50)
      .replace(/-$/, "");
  };

  const validateName = (value: string): string | null => {
    if (!value.trim()) return "Session name is required";
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return "Only alphanumeric, hyphens, and underscores allowed";
    }
    return null;
  };

  const doCreate = useCallback(async (repoPath: string, hostName?: string) => {
    const issue = selectedIssue || undefined;
    const projName = selectedProject?.name || undefined;

    // Create worktree
    const worktreeResult = await createWorktree(name, repoPath, hostName, issue, projName);

    if (!worktreeResult.success) {
      if (isWorktreeConflictError(worktreeResult.stderr)) {
        setPendingRepoPath(repoPath);
        setStatus("confirm-cleanup");
        return;
      }
      throw new Error(worktreeResult.stderr || "Failed to create worktree");
    }

    // Create tmux session
    const worktreePath = await getWorktreePath(name);
    const sessionResult = await createSession(name, worktreePath, hostName, issue);
    if (!sessionResult.success) {
      throw new Error(sessionResult.stderr || "Failed to create session");
    }

    dispatch({ type: "SET_MESSAGE", message: `Session "${name}" created successfully` });
    dispatch({ type: "SET_VIEW", view: "dashboard" });
    await onRefresh();
  }, [name, selectedIssue, selectedProject, dispatch, onRefresh]);

  const handleCreate = useCallback(async () => {
    // Validate
    const nameError = validateName(name);
    if (nameError) {
      setError(nameError);
      return;
    }

    const config = await loadConfig();
    const hostName = host.trim() || undefined;
    const repoPath = (repo.trim() ? resolveProjectPath(repo.trim(), config, hostName) : null) || (selectedProject ? resolveProjectPath(selectedProject.repoPath, config, hostName) : null) || defaultRepo;
    if (!repoPath) {
      setError("Repository path is required (no default configured)");
      return;
    }

    // Check if session already exists
    if (await sessionExists(name, hostName)) {
      setError(`Session "${name}" already exists`);
      return;
    }

    setStatus("creating");
    setError(null);

    try {
      await doCreate(repoPath, hostName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
      setStatus("input");
    }
  }, [name, repo, host, defaultRepo, selectedProject, doCreate]);

  const handleCleanupAndRetry = useCallback(async () => {
    if (!pendingRepoPath) return;

    setStatus("cleaning");
    const hostName = host.trim() || undefined;

    try {
      await cleanupStaleWorktree(name, pendingRepoPath, hostName);
      await doCreate(pendingRepoPath, hostName);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed after cleanup");
      setStatus("input");
    }
  }, [name, host, pendingRepoPath, doCreate]);

  const hasProjects = projects.length > 0;

  // Field order: project → linear → name → repo → host
  const nextField = (current: Field): Field => {
    if (current === "project") return linearApiKey ? "linear" : "name";
    if (current === "linear") return "name";
    if (current === "name") return "repo";
    if (current === "repo") return "host";
    return "host";
  };

  const prevField = (current: Field): Field => {
    if (current === "host") return "repo";
    if (current === "repo") return "name";
    if (current === "name") return linearApiKey ? "linear" : (hasProjects ? "project" : "name");
    if (current === "linear") return hasProjects ? "project" : "linear";
    return "project";
  };

  useInput((input, key) => {
    if (status === "confirm-cleanup") {
      if (input === "y" || input === "Y") {
        handleCleanupAndRetry();
      } else if (input === "n" || input === "N" || key.escape) {
        setStatus("input");
        setError("Aborted - please choose a different session name");
        setPendingRepoPath(null);
      }
      return;
    }

    if (status !== "input") return;

    if (key.escape) {
      dispatch({ type: "SET_VIEW", view: "dashboard" });
      return;
    }

    // Linear field: arrow keys to navigate results, enter to select
    if (activeField === "linear" && linearResults.length > 0) {
      if (key.upArrow) {
        setLinearSelectedIdx(Math.max(0, linearSelectedIdx - 1));
        return;
      }
      if (key.downArrow) {
        setLinearSelectedIdx(Math.min(linearResults.length - 1, linearSelectedIdx + 1));
        return;
      }
      if (key.return) {
        const issue = linearResults[linearSelectedIdx];
        setSelectedIssue(issue);
        setLinearResults([]);
        setName(slugifyIssueName(issue));
        // If repo is already set (e.g. from project selection), skip to host
        if (repo || selectedProject) {
          setActiveField("host");
        } else {
          setActiveField("name");
        }
        return;
      }
    }

    // Linear field: Enter on empty query loads assigned issues
    if (activeField === "linear" && key.return && !linearQuery.trim() && linearResults.length === 0 && linearApiKey) {
      setLinearSearching(true);
      listMyIssues(linearApiKey).then((results) => {
        setLinearResults(results);
        setLinearSelectedIdx(0);
      }).catch(() => {
        setLinearResults([]);
      }).finally(() => {
        setLinearSearching(false);
      });
      return;
    }

    // Project field: arrow keys to navigate, enter to select
    if (activeField === "project" && hasProjects) {
      if (key.upArrow) {
        setProjectSelectedIdx(Math.max(0, projectSelectedIdx - 1));
        return;
      }
      if (key.downArrow) {
        setProjectSelectedIdx(Math.min(projects.length - 1, projectSelectedIdx + 1));
        return;
      }
      if (key.return) {
        const project = projects[projectSelectedIdx];
        setSelectedProject(project);
        setRepo(project.repoPath);
        setActiveField(linearApiKey ? "linear" : "name");
        return;
      }
    }

    // Host field: arrow keys to navigate and update host, enter to create
    const hostOptions = ["", ...hostNames]; // "" = local
    if (activeField === "host") {
      if (key.upArrow) {
        const newIdx = Math.max(0, hostSelectedIdx - 1);
        setHostSelectedIdx(newIdx);
        setHost(hostOptions[newIdx]);
        return;
      }
      if (key.downArrow) {
        const newIdx = Math.min(hostOptions.length - 1, hostSelectedIdx + 1);
        setHostSelectedIdx(newIdx);
        setHost(hostOptions[newIdx]);
        return;
      }
      if (key.return) {
        handleCreate();
        return;
      }
    }

    if (key.shift && key.tab) {
      setActiveField(prevField(activeField));
    } else if (key.tab || (key.return && activeField !== "host" && activeField !== "linear" && activeField !== "project")) {
      setActiveField(nextField(activeField));
    }
  });

  if (status === "creating") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text color={colors.text}>
            <Spinner type="dots" />
          </Text>
          <Text> Creating session "{name}"...</Text>
        </Box>
      </Box>
    );
  }

  if (status === "cleaning") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text color={colors.text}>
            <Spinner type="dots" />
          </Text>
          <Text> Cleaning up and retrying...</Text>
        </Box>
      </Box>
    );
  }

  if (status === "confirm-cleanup") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box marginBottom={1}>
          <Text bold color={colors.warning}>
            ⚠ Stale Worktree Detected
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            A worktree for "{name}" already exists but may be stale.
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color={colors.muted}>
            This can happen if a previous session wasn't cleaned up properly.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>Clean up and retry? </Text>
          <Text color={colors.success} bold>[y]</Text>
          <Text> / </Text>
          <Text color={colors.danger} bold>[n]</Text>
        </Box>
      </Box>
    );
  }

  const fieldBorderColor = (field: Field) =>
    activeField === field ? colors.primary : colors.cardBorder;

  const effectiveRepo = repo || (selectedProject ? selectedProject.repoPath : null) || defaultRepo;

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box marginBottom={1}>
        <Text backgroundColor={colors.accent} color={colors.textBright} bold>
          {" ◆ Create New Session "}
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1} paddingX={1}>
          <Text color={colors.danger}>✗ {error}</Text>
        </Box>
      )}

      {/* Project (optional, shown if projects exist) */}
      {hasProjects && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={fieldBorderColor("project")}
          paddingX={2}
          marginBottom={1}
        >
          <Box>
            <Box width={16}>
              <Text color={activeField === "project" ? colors.textBright : colors.muted} backgroundColor={activeField === "project" ? colors.primary : undefined} bold={activeField === "project"}>
                Project:
              </Text>
            </Box>
            <Box>
              {selectedProject ? (
                <Text color={colors.success}>{selectedProject.name}</Text>
              ) : (
                <Text color={colors.muted}>(none)</Text>
              )}
            </Box>
          </Box>
          {activeField === "project" && (
            <Box flexDirection="column" marginTop={1}>
              {projects.map((project, idx) => (
                <Box key={project.name}>
                  <Text
                    color={idx === projectSelectedIdx ? colors.textBright : colors.muted}
                    backgroundColor={idx === projectSelectedIdx ? colors.primary : undefined}
                    bold={idx === projectSelectedIdx}
                  >
                    {idx === projectSelectedIdx ? "› " : "  "}
                    {project.name}
                    <Text color={colors.muted} dimColor> — {project.repoPath}</Text>
                  </Text>
                </Box>
              ))}
              {projectsBase && (
                <Text color={colors.muted} dimColor>base: {projectsBase}/</Text>
              )}
              <Text color={colors.muted} dimColor>↑↓ navigate · Enter select · Tab skip</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Linear Issue (optional) */}
      {linearApiKey && (
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={fieldBorderColor("linear")}
          paddingX={2}
          marginBottom={1}
        >
          <Box>
            <Box width={16}>
              <Text color={activeField === "linear" ? colors.textBright : colors.muted} backgroundColor={activeField === "linear" ? colors.primary : undefined} bold={activeField === "linear"}>
                Linear Issue:
              </Text>
            </Box>
            <Box>
              {selectedIssue ? (
                <Text color={colors.success}>{selectedIssue.identifier}: {selectedIssue.title.slice(0, 40)}</Text>
              ) : activeField === "linear" ? (
                <TextInput
                  value={linearQuery}
                  onChange={setLinearQuery}
                  placeholder="Search or Enter to browse..."
                />
              ) : (
                <Text color={colors.muted}>(optional)</Text>
              )}
            </Box>
          </Box>
          {activeField === "linear" && linearSearching && (
            <Box marginTop={1}>
              <Text color={colors.muted}><Spinner type="dots" /> Searching...</Text>
            </Box>
          )}
          {activeField === "linear" && linearResults.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              {linearResults.slice(0, 5).map((issue, idx) => (
                <Box key={issue.id}>
                  <Text
                    color={idx === linearSelectedIdx ? colors.textBright : colors.muted}
                    backgroundColor={idx === linearSelectedIdx ? colors.primary : undefined}
                    bold={idx === linearSelectedIdx}
                  >
                    {idx === linearSelectedIdx ? "› " : "  "}
                    {issue.identifier}: {issue.title.slice(0, 50)}
                    {issue.state ? ` [${issue.state}]` : ""}
                  </Text>
                </Box>
              ))}
              <Text color={colors.muted} dimColor>↑↓ navigate · Enter select · Tab skip · Esc clear</Text>
            </Box>
          )}
          {activeField === "linear" && selectedIssue && (
            <Text color={colors.muted} dimColor>Type to search again, or Tab to continue</Text>
          )}
        </Box>
      )}

      {/* Session Name */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={fieldBorderColor("name")}
        paddingX={2}
        marginBottom={1}
      >
        <Box>
          <Box width={16}>
            <Text color={activeField === "name" ? colors.textBright : colors.muted} backgroundColor={activeField === "name" ? colors.primary : undefined} bold={activeField === "name"}>
              Session Name:
            </Text>
          </Box>
          <Box>
            {activeField === "name" ? (
              <TextInput
                value={name}
                onChange={setName}
                placeholder="my-feature"
              />
            ) : (
              <Text>{name || <Text color={colors.muted}>my-feature</Text>}</Text>
            )}
          </Box>
        </Box>
      </Box>

      {/* Repository Path */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={fieldBorderColor("repo")}
        paddingX={2}
        marginBottom={1}
      >
        <Box>
          <Box width={16}>
            <Text color={activeField === "repo" ? colors.textBright : colors.muted} backgroundColor={activeField === "repo" ? colors.primary : undefined} bold={activeField === "repo"}>
              Repository:
            </Text>
          </Box>
          <Box flexDirection="column">
            {activeField === "repo" ? (
              <TextInput
                value={repo}
                onChange={setRepo}
                placeholder={effectiveRepo || "/path/to/repo"}
              />
            ) : (
              <Text>
                {repo || (
                  <Text color={colors.muted}>{effectiveRepo || "/path/to/repo"}</Text>
                )}
              </Text>
            )}
          </Box>
        </Box>
        {effectiveRepo && !repo && (
          <Text color={colors.muted} dimColor>
            default: {effectiveRepo}
          </Text>
        )}
      </Box>

      {/* Host picker */}
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={fieldBorderColor("host")}
        paddingX={2}
        marginBottom={1}
      >
        <Box>
          <Box width={16}>
            <Text color={activeField === "host" ? colors.textBright : colors.muted} backgroundColor={activeField === "host" ? colors.primary : undefined} bold={activeField === "host"}>
              Host:
            </Text>
          </Box>
          <Box>
            <Text color={host ? colors.success : colors.muted}>{host || "(local)"}</Text>
          </Box>
        </Box>
        {activeField === "host" && (
          <Box flexDirection="column" marginTop={1}>
            {["", ...hostNames].map((h, idx) => (
              <Box key={h || "__local__"}>
                <Text
                  color={idx === hostSelectedIdx ? colors.textBright : colors.muted}
                  backgroundColor={idx === hostSelectedIdx ? colors.primary : undefined}
                  bold={idx === hostSelectedIdx}
                >
                  {idx === hostSelectedIdx ? "› " : "  "}
                  {h || "(local)"}
                </Text>
              </Box>
            ))}
            <Text color={colors.muted} dimColor>↑↓ navigate · Enter select & create</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} paddingX={1}>
        <Text color={colors.muted}>
          [Tab] next field · [Shift+Tab] prev · [Enter] on last field to create · [Esc] cancel
        </Text>
      </Box>
    </Box>
  );
}
