/**
 * Session monitor daemon — event bridge between developer sessions and PM.
 *
 * This is a lightweight fs.watch-based daemon that runs in the same process
 * as `csm pm start`. It does NOT make decisions — it only detects state
 * transitions and formats notifications. ALL decision-making is done by the
 * PM (Claude).
 *
 * ## What it watches
 *
 * 1. /tmp/csm-claude-state/*.json — Claude Code writes these state files
 *    via hooks. When a developer session transitions to "waiting_for_input",
 *    the monitor captures the developer's pane and notifies PM.
 *
 * 2. /tmp/csm-pm-escalation.json — PM writes this file when it needs to
 *    escalate something to the user. The monitor forwards it via HTTP POST
 *    to the configured escalationUrl (e.g., Clawdbot webhook).
 *
 * 3. Idle timeout — every 30s, checks if any developer has been in
 *    "waiting_for_input" longer than developerIdleThresholdS (default 120s).
 *
 * ## Notification flow
 *
 *   Developer state change detected
 *     → capture-pane (last 30 lines from developer's tmux)
 *     → write /tmp/csm-pm-notify-<ts>.md with session name + pane content
 *     → tmux send-keys to PM: "Read /tmp/csm-pm-notify-<ts>.md -- developer needs attention."
 *
 * ## Manual testing
 *
 * The monitor starts automatically with `csm pm start`. To test it:
 *
 * 1. Simulate a state transition (PM must be running):
 *      csm create test-dev --repo ~/my-repo
 *      echo '{"state":"waiting_for_input","event":"test","cwd":"/tmp/csm-worktrees/test-dev","timestamp":'$(date +%s)'}' \
 *        > /tmp/csm-claude-state/test-monitor.json
 *      # Wait ~1s, then check:
 *      ls /tmp/csm-pm-notify-*.md | tail -1
 *      cat $(ls /tmp/csm-pm-notify-*.md | tail -1)
 *
 * 2. Simulate an idle timeout:
 *      OLD=$(($(date +%s) - 200))
 *      echo '{"state":"waiting_for_input","event":"test","cwd":"/tmp/csm-worktrees/test-dev","timestamp":'$OLD'}' \
 *        > /tmp/csm-claude-state/test-idle.json
 *      # Wait up to 30s for idle check, then:
 *      ls /tmp/csm-pm-notify-*.md | tail -1
 *
 * 3. Simulate an escalation:
 *      echo '{"id":"esc-test","timestamp":"'$(date -Iseconds)'","severity":"info","message":"test escalation","awaitingResponse":false}' \
 *        > /tmp/csm-pm-escalation.json
 *      # Wait ~1s, file should be consumed:
 *      ls /tmp/csm-pm-escalation.json 2>/dev/null || echo "processed"
 *
 * 4. Cleanup:
 *      csm kill test-dev
 *      rm -f /tmp/csm-claude-state/test-*.json /tmp/csm-pm-notify-*.md
 */

import { watch, readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import type { PMConfig, EscalationMessage } from "../types";
import { exec } from "./ssh";
import { PM_TMUX_SESSION } from "./pm-session";

const STATE_DIR = "/tmp/csm-claude-state";
const ESCALATION_FILE = "/tmp/csm-pm-escalation.json";

interface MonitorHandle {
  stop: () => void;
}

interface SessionSnapshot {
  state: string;
  timestamp: number;
  cwd: string;
}

/**
 * Start the session monitor daemon. Watches for developer session state changes
 * and bridges them as notifications into the PM's tmux pane.
 *
 * Also watches for PM escalation files and forwards them to the configured URL.
 */
export function startSessionMonitor(config: PMConfig): MonitorHandle {
  const sessionStates = new Map<string, SessionSnapshot>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  // Load initial state snapshots
  loadCurrentStates(sessionStates);

  // Watch the claude state directory for changes
  let stateWatcher: ReturnType<typeof watch> | null = null;
  try {
    // Ensure state dir exists
    if (!existsSync(STATE_DIR)) {
      exec(`mkdir -p "${STATE_DIR}"`);
    }

    stateWatcher = watch(STATE_DIR, (_event, _filename) => {
      if (stopped) return;

      // Debounce: wait 500ms after last change before processing
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        processStateChanges(sessionStates, config).catch((err) => {
          console.error("[Monitor] Error processing state changes:", err);
        });
      }, 500);
    });
  } catch {
    console.warn("[Monitor] Could not watch state directory, will poll instead");
  }

  // Watch for escalation files
  let escalationWatcher: ReturnType<typeof watch> | null = null;
  try {
    // Watch /tmp/ for the escalation file
    escalationWatcher = watch("/tmp", (_event, filename) => {
      if (stopped) return;
      if (filename === "csm-pm-escalation.json") {
        processEscalation(config).catch((err) => {
          console.error("[Monitor] Error processing escalation:", err);
        });
      }
    });
  } catch {
    // /tmp watch may fail on some systems
  }

  // Idle check interval
  const idleCheckInterval = setInterval(() => {
    if (stopped) return;
    checkIdleSessions(sessionStates, config).catch((err) => {
      console.error("[Monitor] Error checking idle sessions:", err);
    });
  }, 30_000); // Check every 30 seconds

  console.log("[Monitor] Session monitor started");
  console.log(`[Monitor] Watching: ${STATE_DIR}`);
  console.log(`[Monitor] Idle threshold: ${config.developerIdleThresholdS}s`);

  return {
    stop() {
      stopped = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      if (stateWatcher) stateWatcher.close();
      if (escalationWatcher) escalationWatcher.close();
      clearInterval(idleCheckInterval);
      console.log("[Monitor] Session monitor stopped");
    },
  };
}

