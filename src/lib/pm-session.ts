/**
 * PM session lifecycle: create, configure, and destroy the PM tmux session.
 *
 * The PM session is a regular Claude Code session with a special CLAUDE.md
 * (generated from templates/pm-claude.md) that gives it the project manager
 * role. It gets broader permissions than developer sessions — notably
 * Bash(csm *) and Bash(tmux *) — so it can create/kill sessions and
 * communicate with them.
 *
 * ## Architecture
 *
 *   startPMSession(config)
 *     1. Creates (or reuses) a git worktree at /tmp/csm-worktrees/pm
 *     2. Generates CLAUDE.md from the template with {{PROJECT_NAME}} and {{REPO_PATH}}
 *     3. Writes .claude/settings.json with expanded PM permissions
 *     4. Creates tmux session "csm-pm" with windows: claude, terminal
 *     5. Launches `claude` in the :claude window
 *     6. Writes initial state to /tmp/csm-pm-state.json
 *
 *   stopPMSession()
 *     1. Sends /exit to Claude for graceful shutdown
 *     2. Waits 2s, then kills the tmux session
 *     3. Updates state file to "stopped"
 *
 * ## Manual testing
 *
 * Start:
 *   csm pm start --project test --repo ~/my-repo
 *   tmux has-session -t csm-pm && echo "running"
 *   cat /tmp/csm-worktrees/pm/CLAUDE.md | head -3   # verify template substitution
 *   cat /tmp/csm-worktrees/pm/.claude/settings.json | jq '.permissions.allow[:3]'
 *
 * Stop:
 *   csm pm stop
 *   tmux has-session -t csm-pm 2>/dev/null || echo "stopped"
 *
 * Double-start (should error):
 *   csm pm start --repo ~/my-repo && csm pm start --repo ~/my-repo
 *   # Second call: "PM session is already running."
 *
 * Inspect the running PM:
 *   tmux attach -t csm-pm          # see Claude live
 *   tmux list-windows -t csm-pm    # should show "claude" and "terminal"
 *   tmux capture-pane -t csm-pm:claude -p -S -20   # read recent output
 */

import { readFileSync } from "fs";
import { join } from "path";
import type { PMConfig } from "../types";
import { exec } from "./ssh";
import { getSessionName, sessionExists } from "./tmux";
import { writePMState } from "./pm-state";
import { loadConfig } from "./config";

const PM_SESSION_NAME = "pm";
const PM_TMUX_SESSION = getSessionName(PM_SESSION_NAME);
const TEMPLATE_PATH = join(import.meta.dir, "../../templates/pm-claude.md");

/**
 * Generate the PM CLAUDE.md from the template, substituting config values.
 */
function generatePMClaudeMd(config: PMConfig): string {
  let template: string;
  try {
    template = readFileSync(TEMPLATE_PATH, "utf-8");
  } catch {
    throw new Error(`PM template not found at ${TEMPLATE_PATH}`);
  }

  return template
    .replace(/\{\{PROJECT_NAME\}\}/g, config.projectName)
    .replace(/\{\{REPO_PATH\}\}/g, config.repoPath);
}

/**
 * Build the .claude/settings.json for the PM session.
 * PM gets broader permissions than developers: csm commands, tmux, full bash.
 */
function buildPMSettings(): Record<string, any> {
  return {
    permissions: {
      allow: [
        // CSM CLI
        "Bash(csm *)",
        "Bash(csm)",
        // tmux (for communicating with developer sessions)
        "Bash(tmux *)",
        // Standard dev tools
        "Bash(bun *)",
        "Bash(npm *)",
        "Bash(node *)",
        "Bash(git *)",
        "Bash(gh *)",
        // File operations
        "Bash(cat *)",
        "Bash(echo *)",
        "Bash(ls *)",
        "Bash(find *)",
        "Bash(grep *)",
        "Bash(rg *)",
        "Bash(head *)",
        "Bash(tail *)",
        "Bash(mkdir *)",
        "Bash(cp *)",
        "Bash(mv *)",
        "Bash(rm /tmp/csm-pm-*)",
        "Bash(touch *)",
        "Bash(wc *)",
        "Bash(date *)",
        "Bash(sleep *)",
        "Bash(pwd)",
        "Bash(which *)",
        "Bash(test *)",
        "Bash([ *)",
        "Bash(sort *)",
        "Bash(jq *)",
        "Bash(curl *)",
        "Bash(sed *)",
        "Bash(awk *)",
        "Read",
        "Write",
        "Edit",
      ],
    },
  };
}

