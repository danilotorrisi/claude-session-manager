import React, { useState } from "react";
import { Box, Text, useInput, useApp } from "ink";
import type { AppState, AppAction, WorkerDisplayInfo } from "../types";
import { nextTab } from "../types";
import { colors } from "../theme";

interface HostsProps {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  onRefresh: () => Promise<void>;
  masterReachable: boolean | null;
}

function formatHeartbeatAge(lastHeartbeat: string): string {
  if (!lastHeartbeat) return "never";
  const age = Date.now() - new Date(lastHeartbeat).getTime();
  if (age < 0) return "just now";
  const seconds = Math.floor(age / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

function getStatusDisplay(worker: WorkerDisplayInfo) {
  switch (worker.status) {
    case "online":
      return { label: "Online", color: colors.success, dot: "\u25CF" };
    case "stale":
      return { label: `Stale (${formatHeartbeatAge(worker.lastHeartbeat)})`, color: colors.warning, dot: "\u25CB" };
    case "offline":
      return { label: "Offline", color: colors.danger, dot: "\u25CF" };
  }
}

export function Hosts({ state, dispatch, onRefresh, masterReachable }: HostsProps) {
  const { exit } = useApp();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const workers = state.workers;
  const hasLocalWorker = workers.some((w) => w.isLocal);

  useInput((input, key) => {
    if (input === "q") {
      exit();
    } else if (key.tab) {
      dispatch({ type: "SET_TAB", tab: nextTab(state.activeTab) });
    } else if (input === "r") {
      onRefresh();
      dispatch({ type: "SET_MESSAGE", message: "Refreshing workers..." });
    } else if (key.upArrow) {
      setSelectedIndex((i) => Math.max(0, i - 1));
    } else if (key.downArrow) {
      setSelectedIndex((i) => Math.min(workers.length - 1, i + 1));
    } else if (key.escape) {
      dispatch({ type: "CLEAR_MESSAGE" });
    }
  });

  // Master unreachable
  if (masterReachable === false) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box paddingX={1} marginBottom={1}>
          <Text color={colors.warning}>
            No master server reachable. Start one with: csm server
          </Text>
        </Box>
        <Box paddingX={1}>
          <Text color={colors.muted}>
            The Hosts tab shows workers registered with the master API.
          </Text>
        </Box>
        <Box paddingX={1}>
          <Text color={colors.muted}>
            Master URL: {process.env.CSM_MASTER_URL || `http://localhost:${process.env.CSM_API_PORT || "3000"}`}
          </Text>
        </Box>
      </Box>
    );
  }

  // Loading (first fetch not done yet)
  if (masterReachable === null) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box paddingX={1}>
          <Text color={colors.muted}>Connecting to master...</Text>
        </Box>
      </Box>
    );
  }

  // No workers registered
  if (workers.length === 0) {
    return (
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Box paddingX={1} marginBottom={1}>
          <Text color={colors.muted}>
            No workers registered. Start a worker with: csm worker start
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      {!hasLocalWorker && (
        <Box paddingX={1} marginBottom={1}>
          <Text color={colors.warning}>
            No worker running on this machine. Run `csm worker start` to register.
          </Text>
        </Box>
      )}

      <Box flexDirection="column">
        {workers.map((worker, idx) => {
          const isSelected = idx === selectedIndex;
          const status = getStatusDisplay(worker);
          const hi = worker.hostInfo;

          return (
            <Box key={worker.id} flexDirection="column" marginBottom={1}>
              {/* Line 1: name, local badge, status */}
              <Box paddingX={1}>
                <Text
                  color={isSelected ? colors.textBright : colors.text}
                  backgroundColor={isSelected ? colors.primary : undefined}
                  bold={isSelected}
                >
                  {isSelected ? "\u203A " : "  "}
                  {worker.id}
                </Text>
                {worker.isLocal && (
                  <Text color={colors.muted} dimColor>  (local)</Text>
                )}
                <Text>  </Text>
                <Text color={status.color}>{status.dot} {status.label}</Text>
              </Box>

              {/* Line 2: host info */}
              <Box paddingX={1}>
                <Text color={colors.muted}>
                  {"    "}
                  {hi
                    ? [hi.os, hi.arch, hi.uptime, hi.ramUsage ? `RAM ${hi.ramUsage}` : null]
                        .filter(Boolean)
                        .join(" \u00B7 ")
                    : "No host info"}
                </Text>
              </Box>

              {/* Line 3: sessions + heartbeat */}
              <Box paddingX={1}>
                <Text color={colors.muted}>
                  {"    "}
                  Sessions: {worker.sessionCount}
                  {" \u00B7 "}
                  Last heartbeat: {formatHeartbeatAge(worker.lastHeartbeat)}
                </Text>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