/**
 * Load current state snapshots from the state directory.
 */
function loadCurrentStates(snapshots: Map<string, SessionSnapshot>): void {
  try {
    const files = readdirSync(STATE_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = readFileSync(join(STATE_DIR, file), "utf-8");
        const info = JSON.parse(content);
        snapshots.set(file, {
          state: info.state,
          timestamp: info.timestamp,
          cwd: info.cwd,
        });
      } catch {
        // Skip malformed
      }
    }
  } catch {
    // State dir may not exist yet
  }
}

/**
 * Process state changes: detect transitions and notify PM.
 */
async function processStateChanges(
  snapshots: Map<string, SessionSnapshot>,
  _config: PMConfig
): Promise<void> {
  let files: string[];
  try {
    files = readdirSync(STATE_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return;
  }

  for (const file of files) {
    try {
      const content = readFileSync(join(STATE_DIR, file), "utf-8");
      const info = JSON.parse(content);
      const previous = snapshots.get(file);

      // Detect transition to waiting_for_input
      if (
        info.state === "waiting_for_input" &&
        previous?.state !== "waiting_for_input"
      ) {
        // Extract session name from cwd (e.g., /tmp/csm-worktrees/my-session -> my-session)
        const sessionName = extractSessionName(info.cwd);
        if (sessionName && sessionName !== "pm") {
          await notifyPM(sessionName, "waiting_for_input", info.cwd);
        }
      }

      // Update snapshot
      snapshots.set(file, {
        state: info.state,
        timestamp: info.timestamp,
        cwd: info.cwd,
      });
    } catch {
      // Skip
    }
  }

  // Clean up snapshots for removed files
  for (const key of snapshots.keys()) {
    if (!files.includes(key)) {
      snapshots.delete(key);
    }
  }
}

/**
 * Check for idle developer sessions and notify PM.
 */
async function checkIdleSessions(
  snapshots: Map<string, SessionSnapshot>,
  config: PMConfig
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const threshold = config.developerIdleThresholdS;

  for (const [_file, snapshot] of snapshots) {
    if (
      snapshot.state === "waiting_for_input" &&
      now - snapshot.timestamp > threshold
    ) {
      const sessionName = extractSessionName(snapshot.cwd);
      if (sessionName && sessionName !== "pm") {
        await notifyPM(sessionName, "idle_timeout", snapshot.cwd);
      }
    }
  }
}

/**
 * Extract session name from a worktree cwd path.
 */
function extractSessionName(cwd: string): string | null {
  const match = cwd.match(/csm-worktrees\/([^/]+)/);
  return match ? match[1] : null;
}

/**
 * Send a notification to the PM session about a developer event.
 */
async function notifyPM(
  sessionName: string,
  eventType: string,
  _cwd: string
): Promise<void> {
  const ts = Date.now();
  const notifyPath = `/tmp/csm-pm-notify-${ts}.md`;

  // Capture recent output from the developer session
  const tmuxTarget = `csm-${sessionName}:claude`;
  const captureResult = await exec(
    `tmux capture-pane -t ${tmuxTarget} -p -S -30 2>/dev/null`
  );
  const paneContent = captureResult.success ? captureResult.stdout : "(could not capture pane)";

  const notification = [
    `# Developer Notification`,
    ``,
    `**Session:** ${sessionName}`,
    `**Event:** ${eventType}`,
    `**Time:** ${new Date().toISOString()}`,
    ``,
    `## Recent Output`,
    "```",
    paneContent.trim(),
    "```",
    ``,
    `Please review and take appropriate action.`,
  ].join("\n");

  await Bun.write(notifyPath, notification);

  // Send to PM via tmux
  const instruction = `Read ${notifyPath} -- developer needs attention.`;
  const escaped = instruction.replace(/'/g, "'\\''");
  await exec(
    `tmux send-keys -t ${PM_TMUX_SESSION}:claude -l '${escaped}' && tmux send-keys -t ${PM_TMUX_SESSION}:claude Enter`
  );
}

/**
 * Process an escalation file written by PM. Forwards to the configured URL.
 */
async function processEscalation(config: PMConfig): Promise<void> {
  if (!existsSync(ESCALATION_FILE)) return;

  try {
    const content = readFileSync(ESCALATION_FILE, "utf-8");
    const escalation: EscalationMessage = JSON.parse(content);

    if (config.escalationUrl) {
      try {
        await fetch(config.escalationUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(escalation),
        });
        console.log(`[Monitor] Escalation forwarded: ${escalation.id}`);
      } catch (err) {
        console.error("[Monitor] Failed to forward escalation:", err);
      }
    } else {
      console.log(`[Monitor] Escalation (no URL configured): ${escalation.message}`);
    }

    // Remove the file after processing
    await exec(`rm -f "${ESCALATION_FILE}"`);
  } catch {
    // Malformed escalation file
  }
}