/**
 * Start the PM session. Creates a worktree, writes CLAUDE.md + settings,
 * creates tmux session, and launches Claude.
 */
export async function startPMSession(config: PMConfig): Promise<void> {
  // Check if PM session already running
  if (await sessionExists(PM_SESSION_NAME)) {
    throw new Error("PM session is already running. Use 'csm pm stop' first.");
  }

  if (!config.repoPath) {
    throw new Error("No repo path configured. Set defaultRepo in config or use --repo.");
  }

  const appConfig = await loadConfig();
  const worktreeBase = appConfig.worktreeBase || "/tmp/csm-worktrees";
  const workingDir = join(worktreeBase, PM_SESSION_NAME);

  // Create worktree for PM (or reuse if exists)
  const wtCheck = await exec(`test -d "${workingDir}/.git" || test -f "${workingDir}/.git"`);
  if (!wtCheck.success) {
    // Create a new worktree
    const branchName = `csm/pm-${config.projectName}`;
    await exec(`git -C "${config.repoPath}" worktree add -B "${branchName}" "${workingDir}" HEAD`);
  }

  // Generate and write CLAUDE.md
  const claudeMd = generatePMClaudeMd(config);
  await Bun.write(join(workingDir, "CLAUDE.md"), claudeMd);

  // Write .claude/settings.json
  const settingsDir = join(workingDir, ".claude");
  await exec(`mkdir -p "${settingsDir}"`);
  const settings = buildPMSettings();
  await Bun.write(join(settingsDir, "settings.json"), JSON.stringify(settings, null, 2));

  // Tell git to ignore local modifications
  await exec(`cd "${workingDir}" && git update-index --skip-worktree CLAUDE.md 2>/dev/null || true`);

  // Create tmux session with claude and terminal windows
  const createCmd = [
    `tmux new-session -d -s ${PM_TMUX_SESSION} -c "${workingDir}" -n claude`,
    `tmux new-window -t ${PM_TMUX_SESSION} -n terminal -c "${workingDir}"`,
    `tmux select-window -t ${PM_TMUX_SESSION}:claude`,
  ].join(" && ");

  const result = await exec(createCmd);
  if (!result.success) {
    throw new Error(`Failed to create PM tmux session: ${result.stderr}`);
  }

  // Launch Claude in the session
  await exec(`tmux send-keys -t ${PM_TMUX_SESSION}:claude 'claude' Enter`);

  // Write initial PM state
  await writePMState({
    status: "running",
    activeSessions: [],
    escalations: [],
    startedAt: new Date().toISOString(),
  });

  console.log(`PM session started: ${PM_TMUX_SESSION}`);
  console.log(`Working directory: ${workingDir}`);
  console.log(`Attach with: tmux attach -t ${PM_TMUX_SESSION}`);
}

/**
 * Stop the PM session gracefully.
 */
export async function stopPMSession(): Promise<void> {
  if (!(await sessionExists(PM_SESSION_NAME))) {
    console.log("PM session is not running.");
    return;
  }

  // Send /exit to Claude
  await exec(`tmux send-keys -t ${PM_TMUX_SESSION}:claude '/exit' Enter`);

  // Wait briefly for graceful exit
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Kill the tmux session
  await exec(`tmux kill-session -t ${PM_TMUX_SESSION}`);

  // Update state
  await writePMState({
    status: "stopped",
    activeSessions: [],
    escalations: [],
    startedAt: "",
  });

  console.log("PM session stopped.");
}

export { PM_SESSION_NAME, PM_TMUX_SESSION };
