import React, { useState, useCallback } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import Spinner from "ink-spinner";
import type { AppState, AppAction } from "../types";
import { sessionExists, createSession } from "../../lib/tmux";
import {
  createWorktree,
  getWorktreePath,
  isWorktreeConflictError,
  cleanupStaleWorktree,
} from "../../lib/worktree";
import { getDefaultRepo } from "../../lib/config";

interface CreateSessionProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onRefresh: () => Promise<void>;
}

type Field = "name" | "repo" | "host";
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

  // Load default repo on mount
  React.useEffect(() => {
    getDefaultRepo().then((r) => setDefaultRepo(r || null));
  }, []);

  const validateName = (value: string): string | null => {
    if (!value.trim()) return "Session name is required";
    if (!/^[a-zA-Z0-9_-]+$/.test(value)) {
      return "Only alphanumeric, hyphens, and underscores allowed";
    }
    return null;
  };

  const doCreate = useCallback(async (repoPath: string, hostName?: string) => {
    // Create worktree
    const worktreeResult = await createWorktree(name, repoPath, hostName);

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
    const sessionResult = await createSession(name, worktreePath, hostName);
    if (!sessionResult.success) {
      throw new Error(sessionResult.stderr || "Failed to create session");
    }

    dispatch({ type: "SET_MESSAGE", message: `Session "${name}" created successfully` });
    dispatch({ type: "SET_VIEW", view: "dashboard" });
    await onRefresh();
  }, [name, dispatch, onRefresh]);

  const handleCreate = useCallback(async () => {
    // Validate
    const nameError = validateName(name);
    if (nameError) {
      setError(nameError);
      return;
    }

    const repoPath = repo.trim() || defaultRepo;
    if (!repoPath) {
      setError("Repository path is required (no default configured)");
      return;
    }

    // Check if session already exists
    const hostName = host.trim() || undefined;
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
  }, [name, repo, host, defaultRepo, doCreate]);

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
    } else if (key.return && activeField === "host") {
      handleCreate();
    } else if (key.tab || (key.return && activeField !== "host")) {
      // Move to next field
      if (activeField === "name") setActiveField("repo");
      else if (activeField === "repo") setActiveField("host");
    } else if (key.shift && key.tab) {
      // Move to previous field
      if (activeField === "host") setActiveField("repo");
      else if (activeField === "repo") setActiveField("name");
    }
  });

  if (status === "creating") {
    return (
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Box>
          <Text color="cyan">
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
          <Text color="cyan">
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
          <Text bold color="yellow">
            ⚠ Stale Worktree Detected
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text>
            A worktree for "{name}" already exists but may be stale.
          </Text>
        </Box>
        <Box marginBottom={1}>
          <Text color="gray">
            This can happen if a previous session wasn't cleaned up properly.
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text>Clean up and retry? </Text>
          <Text color="green">[y]</Text>
          <Text> / </Text>
          <Text color="red">[n]</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Create New Session
        </Text>
      </Box>

      {error && (
        <Box marginBottom={1}>
          <Text color="red">✗ {error}</Text>
        </Box>
      )}

      {/* Session Name */}
      <Box marginBottom={1}>
        <Box width={16}>
          <Text color={activeField === "name" ? "cyan" : "gray"}>Session Name:</Text>
        </Box>
        <Box>
          {activeField === "name" ? (
            <TextInput
              value={name}
              onChange={setName}
              placeholder="my-feature"
            />
          ) : (
            <Text>{name || <Text color="gray">my-feature</Text>}</Text>
          )}
        </Box>
      </Box>

      {/* Repository Path */}
      <Box marginBottom={1}>
        <Box width={16}>
          <Text color={activeField === "repo" ? "cyan" : "gray"}>Repository:</Text>
        </Box>
        <Box flexDirection="column">
          {activeField === "repo" ? (
            <TextInput
              value={repo}
              onChange={setRepo}
              placeholder={defaultRepo || "/path/to/repo"}
            />
          ) : (
            <Text>
              {repo || (
                <Text color="gray">{defaultRepo || "/path/to/repo"}</Text>
              )}
            </Text>
          )}
          {defaultRepo && !repo && (
            <Text color="gray" dimColor>
              (default: {defaultRepo})
            </Text>
          )}
        </Box>
      </Box>

      {/* Host (optional) */}
      <Box marginBottom={1}>
        <Box width={16}>
          <Text color={activeField === "host" ? "cyan" : "gray"}>Host:</Text>
        </Box>
        <Box>
          {activeField === "host" ? (
            <TextInput
              value={host}
              onChange={setHost}
              placeholder="(local)"
            />
          ) : (
            <Text>{host || <Text color="gray">(local)</Text>}</Text>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text color="gray">
          Press [Tab] to move between fields, [Enter] on Host to create
        </Text>
      </Box>
    </Box>
  );
}
