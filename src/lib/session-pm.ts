/**
 * Per-session PM lifecycle: add, configure, and remove a PM window within
 * an existing developer tmux session.
 *
 * Each developer session gets a dedicated PM in window 2 (alongside 0:claude,
 * 1:terminal). The PM runs from `<worktreePath>/.csm-pm/` with its own
 * CLAUDE.md and settings.json.
 *
 * ## Architecture
 *
 *   startSessionPM(sessionName, worktreePath, config)
 *     1. Creates `.csm-pm/` subdirectory in the worktree
 *     2. Generates CLAUDE.md from session-pm-claude.md template
 *     3. Writes .claude/settings.json with PM permissions
 *     4. Creates window 2:pm in the tmux session
 *     5. Launches `claude` in the :pm window with cwd .csm-pm/
 *
 *   stopSessionPM(sessionName)
 *     1. Sends /exit to csm-<name>:pm
 *     2. Waits briefly, kills window if still alive
 *
 *   sessionPMExists(sessionName)
 *     Checks if window :pm exists in the session
 *
 * ## Manual testing
 *
 *   csm create test-session --repo ~/my-repo
 *   tmux list-windows -t csm-test-session   # should show claude, terminal, pm
 *   cat /tmp/csm-worktrees/test-session/.csm-pm/CLAUDE.md | head -5
 *   csm pm add-to-session test-session      # for existing sessions
 */

import { readFileSync } from "fs";
import { join } from "path";
import { exec } from "./ssh";
import { getSessionName, autoAcceptClaudeTrust } from "./tmux";

const SESSION_PM_TEMPLATE_PATH = join(import.meta.dir, "../../templates/session-pm-claude.md");

export interface SessionPMConfig {
  projectName?: string;
  repoPath?: string;
  linearIssue?: string;
  gitBranch?: string;
}

/**
 * Generate the session PM CLAUDE.md from the template, substituting session context.
 */
export function generateSessionPMClaudeMd(sessionName: string, config: SessionPMConfig): string {
  let template: string;
  try {
    template = readFileSync(SESSION_PM_TEMPLATE_PATH, "utf-8");
  } catch {
    throw new Error(`Session PM template not found at ${SESSION_PM_TEMPLATE_PATH}`);
  }

  return template
    .replace(/\{\{SESSION_NAME\}\}/g, sessionName)
    .replace(/\{\{PROJECT_NAME\}\}/g, config.projectName || "unknown")
    .replace(/\{\{REPO_PATH\}\}/g, config.repoPath || "unknown")
    .replace(/\{\{LINEAR_ISSUE\}\}/g, config.linearIssue || "none")
    .replace(/\{\{GIT_BRANCH\}\}/g, config.gitBranch || "unknown");
}

/**
 * Build .claude/settings.json for the session PM.
 * Same broad set as global PM but scoped: no csm create/kill, keep tmux for communication.
 */
export function buildSessionPMSettings(): Record<string, any> {
  return {
    permissions: {
      allow: [
        // CSM CLI (status queries only, no create/kill)
        "Bash(csm list)",
        "Bash(csm list *)",
        "Bash(csm pm *)",
        // tmux (for communicating with developer session)
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
        "Bash(rm /tmp/csm-session-pm-*)",
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
 * Check if a PM window exists in the given session.
 */
export async function sessionPMExists(sessionName: string, hostName?: string): Promise<boolean> {
  const tmuxSession = getSessionName(sessionName);
  const result = await exec(`tmux list-windows -t ${tmuxSession} -F '#{window_name}' 2>/dev/null`, hostName);
  if (!result.success || !result.stdout) return false;
  return result.stdout.split("\n").some((w) => w.trim() === "pm");
}

/**
 * Start a per-session PM in an existing tmux session.
 * Creates .csm-pm/ subdirectory, writes CLAUDE.md + settings, adds :pm window, launches claude.
 */
export async function startSessionPM(
  sessionName: string,
  worktreePath: string,
  config: SessionPMConfig
): Promise<void> {
  const tmuxSession = getSessionName(sessionName);
  const pmDir = join(worktreePath, ".csm-pm");

  // Create .csm-pm/ directory
  await exec(`mkdir -p "${pmDir}/.claude"`);

  // Generate and write CLAUDE.md
  const claudeMd = generateSessionPMClaudeMd(sessionName, config);
  await Bun.write(join(pmDir, "CLAUDE.md"), claudeMd);

  // Write .claude/settings.json
  const settings = buildSessionPMSettings();
  await Bun.write(join(pmDir, ".claude", "settings.json"), JSON.stringify(settings, null, 2));

  // Create pm window in the existing tmux session
  const createWindowResult = await exec(
    `tmux new-window -t ${tmuxSession} -n pm -c "${pmDir}"`
  );
  if (!createWindowResult.success) {
    throw new Error(`Failed to create PM window: ${createWindowResult.stderr}`);
  }

  // Select back to claude window so user doesn't land on pm
  await exec(`tmux select-window -t ${tmuxSession}:claude`);

  // Launch claude in the pm window
  await exec(`tmux send-keys -t ${tmuxSession}:pm 'claude' Enter`);

  // Auto-accept trust dialog for PM window
  autoAcceptClaudeTrust(sessionName, 'pm');
}

/**
 * Stop the per-session PM gracefully.
 * Sends /exit, waits briefly, then kills the window if still alive.
 */
export async function stopSessionPM(sessionName: string): Promise<void> {
  const tmuxSession = getSessionName(sessionName);

  if (!(await sessionPMExists(sessionName))) {
    return;
  }

  // Send /exit to Claude
  await exec(`tmux send-keys -t ${tmuxSession}:pm '/exit' Enter`);

  // Wait briefly for graceful exit
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Kill the pm window if still alive
  await exec(`tmux kill-window -t ${tmuxSession}:pm 2>/dev/null`);
}
