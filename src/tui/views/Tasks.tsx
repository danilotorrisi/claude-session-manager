import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import type { AppState, AppAction } from "../types";
import { nextTab } from "../types";
import type { LinearIssue } from "../../types";
import type { PaginationState } from "../hooks/useLinearTasks";
import { colors } from "../theme";
import {
  fetchWorkflowStates,
  updateIssueState,
  fetchTeams,
  fetchLabels,
  createIssue,
  type WorkflowState,
  type LinearTeam,
  type LinearLabel,
} from "../../lib/linear";
import { loadConfig } from "../../lib/config";

interface TasksProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onRefresh: () => Promise<void>;
  onLoadMore: () => Promise<void>;
  paginationRef: React.RefObject<PaginationState>;
}

const stateTypeOrder: Record<string, number> = {
  started: 0,
  unstarted: 1,
  backlog: 2,
  completed: 3,
  canceled: 4,
};

const allFilters = ["All", "In Progress", "Todo", "Backlog", "Done", "Canceled"];

interface GroupedIssues {
  label: string;
  issues: LinearIssue[];
}

function groupByState(issues: LinearIssue[]): GroupedIssues[] {
  const groups = new Map<string, LinearIssue[]>();
  for (const issue of issues) {
    const state = issue.state || "Unknown";
    const group = groups.get(state) || [];
    group.push(issue);
    groups.set(state, group);
  }

  const sorted = Array.from(groups.entries()).sort(([, aIssues], [, bIssues]) => {
    const aType = aIssues[0]?.stateType || "backlog";
    const bType = bIssues[0]?.stateType || "backlog";
    return (stateTypeOrder[aType] ?? 99) - (stateTypeOrder[bType] ?? 99);
  });

  return sorted.map(([label, issues]) => ({ label, issues }));
}

function filterIssues(issues: LinearIssue[], filter: string): LinearIssue[] {
  if (filter === "All") return issues;
  const filterToStateType: Record<string, string> = {
    "In Progress": "started",
    Todo: "unstarted",
    Backlog: "backlog",
    Done: "completed",
    Canceled: "canceled",
  };
  const stateType = filterToStateType[filter];
  if (!stateType) return issues;
  return issues.filter((i) => i.stateType === stateType);
}

function priorityLabel(priority?: number): string {
  if (priority === undefined || priority === 0) return "";
  if (priority === 1) return "!!!!";
  if (priority === 2) return "!!!";
  if (priority === 3) return "!!";
  if (priority === 4) return "!";
  return "";
}

function priorityColor(priority?: number): string {
  if (priority === 1) return colors.danger;
  if (priority === 2) return colors.warning;
  if (priority === 3) return colors.text;
  return colors.muted;
}

// Build a flat list of navigable items (issues + optional load-more)
interface FlatItem {
  type: "issue" | "load-more";
  issue?: LinearIssue;
  groupLabel?: string;
}

