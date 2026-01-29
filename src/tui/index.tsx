import React from "react";
import { render } from "ink";
import { App } from "./App";
import { getWorktreePath } from "../lib/worktree";
import { realpathSync } from "fs";

let instance: ReturnType<typeof render> | null = null;

export function startTui() {
  instance = render(<App />);
}

export async function exitTuiAndAttach(command: string, args: string[]): Promise<void> {
  // Unmount Ink and wait for cleanup
  if (instance) {
    instance.unmount();
    instance = null;
    // Wait for terminal to restore
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Clear screen
  process.stdout.write("\x1B[2J\x1B[H");

  // Use spawnSync for proper terminal handling
  const { spawnSync } = await import("child_process");
  spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  // After detaching from tmux, restart the TUI
  // Clear screen again before restarting
  process.stdout.write("\x1B[2J\x1B[H");

  // Small delay to ensure terminal is ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Restart the TUI
  startTui();
}

/**
 * Attach to a tmux session with auto-return: when Claude starts working
 * (i.e., user sent a message), automatically detach back to the TUI.
 */
export async function exitTuiAndAttachAutoReturn(sessionName: string, tmuxSessionName: string): Promise<void> {
  // Resolve the worktree path for state monitoring
  const wtPath = await getWorktreePath(sessionName);
  let normalizedPath: string;
  try {
    normalizedPath = realpathSync(wtPath);
  } catch {
    normalizedPath = wtPath.startsWith("/tmp/") ? "/private" + wtPath : wtPath;
  }

  // Unmount Ink and wait for cleanup
  if (instance) {
    instance.unmount();
    instance = null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  process.stdout.write("\x1B[2J\x1B[H");

  const { spawnSync, spawn } = await import("child_process");

  // Spawn a background watcher that auto-detaches when Claude starts working.
  // It waits for a non-working → working transition so it won't fire immediately
  // if Claude is already working when the user attaches.
  // When multiple state files match the cwd, pick the most recently modified one.
  const watcherScript = `
STATE_DIR="/tmp/csm-claude-state"
TARGET_PATH="${normalizedPath}"
SESSION="${tmuxSessionName}"
TIMEOUT=300

sleep 1

SAW_NON_WORKING=false
ELAPSED=0

while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
  ATTACHED=$(tmux display-message -t "$SESSION" -p '#{session_attached}' 2>/dev/null)
  if [ "$ATTACHED" != "1" ]; then
    exit 0
  fi

  CURRENT_STATE=""
  LATEST_TS=0
  for f in "$STATE_DIR"/*.json; do
    [ -f "$f" ] || continue
    CONTENT=$(cat "$f" 2>/dev/null)
    CWD=$(echo "$CONTENT" | grep -o '"cwd":"[^"]*"' | head -1 | cut -d'"' -f4)
    STATE=$(echo "$CONTENT" | grep -o '"state":"[^"]*"' | head -1 | cut -d'"' -f4)
    TS=$(echo "$CONTENT" | grep -o '"timestamp":[0-9]*' | head -1 | cut -d: -f2)
    case "$CWD" in /tmp/*) CWD="/private$CWD";; esac
    if [ "$CWD" = "$TARGET_PATH" ]; then
      if [ -n "$TS" ] && [ "$TS" -gt "$LATEST_TS" ] 2>/dev/null; then
        LATEST_TS="$TS"
        CURRENT_STATE="$STATE"
      fi
    fi
  done

  if [ "$CURRENT_STATE" != "working" ]; then
    SAW_NON_WORKING=true
  fi

  if [ "$SAW_NON_WORKING" = true ] && [ "$CURRENT_STATE" = "working" ]; then
    sleep 0.3
    tmux detach-client -s "$SESSION" 2>/dev/null
    exit 0
  fi

  sleep 0.5
  ELAPSED=$((ELAPSED + 1))
done
`;

  const watcher = spawn("bash", ["-c", watcherScript], {
    detached: true,
    stdio: "ignore",
  });
  watcher.unref();

  // Attach to tmux (blocks until detach)
  spawnSync("tmux", ["attach", "-t", tmuxSessionName], {
    stdio: "inherit",
    env: process.env,
  });

  // After detaching (manual or auto), restart TUI
  process.stdout.write("\x1B[2J\x1B[H");
  await new Promise((resolve) => setTimeout(resolve, 100));
  startTui();
}

/**
 * Attach to a tmux session's terminal window directly.
 */
export async function exitTuiAndAttachTerminal(sessionName: string, tmuxSessionName: string, worktreePath?: string): Promise<void> {
  if (instance) {
    instance.unmount();
    instance = null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  process.stdout.write("\x1B[2J\x1B[H");

  const { spawnSync } = await import("child_process");

  // Select the terminal window before attaching
  spawnSync("tmux", ["select-window", "-t", `${tmuxSessionName}:terminal`], {
    stdio: "ignore",
  });

  spawnSync("tmux", ["attach", "-t", tmuxSessionName], {
    stdio: "inherit",
    env: process.env,
  });

  // After detaching, restart TUI
  process.stdout.write("\x1B[2J\x1B[H");
  await new Promise((resolve) => setTimeout(resolve, 100));
  startTui();
}

// Keep the old function for cases where we want to exit completely
export async function exitTuiAndRun(command: string, args: string[]): Promise<never> {
  if (instance) {
    instance.unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  process.stdout.write("\x1B[2J\x1B[H");

  const { spawnSync } = await import("child_process");
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  process.exit(result.status ?? 1);
}