export function Tasks({ state, dispatch, onRefresh, onLoadMore, paginationRef }: TasksProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [filterIndex, setFilterIndex] = useState(0);
  const [searchMode, setSearchMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [stateSelectMode, setStateSelectMode] = useState(false);
  const [stateSelectIssue, setStateSelectIssue] = useState<LinearIssue | undefined>();
  const [workflowStates, setWorkflowStates] = useState<WorkflowState[]>([]);
  const [stateSelectIndex, setStateSelectIndex] = useState(0);
  const [stateSelectLoading, setStateSelectLoading] = useState(false);
  const [stateSelectError, setStateSelectError] = useState<string | null>(null);

  // Create mode state
  type CreateField = "title" | "description" | "priority" | "labels" | "status";
  const createFieldOrder: CreateField[] = ["title", "description", "priority", "labels", "status"];
  const [createMode, setCreateMode] = useState(false);
  const [createField, setCreateField] = useState<CreateField>("title");
  const [createTitle, setCreateTitle] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createPriority, setCreatePriority] = useState(0);
  const [createTeams, setCreateTeams] = useState<LinearTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<LinearTeam | null>(null);
  const [createLabels, setCreateLabels] = useState<LinearLabel[]>([]);
  const [selectedLabels, setSelectedLabels] = useState<Set<string>>(new Set());
  const [createStates, setCreateStates] = useState<WorkflowState[]>([]);
  const [selectedState, setSelectedState] = useState<WorkflowState | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const [labelCursor, setLabelCursor] = useState(0);
  const [stateCursor, setStateCursor] = useState(0);

  const priorityOptions = [
    { value: 0, label: "None" },
    { value: 1, label: "Urgent" },
    { value: 2, label: "High" },
    { value: 3, label: "Medium" },
    { value: 4, label: "Low" },
  ];

  const openCreateModal = async () => {
    setCreateMode(true);
    setCreateField("title");
    setCreateTitle("");
    setCreateDescription("");
    setCreatePriority(0);
    setCreateLabels([]);
    setSelectedLabels(new Set());
    setCreateStates([]);
    setSelectedState(null);
    setCreateError(null);
    setCreateSubmitting(false);
    setCreateLoading(true);
    setLabelCursor(0);
    setStateCursor(0);

    try {
      const config = await loadConfig();
      if (!config.linearApiKey) {
        setCreateError("No Linear API key configured");
        setCreateLoading(false);
        return;
      }
      const teams = await fetchTeams(config.linearApiKey);
      setCreateTeams(teams);
      if (teams.length > 0) {
        const team = teams[0];
        setSelectedTeam(team);
        const [labels, states] = await Promise.all([
          fetchLabels(config.linearApiKey, team.id),
          fetchWorkflowStates(config.linearApiKey, team.id),
        ]);
        setCreateLabels(labels);
        setCreateStates(states);
        // Default to first "unstarted" state
        const defaultState = states.find((s) => s.type === "unstarted") || states[0];
        if (defaultState) setSelectedState(defaultState);
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setCreateLoading(false);
    }
  };

  const submitCreateIssue = async () => {
    if (!createTitle.trim()) {
      setCreateError("Title is required");
      return;
    }
    if (!selectedTeam) {
      setCreateError("No team available");
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const config = await loadConfig();
      if (!config.linearApiKey) {
        setCreateError("No Linear API key configured");
        return;
      }
      const result = await createIssue(config.linearApiKey, {
        title: createTitle.trim(),
        description: createDescription.trim() || undefined,
        teamId: selectedTeam.id,
        priority: createPriority,
        stateId: selectedState?.id,
        labelIds: selectedLabels.size > 0 ? Array.from(selectedLabels) : undefined,
      });
      dispatch({ type: "SET_MESSAGE", message: `Created ${result.identifier}` });
      onRefresh();
      setCreateMode(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create issue");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const filter = allFilters[filterIndex];
  const statusFiltered = useMemo(() => filterIssues(state.tasks, filter), [state.tasks, filter]);
  const filtered = useMemo(() => {
    if (!searchTerm) return statusFiltered;
    const term = searchTerm.toLowerCase();
    return statusFiltered.filter(
      (i) =>
        i.identifier.toLowerCase().includes(term) ||
        i.title.toLowerCase().includes(term) ||
        (i.description && i.description.toLowerCase().includes(term))
    );
  }, [statusFiltered, searchTerm]);
  const groups = useMemo(() => groupByState(filtered), [filtered]);
  const hasNextPage = paginationRef.current?.hasNextPage ?? false;

  // Build flat navigable list
  const flatItems = useMemo(() => {
    const items: FlatItem[] = [];
    for (const group of groups) {
      for (const issue of group.issues) {
        items.push({ type: "issue", issue, groupLabel: group.label });
      }
    }
    if (hasNextPage) {
      items.push({ type: "load-more" });
    }
    return items;
  }, [groups, hasNextPage]);

  const currentItem = flatItems[selectedIndex];
  const currentIssue = currentItem?.type === "issue" ? currentItem.issue : undefined;
  const isOnLoadMore = currentItem?.type === "load-more";

  // Create modal input — navigation and field controls
  useInput((input, key) => {
    if (key.escape) {
      setCreateMode(false);
      return;
    }

    // Ctrl+S to submit from any field
    if (input === "s" && key.ctrl) {
      submitCreateIssue();
      return;
    }

    // Tab / Shift+Tab to navigate fields
    if (key.tab) {
      const idx = createFieldOrder.indexOf(createField);
      if (key.shift) {
        setCreateField(createFieldOrder[Math.max(0, idx - 1)]);
      } else {
        setCreateField(createFieldOrder[Math.min(createFieldOrder.length - 1, idx + 1)]);
      }
      return;
    }

    // Field-specific controls
    if (createField === "priority") {
      if (key.leftArrow) {
        setCreatePriority((p) => (p <= 0 ? 4 : p - 1));
      } else if (key.rightArrow) {
        setCreatePriority((p) => (p >= 4 ? 0 : p + 1));
      }
    } else if (createField === "labels") {
      if (key.upArrow) {
        setLabelCursor((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setLabelCursor((i) => Math.min(createLabels.length - 1, i + 1));
      } else if (input === " " && createLabels.length > 0) {
        const label = createLabels[labelCursor];
        if (label) {
          setSelectedLabels((prev) => {
            const next = new Set(prev);
            if (next.has(label.id)) {
              next.delete(label.id);
            } else {
              next.add(label.id);
            }
            return next;
          });
        }
      }
    } else if (createField === "status") {
      if (key.upArrow) {
        setStateCursor((i) => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setStateCursor((i) => Math.min(createStates.length - 1, i + 1));
      } else if (key.return && createStates.length > 0) {
        setSelectedState(createStates[stateCursor]);
      }
    }

    // Enter on last field submits
    if (key.return && createField === "status") {
      if (createStates.length > 0) {
        setSelectedState(createStates[stateCursor]);
      }
      submitCreateIssue();
    }
  }, { isActive: createMode && !createSubmitting && !createLoading && createField !== "title" && createField !== "description" });

  // Create modal text input — for title and description fields
  // (TextInput handles its own input, we only handle Esc/Tab/Ctrl+S here)
  useInput((input, key) => {
    if (key.escape) {
      setCreateMode(false);
      return;
    }
    if (input === "s" && key.ctrl) {
      submitCreateIssue();
      return;
    }
    if (key.tab) {
      const idx = createFieldOrder.indexOf(createField);
      if (key.shift) {
        setCreateField(createFieldOrder[Math.max(0, idx - 1)]);
      } else {
        setCreateField(createFieldOrder[Math.min(createFieldOrder.length - 1, idx + 1)]);
      }
    }
  }, { isActive: createMode && !createSubmitting && !createLoading && (createField === "title" || createField === "description") });

  // State selector input — active when state select modal is open
  useInput((_input, key) => {
    if (key.escape) {
      setStateSelectMode(false);
      setStateSelectIssue(undefined);
      setWorkflowStates([]);
      setStateSelectError(null);
    } else if (key.upArrow) {
      setStateSelectIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setStateSelectIndex((i) => Math.min(workflowStates.length - 1, i + 1));
    } else if (key.return && workflowStates.length > 0 && stateSelectIssue) {
      const selected = workflowStates[stateSelectIndex];
      if (selected && selected.id !== stateSelectIssue.stateId) {
        (async () => {
          try {
            const config = await loadConfig();
            if (!config.linearApiKey) return;
            const success = await updateIssueState(config.linearApiKey, stateSelectIssue.id, selected.id);
            if (success) {
              dispatch({ type: "SET_MESSAGE", message: `Updated ${stateSelectIssue.identifier} → ${selected.name}` });
              onRefresh();
            } else {
              dispatch({ type: "SET_MESSAGE", message: `Failed to update ${stateSelectIssue.identifier}` });
            }
          } catch {
            dispatch({ type: "SET_MESSAGE", message: `Error updating ${stateSelectIssue.identifier}` });
          }
        })();
      }
      setStateSelectMode(false);
      setStateSelectIssue(undefined);
      setWorkflowStates([]);
      setStateSelectError(null);
    }
  }, { isActive: stateSelectMode && !stateSelectLoading && !createMode });

  // Detail modal input — only active when modal is open
  useInput((input, key) => {
    if (key.escape || input === " " || input === "q") {
      setShowPreview(false);
    } else if (input === "o" && currentIssue) {
      Bun.spawn(["open", currentIssue.url]);
    }
  }, { isActive: showPreview && !searchMode && !stateSelectMode && !createMode });

  // Search mode input — Esc to cancel, Enter to confirm
  useInput((_input, key) => {
    if (key.escape) {
      setSearchTerm("");
      setSearchMode(false);
      setSelectedIndex(0);
    } else if (key.return) {
      setSearchMode(false);
      setSelectedIndex(0);
    }
  }, { isActive: searchMode && !createMode });

  // List input — only active when modal and search are closed
  useInput((input, key) => {
    if (input === "q") {
      exit();
    } else if (key.tab) {
      dispatch({ type: "SET_TAB", tab: nextTab(state.activeTab) });
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(flatItems.length - 1, i + 1));
    } else if (input === " " || key.return) {
      if (currentIssue) {
        setShowPreview(true);
      } else if (isOnLoadMore) {
        onLoadMore();
      }
    } else if (input === "f") {
      setFilterIndex((i) => (i + 1) % allFilters.length);
      setSelectedIndex(0);
    } else if (input === "/") {
      setSearchMode(true);
    } else if (key.escape && searchTerm) {
      setSearchTerm("");
      setSelectedIndex(0);
    } else if (input === "s") {
      if (currentIssue && currentIssue.teamId) {
        setStateSelectIssue(currentIssue);
        setStateSelectMode(true);
        setStateSelectLoading(true);
        setStateSelectError(null);
        setWorkflowStates([]);
        (async () => {
          try {
            const config = await loadConfig();
            if (!config.linearApiKey) {
              setStateSelectError("No Linear API key configured");
              return;
            }
            const states = await fetchWorkflowStates(config.linearApiKey, currentIssue.teamId!);
            setWorkflowStates(states);
            const currentIdx = states.findIndex((s) => s.id === currentIssue.stateId);
            setStateSelectIndex(currentIdx >= 0 ? currentIdx : 0);
          } catch (err) {
            setStateSelectError(err instanceof Error ? err.message : "Failed to load workflow states");
          } finally {
            setStateSelectLoading(false);
          }
        })();
      }
    } else if (input === "c") {
      if (currentIssue) {
        dispatch({ type: "SET_PREFILL_ISSUE", issue: currentIssue });
        dispatch({ type: "SET_VIEW", view: "create" });
      }
    } else if (input === "o") {
      if (currentIssue) {
        Bun.spawn(["open", currentIssue.url]);
      }
    } else if (input === "r") {
      onRefresh();
    } else if (input === "n") {
      openCreateModal();
    }
  }, { isActive: !showPreview && !searchMode && !stateSelectMode && !createMode });

  // Clamp selectedIndex if list shrunk
  if (selectedIndex >= flatItems.length && flatItems.length > 0) {
    setSelectedIndex(flatItems.length - 1);
  }

  // Check for no API key
  const hasApiKey = state.tasks.length > 0 || filtered.length > 0;

  if (state.tasks.length === 0 && filtered.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box paddingX={1}>
          <Text color={colors.muted}>
            {!hasApiKey
              ? "No Linear API key configured. Add linearApiKey to ~/.config/csm/config.json"
              : "No tasks found."}
          </Text>
        </Box>
      </Box>
    );
  }

  if (filtered.length === 0) {
    const noMatchMsg = searchTerm
      ? `No tasks matching "${searchTerm}"${filter !== "All" ? ` in ${filter}` : ""}. Press [Esc] to clear search.`
      : `No tasks matching filter "${filter}". Press [f] to change filter.`;
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box paddingX={1} marginBottom={1}>
          <Text color={colors.muted}>Filter: </Text>
          <Text color={colors.textBright} bold>{filter}</Text>
          <Text color={colors.muted}> ▾</Text>
          {searchTerm && !searchMode && (
            <>
              <Text color={colors.muted}>  Search: </Text>
              <Text color={colors.textBright} bold>{searchTerm}</Text>
            </>
          )}
        </Box>
        {searchMode && (
          <Box paddingX={1} marginBottom={1}>
            <Text color={colors.primary} bold>{"/ "}</Text>
            <TextInput
              value={searchTerm}
              onChange={(val) => { setSearchTerm(val); setSelectedIndex(0); }}
              placeholder="Search tasks..."
            />
          </Box>
        )}
        <Box paddingX={1}>
          <Text color={colors.muted}>{noMatchMsg}</Text>
        </Box>
      </Box>
    );
  }

  // Create task modal
  if (createMode) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1} paddingX={1}>
          <Text backgroundColor={colors.accent} color={colors.textBright} bold>
            {" ◆ New Task "}
          </Text>
        </Box>

        {createLoading ? (
          <Box paddingX={2}>
            <Text color={colors.muted}>Loading teams and labels...</Text>
          </Box>
        ) : createError && !createTitle ? (
          <Box paddingX={2}>
            <Text color={colors.danger}>{createError}</Text>
            <Text color={colors.muted}>  Press [Esc] to close</Text>
          </Box>
        ) : (
          <Box flexDirection="column" marginX={1} gap={0}>
            {/* Title */}
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor={createField === "title" ? colors.primary : colors.cardBorder}
              paddingX={2}
              paddingY={0}
            >
              <Text color={createField === "title" ? colors.textBright : colors.muted} bold>
                Title {!createTitle.trim() && createField !== "title" ? "(required)" : ""}
              </Text>
              {createField === "title" ? (
                <TextInput
                  value={createTitle}
                  onChange={setCreateTitle}
                  placeholder="Issue title..."
                />
              ) : (
                <Text color={createTitle ? colors.text : colors.muted}>
                  {createTitle || "—"}
                </Text>
              )}
            </Box>

            {/* Description */}
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor={createField === "description" ? colors.primary : colors.cardBorder}
              paddingX={2}
              paddingY={0}
            >
              <Text color={createField === "description" ? colors.textBright : colors.muted} bold>
                Description
              </Text>
              {createField === "description" ? (
                <TextInput
                  value={createDescription}
                  onChange={setCreateDescription}
                  placeholder="Optional description..."
                />
              ) : (
                <Text color={createDescription ? colors.text : colors.muted}>
                  {createDescription || "—"}
                </Text>
              )}
            </Box>

            {/* Priority */}
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor={createField === "priority" ? colors.primary : colors.cardBorder}
              paddingX={2}
              paddingY={0}
            >
              <Text color={createField === "priority" ? colors.textBright : colors.muted} bold>
                Priority {createField === "priority" ? "(←→ to change)" : ""}
              </Text>
              <Box>
                {priorityOptions.map((opt) => (
                  <Text
                    key={opt.value}
                    color={createPriority === opt.value ? colors.textBright : colors.muted}
                    bold={createPriority === opt.value}
                  >
                    {createPriority === opt.value ? ` [${opt.label}] ` : `  ${opt.label}  `}
                  </Text>
                ))}
              </Box>
            </Box>

            {/* Labels */}
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor={createField === "labels" ? colors.primary : colors.cardBorder}
              paddingX={2}
              paddingY={0}
            >
              <Text color={createField === "labels" ? colors.textBright : colors.muted} bold>
                Labels {createField === "labels" ? "(↑↓ navigate, Space toggle)" : ""}
              </Text>
              {createLabels.length === 0 ? (
                <Text color={colors.muted}>No labels available</Text>
              ) : createField === "labels" ? (
                <Box flexDirection="column">
                  {createLabels.map((label, idx) => {
                    const checked = selectedLabels.has(label.id);
                    const isCursor = idx === labelCursor;
                    return (
                      <Text
                        key={label.id}
                        color={isCursor ? colors.textBright : colors.text}
                        backgroundColor={isCursor ? colors.primary : undefined}
                        bold={isCursor}
                      >
                        {isCursor ? " › " : "   "}
                        {checked ? "☑ " : "☐ "}
                        {label.name}
                      </Text>
                    );
                  })}
                </Box>
              ) : (
                <Text color={selectedLabels.size > 0 ? colors.text : colors.muted}>
                  {selectedLabels.size > 0
                    ? createLabels
                        .filter((l) => selectedLabels.has(l.id))
                        .map((l) => l.name)
                        .join(", ")
                    : "—"}
                </Text>
              )}
            </Box>

            {/* Status */}
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor={createField === "status" ? colors.primary : colors.cardBorder}
              paddingX={2}
              paddingY={0}
            >
              <Text color={createField === "status" ? colors.textBright : colors.muted} bold>
                Status {createField === "status" ? "(↑↓ navigate, Enter select+submit)" : ""}
              </Text>
              {createStates.length === 0 ? (
                <Text color={colors.muted}>No states available</Text>
              ) : createField === "status" ? (
                <Box flexDirection="column">
                  {createStates.map((ws, idx) => {
                    const isActive = ws.id === selectedState?.id;
                    const isCursor = idx === stateCursor;
                    return (
                      <Text
                        key={ws.id}
                        color={isCursor ? colors.textBright : colors.text}
                        backgroundColor={isCursor ? colors.primary : undefined}
                        bold={isCursor}
                      >
                        {isCursor ? " › " : "   "}
                        {isActive ? "● " : "○ "}
                        {ws.name}
                      </Text>
                    );
                  })}
                </Box>
              ) : (
                <Text color={selectedState ? colors.text : colors.muted}>
                  {selectedState?.name || "—"}
                </Text>
              )}
            </Box>

            {createError && (
              <Box paddingX={1} marginTop={0}>
                <Text color={colors.danger}>{createError}</Text>
              </Box>
            )}

            {createSubmitting && (
              <Box paddingX={1} marginTop={0}>
                <Text color={colors.muted}>Creating issue...</Text>
              </Box>
            )}
          </Box>
        )}

        <Box marginTop={1} paddingX={1}>
          <Text color={colors.muted}>
            [Tab] next · [Shift+Tab] prev · [Ctrl+S] submit · [Esc] cancel
          </Text>
        </Box>
      </Box>
    );
  }

  // State selector modal
  if (stateSelectMode && stateSelectIssue) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1} paddingX={1}>
          <Text backgroundColor={colors.accent} color={colors.textBright} bold>
            {" ◆ Change State: " + stateSelectIssue.identifier + " "}
          </Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.cardBorder}
          paddingX={2}
          paddingY={1}
          marginX={1}
        >
          {stateSelectLoading ? (
            <Text color={colors.muted}>Loading states...</Text>
          ) : stateSelectError ? (
            <Text color={colors.danger}>{stateSelectError}</Text>
          ) : workflowStates.length === 0 ? (
            <Text color={colors.muted}>No states available</Text>
          ) : (
            workflowStates.map((ws, idx) => {
              const isCurrent = ws.id === stateSelectIssue.stateId;
              const isSelected = idx === stateSelectIndex;
              return (
                <Box key={ws.id} paddingX={1}>
                  <Text
                    color={isSelected ? colors.textBright : isCurrent ? colors.primary : colors.text}
                    backgroundColor={isSelected ? colors.primary : undefined}
                    bold={isSelected}
                  >
                    {isSelected ? " › " : "   "}
                    {isCurrent ? "● " : "○ "}
                    {ws.name}
                    {isCurrent ? "  ← current" : ""}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text color={colors.muted}>
            [↑↓] navigate · [Enter] confirm · [Esc] cancel
          </Text>
        </Box>
      </Box>
    );
  }

  // Full-screen detail modal
  if (showPreview && currentIssue) {
    const pLabel = priorityLabel(currentIssue.priority);
    const priorityNames: Record<number, string> = {
      0: "No priority",
      1: "Urgent",
      2: "High",
      3: "Medium",
      4: "Low",
    };
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box marginBottom={1} paddingX={1}>
          <Text backgroundColor={colors.accent} color={colors.textBright} bold>
            {" ◆ Task Detail "}
          </Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.cardBorder}
          paddingX={2}
          paddingY={1}
          marginX={1}
        >
          <Box marginBottom={1}>
            <Text color={colors.muted} bold>{currentIssue.identifier}</Text>
            <Text color={colors.textBright} bold>{"  " + currentIssue.title}</Text>
          </Box>

          <Box marginBottom={1}>
            <Box marginRight={3}>
              <Text color={colors.muted}>Status: </Text>
              <Text color={colors.text}>{currentIssue.state || "Unknown"}</Text>
            </Box>
            <Box marginRight={3}>
              <Text color={colors.muted}>Priority: </Text>
              <Text color={priorityColor(currentIssue.priority)}>
                {priorityNames[currentIssue.priority ?? 0] || "None"}
                {pLabel ? ` ${pLabel}` : ""}
              </Text>
            </Box>
          </Box>

          <Box marginBottom={1}>
            <Text color={colors.muted}>URL: </Text>
            <Text color={colors.text}>{currentIssue.url}</Text>
          </Box>

          <Box flexDirection="column">
            <Text color={colors.muted} bold>Description</Text>
            {currentIssue.description ? (
              <Text color={colors.text} wrap="wrap">
                {currentIssue.description}
              </Text>
            ) : (
              <Text color={colors.muted} dimColor>No description</Text>
            )}
          </Box>
        </Box>

        <Box marginTop={1} paddingX={1}>
          <Text color={colors.muted}>
            [o] open in browser · [Space] or [Esc] close · [q] quit
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Box paddingX={1} marginBottom={1}>
        <Text color={colors.muted}>Filter: </Text>
        <Text color={colors.textBright} bold>{filter}</Text>
        <Text color={colors.muted}> ▾</Text>
        {searchTerm && !searchMode && (
          <>
            <Text color={colors.muted}>  Search: </Text>
            <Text color={colors.textBright} bold>{searchTerm}</Text>
            <Text color={colors.muted} dimColor>  [Esc] clear</Text>
          </>
        )}
      </Box>

      {searchMode && (
        <Box paddingX={1} marginBottom={1}>
          <Text color={colors.primary} bold>{"/ "}</Text>
          <TextInput
            value={searchTerm}
            onChange={(val) => { setSearchTerm(val); setSelectedIndex(0); }}
            placeholder="Search tasks..."
          />
        </Box>
      )}

      <Box flexDirection="column">
        {groups.map((group) => (
          <Box key={group.label} flexDirection="column">
            <Box paddingX={1}>
              <Text color={colors.muted} bold>
                ▸ {group.label} ({group.issues.length})
              </Text>
            </Box>
            {group.issues.map((issue) => {
              const idx = flatItems.findIndex(
                (fi) => fi.type === "issue" && fi.issue?.id === issue.id
              );
              const isSelected = idx === selectedIndex;
              const pLabel = priorityLabel(issue.priority);
              return (
                <Box key={issue.id} paddingX={1}>
                  <Text
                    color={isSelected ? colors.textBright : colors.text}
                    backgroundColor={isSelected ? colors.primary : undefined}
                    bold={isSelected}
                  >
                    {isSelected ? "  › " : "    "}
                  </Text>
                  <Text
                    color={isSelected ? colors.textBright : colors.muted}
                    backgroundColor={isSelected ? colors.primary : undefined}
                  >
                    {issue.identifier}
                  </Text>
                  <Text
                    color={isSelected ? colors.textBright : colors.text}
                    backgroundColor={isSelected ? colors.primary : undefined}
                  >
                    {"  " + issue.title}
                  </Text>
                  {pLabel && (
                    <Text color={priorityColor(issue.priority)}>
                      {"  " + pLabel}
                    </Text>
                  )}
                </Box>
              );
            })}
          </Box>
        ))}

        {hasNextPage && (
          <Box paddingX={1} marginTop={1}>
            <Text
              color={isOnLoadMore ? colors.textBright : colors.muted}
              backgroundColor={isOnLoadMore ? colors.primary : undefined}
              bold={isOnLoadMore}
            >
              {isOnLoadMore ? "  › " : "    "}Load more...
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
}
