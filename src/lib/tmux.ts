import type { Session, CommandResult, LinearIssue, GitStats, GitFileChange, Project } from "../types";
import { exec } from "./ssh";
import { readClaudeStates, readRemoteClaudeStates, getLastAssistantMessage } from "./claude-state";
import { getWorktreePath, loadSessionMetadata } from "./worktree";
import { isFeedbackEnabled, loadConfig } from "./config";
import { realpathSync } from "fs";
import { startSessionPM } from "./session-pm";

const SESSION_PREFIX = "csm-";

export function getSessionName(name: string): string {
  return `${SESSION_PREFIX}${name}`;
}

export function parseSessionName(fullName: string): string | null {
  if (fullName.startsWith(SESSION_PREFIX)) {
    return fullName.slice(SESSION_PREFIX.length);
  }
  return null;
}

export async function listSessions(hostName?: string): Promise<Session[]> {
  const result = await exec(
    'tmux list-sessions -F "#{session_name}|#{session_attached}|#{session_windows}|#{session_created}|#{pane_title}" 2>/dev/null || true',
    hostName
  );

  if (!result.stdout) {
    return [];
  }

  const sessions: Session[] = [];
  const lines = result.stdout.split("\n").filter(Boolean);

  for (const line of lines) {
    const [fullName, attached, windows, created, paneTitle] = line.split("|");
    const name = parseSessionName(fullName);

    if (name) {
      // Clean up the pane title (remove leading symbols like ✳)
      const title = paneTitle?.replace(/^[✳★●○]\s*/, "").trim() || undefined;

      sessions.push({
        name,
        fullName,
        attached: attached === "1",
        windows: parseInt(windows, 10),
        created: new Date(parseInt(created, 10) * 1000).toISOString(),
        title,
      });
    }
  }

  // Enrich sessions with Claude state and Linear issue
  const claudeStates = hostName ? await readRemoteClaudeStates(hostName) : readClaudeStates();
  for (const session of sessions) {
    try {
      const wtPath = await getWorktreePath(session.name);
      session.worktreePath = wtPath;
      if (claudeStates.size > 0) {
        let normalizedPath: string;
        if (hostName) {
          // Remote: match against cwd directly (no realpath resolution)
          normalizedPath = wtPath;
        } else {
          try {
            normalizedPath = realpathSync(wtPath);
          } catch {
            normalizedPath = wtPath.startsWith("/tmp/") ? "/private" + wtPath : wtPath;
          }
        }
        const stateInfo = claudeStates.get(normalizedPath);
        // For remote, also try with /private prefix (macOS)
        const stateInfoAlt = !stateInfo && hostName ? claudeStates.get("/private" + normalizedPath) : null;
        const matched = stateInfo || stateInfoAlt;
        if (matched) {
          session.claudeState = matched.state;
          // Skip transcript reading for remote sessions (would require SSH)
          if (!hostName && matched.transcriptPath) {
            session.claudeLastMessage = getLastAssistantMessage(matched.transcriptPath);
          }
        }
      }
      session.gitStats = await getGitStats(wtPath, hostName);
    } catch {
      // Skip state enrichment on error
    }

    try {
      const metadata = await loadSessionMetadata(session.name, hostName);
      if (metadata?.linearIssue) {
        session.linearIssue = metadata.linearIssue;
      }
      if (metadata?.projectName) {
        session.projectName = metadata.projectName;
      }
      if (metadata?.feedbackReports?.length) {
        session.feedbackReports = metadata.feedbackReports;
      }
    } catch {
      // Skip metadata enrichment on error
    }
  }

  return sessions;
}

async function getGitStats(worktreePath: string, hostName?: string): Promise<GitStats | undefined> {
  try {
    const result = await exec(
      `git -C "${worktreePath}" diff --stat HEAD 2>/dev/null | tail -1`,
      hostName
    );
    if (!result.stdout?.trim()) return undefined;
    // e.g. "3 files changed, 55 insertions(+), 2 deletions(-)"
    const line = result.stdout.trim();
    const filesMatch = line.match(/(\d+)\s+files?\s+changed/);
    const insMatch = line.match(/(\d+)\s+insertions?\(\+\)/);
    const delMatch = line.match(/(\d+)\s+deletions?\(-\)/);
    if (!filesMatch) return undefined;
    return {
      filesChanged: parseInt(filesMatch[1], 10),
      insertions: insMatch ? parseInt(insMatch[1], 10) : 0,
      deletions: delMatch ? parseInt(delMatch[1], 10) : 0,
    };
  } catch {
    return undefined;
  }
}

export async function getDetailedGitStats(worktreePath: string, hostName?: string): Promise<GitStats | undefined> {
  try {
    // Run git diff --numstat and git status --porcelain in parallel
    const [numstatResult, statusResult] = await Promise.all([
      exec(`git -C "${worktreePath}" diff --numstat HEAD 2>/dev/null`, hostName),
      exec(`git -C "${worktreePath}" status --porcelain 2>/dev/null`, hostName),
    ]);

    // Parse status flags: M=modified, A=added, D=deleted, R=renamed, ??=untracked
    const statusMap = new Map<string, string>();
    if (statusResult.stdout) {
      for (const line of statusResult.stdout.split("\n").filter(Boolean)) {
        const flag = line.slice(0, 2).trim();
        const file = line.slice(3);
        statusMap.set(file, flag);
      }
    }

    const fileChanges: GitFileChange[] = [];
    const trackedFiles = new Set<string>();

    // Parse numstat for tracked file changes
    if (numstatResult.stdout) {
      for (const line of numstatResult.stdout.split("\n").filter(Boolean)) {
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const [ins, del, file] = parts;
        trackedFiles.add(file);
        const insertions = ins === "-" ? 0 : parseInt(ins, 10);
        const deletions = del === "-" ? 0 : parseInt(del, 10);

        const flag = statusMap.get(file) || "M";
        let status: GitFileChange["status"] = "modified";
        if (flag === "A" || flag === "AM") status = "added";
        else if (flag === "D") status = "deleted";
        else if (flag.startsWith("R")) status = "renamed";

        fileChanges.push({ file, insertions, deletions, status });
      }
    }

    // Add untracked files (status "??")
    for (const [file, flag] of statusMap) {
      if (flag === "??" && !trackedFiles.has(file)) {
        fileChanges.push({ file, insertions: 0, deletions: 0, status: "added", source: "uncommitted" });
      }
    }

    // Tag all uncommitted changes
    for (const fc of fileChanges) {
      fc.source = "uncommitted";
    }

    // Fetch committed changes in parallel
    const committedChanges = await getCommittedChanges(worktreePath, hostName);

    // Merge both lists
    const allChanges = [...fileChanges, ...committedChanges];

    if (allChanges.length === 0) return undefined;

    const totalInsertions = allChanges.reduce((s, f) => s + f.insertions, 0);
    const totalDeletions = allChanges.reduce((s, f) => s + f.deletions, 0);

    return {
      filesChanged: allChanges.length,
      insertions: totalInsertions,
      deletions: totalDeletions,
      fileChanges: allChanges,
    };
  } catch {
    return undefined;
  }
}

export async function getFileDiff(worktreePath: string, filePath: string, hostName?: string): Promise<string[]> {
  try {
    // Try tracked file diff first
    const result = await exec(
      `git -C "${worktreePath}" diff HEAD -- "${filePath}" 2>/dev/null`,
      hostName
    );
    if (result.stdout?.trim()) {
      return result.stdout.split("\n");
    }
    // For untracked files, diff against /dev/null
    const untrackedResult = await exec(
      `git -C "${worktreePath}" diff --no-index /dev/null -- "${filePath}" 2>/dev/null || true`,
      hostName
    );
    if (untrackedResult.stdout?.trim()) {
      return untrackedResult.stdout.split("\n");
    }
    return [];
  } catch {
    return [];
  }
}

async function getCommittedChanges(worktreePath: string, hostName?: string): Promise<GitFileChange[]> {
  try {
    const [numstatResult, statusResult] = await Promise.all([
      exec(`git -C "${worktreePath}" diff main...HEAD --numstat 2>/dev/null`, hostName),
      exec(`git -C "${worktreePath}" diff main...HEAD --name-status 2>/dev/null`, hostName),
    ]);

    // Parse name-status for file statuses
    const statusMap = new Map<string, string>();
    if (statusResult.stdout) {
      for (const line of statusResult.stdout.split("\n").filter(Boolean)) {
        const parts = line.split("\t");
        if (parts.length < 2) continue;
        const flag = parts[0];
        const file = parts[parts.length - 1]; // last part handles renames
        statusMap.set(file, flag);
      }
    }

    const fileChanges: GitFileChange[] = [];
    if (numstatResult.stdout) {
      for (const line of numstatResult.stdout.split("\n").filter(Boolean)) {
        const parts = line.split("\t");
        if (parts.length < 3) continue;
        const [ins, del, file] = parts;
        const insertions = ins === "-" ? 0 : parseInt(ins, 10);
        const deletions = del === "-" ? 0 : parseInt(del, 10);

        const flag = statusMap.get(file) || "M";
        let status: GitFileChange["status"] = "modified";
        if (flag === "A") status = "added";
        else if (flag === "D") status = "deleted";
        else if (flag.startsWith("R")) status = "renamed";

        fileChanges.push({ file, insertions, deletions, status, source: "committed" });
      }
    }

    return fileChanges;
  } catch {
    return [];
  }
}

export async function getCommittedFileDiff(worktreePath: string, filePath: string, hostName?: string): Promise<string[]> {
  try {
    const result = await exec(
      `git -C "${worktreePath}" diff main...HEAD -- "${filePath}" 2>/dev/null`,
      hostName
    );
    if (result.stdout?.trim()) {
      return result.stdout.split("\n");
    }
    return [];
  } catch {
    return [];
  }
}

export async function sessionExists(
  name: string,
  hostName?: string
): Promise<boolean> {
  const sessionName = getSessionName(name);
  const result = await exec(`tmux has-session -t ${sessionName} 2>/dev/null`, hostName);
  return result.success;
}

const FEEDBACK_PROTOCOL = `
# Feedback Loop Protocol

When you complete a meaningful task, generate a feedback report before stopping.

## What is a "meaningful task"?
- Implementing a feature, fixing a bug, refactoring code, adding tests, making UI changes, infrastructure work
- NOT: answering questions, reading files for context, planning without implementation, trivial formatting

## Artifact capture (do this BEFORE writing the report)

**For UI/frontend changes:**
1. Take a screenshot of the relevant UI area BEFORE making changes (if feasible — use git stash or simply note the before state)
2. After changes, navigate to the affected page and take screenshots using the browser tools
3. Save screenshots to \`.csm/screenshots/\` with descriptive names (e.g., \`after-login-button.png\`)

**For backend/API changes:**
- Run tests and save output: \`bun test > .csm/logs/test-output.txt 2>&1\`
- Capture relevant API responses or logs to \`.csm/logs/\`

**For all changes:**
- Run \`git diff --stat > .csm/logs/git-stats.txt\`
- Identify the 2-3 most important changed files for inline diff snippets

## Report generation

Create \`.csm/feedback-report.html\` using this structure:
- **Header**: Task title, session name, branch, timestamp, Linear issue link (if any)
- **Summary**: 2-3 sentences on what was accomplished
- **Stats**: Files changed, insertions, deletions
- **Artifacts**: Screenshots (as \`<img src="./screenshots/filename.png">\`), test output, key diffs
- **Testing**: How this was verified
- **Next steps**: What remains or what the user should review

Use clean, responsive HTML with inline CSS. Reference screenshots via relative paths.

End your response with the marker: \`<!-- CSM_TASK_COMPLETE -->\`

For **failed tasks**, still generate a report documenting what was attempted, what failed, and suggested fixes. Use marker: \`<!-- CSM_TASK_FAILED -->\`

For **multi-step tasks**, only generate the report when ALL steps are complete.

If the task is trivial (< 5 lines changed, typo fix), skip the report.
`;

export async function writeClaudeContext(
  workingDir: string,
  issue?: LinearIssue,
  hostName?: string
): Promise<void> {
  const lines: string[] = [];

  if (issue) {
    lines.push(
      `# Linear Issue: ${issue.identifier}`,
      `**Title:** ${issue.title}`,
      ...(issue.state ? [`**Status:** ${issue.state}`] : []),
      `**URL:** ${issue.url}`,
      ""
    );

    if (issue.description) {
      lines.push("## Description", issue.description, "");
    }

    lines.push(
      'When the user refers to "the issue", "the card", "the bug", or "the task", they are referring to this Linear issue.'
    );
  }

  const feedbackOn = await isFeedbackEnabled();
  if (feedbackOn) {
    lines.push("", FEEDBACK_PROTOCOL);
  }

  // Check if CLAUDE.md already exists in the worktree (from the repo)
  const checkExisting = await exec(`test -f "${workingDir}/CLAUDE.md" && cat "${workingDir}/CLAUDE.md"`, hostName);
  
  let finalContent: string;
  if (checkExisting.success && checkExisting.stdout.trim()) {
    // CLAUDE.md exists in repo - append our content
    const separator = "\n\n---\n\n# CSM Session Context\n\n";
    finalContent = checkExisting.stdout.trim() + separator + lines.join("\n");
  } else {
    // No existing CLAUDE.md - create new one with our content
    finalContent = lines.join("\n");
  }

  const escaped = finalContent.replace(/'/g, "'\\''");
  await exec(`echo '${escaped}' > "${workingDir}/CLAUDE.md"`, hostName);
}

const DEFAULT_ALLOWED_TOOLS = [
  "Bash(bun *)",
  "Bash(npm *)",
  "Bash(npx *)",
  "Bash(pnpm *)",
  "Bash(yarn *)",
  "Bash(node *)",
  "Bash(git *)",
  "Bash(gh *)",
  "Bash(ls *)",
  "Bash(cat *)",
  "Bash(head *)",
  "Bash(tail *)",
  "Bash(find *)",
  "Bash(grep *)",
  "Bash(rg *)",
  "Bash(ag *)",
  "Bash(wc *)",
  "Bash(sort *)",
  "Bash(uniq *)",
  "Bash(diff *)",
  "Bash(echo *)",
  "Bash(printf *)",
  "Bash(mkdir *)",
  "Bash(cp *)",
  "Bash(mv *)",
  "Bash(touch *)",
  "Bash(chmod *)",
  "Bash(pwd)",
  "Bash(which *)",
  "Bash(whoami)",
  "Bash(env)",
  "Bash(printenv *)",
  "Bash(date *)",
  "Bash(curl *)",
  "Bash(wget *)",
  "Bash(jq *)",
  "Bash(sed *)",
  "Bash(awk *)",
  "Bash(cut *)",
  "Bash(tr *)",
  "Bash(xargs *)",
  "Bash(tsc *)",
  "Bash(eslint *)",
  "Bash(prettier *)",
  "Bash(biome *)",
  "Bash(docker compose *)",
  "Bash(docker build *)",
  "Bash(docker ps *)",
  "Bash(docker logs *)",
  "Bash(tmux *)",
  "Bash(ssh *)",
  "Bash(scp *)",
  "Bash(rsync *)",
  "Read",
  "Write",
  "Edit",
];

const DEFAULT_DENY_PATTERNS = [
  "staging",
  "stg",
  "prod",
  "production",
  "database",
  "db",
  "migrate",
  "seed",
  "DROP",
  "DELETE FROM",
  "UPDATE .* SET",
  "INSERT INTO",
  "psql",
  "mysql",
  "mongosh",
  "prisma db push",
  "prisma migrate",
];

function buildDenyHookCommand(patterns: string[]): string {
  const regex = patterns.join("|");
  return `bash -c 'INPUT=$(cat); if echo "$INPUT" | grep -qiE "(${regex})"; then echo "BLOCK: This command appears to touch a staging/production environment or database. Please confirm."; exit 2; fi'`;
}

export async function writeClaudeSettings(
  workingDir: string,
  hostName?: string
): Promise<void> {
  const config = await loadConfig();
  const csmSettings = config.claudeSettings;

  const allowedTools = csmSettings?.allowedTools ?? DEFAULT_ALLOWED_TOOLS;
  const denyPatterns = csmSettings?.denyPatterns ?? DEFAULT_DENY_PATTERNS;

  // Read existing .claude/settings.json if present
  let existing: Record<string, any> = {};
  const settingsPath = `${workingDir}/.claude/settings.json`;
  const readResult = await exec(`cat "${settingsPath}" 2>/dev/null`, hostName);
  if (readResult.success && readResult.stdout.trim()) {
    try {
      existing = JSON.parse(readResult.stdout);
    } catch {
      // Invalid JSON, start fresh
    }
  }

  // Merge permissions.allow — deduplicate with existing
  const existingAllow: string[] = existing.permissions?.allow ?? [];
  const mergedAllow = [...new Set([...existingAllow, ...allowedTools])];

  // Merge hooks — append our deny hook without removing existing ones
  const existingHooks = existing.hooks?.PreToolUse ?? [];
  const denyHookCommand = buildDenyHookCommand(denyPatterns);
  const csmHook = {
    matcher: "Bash",
    hooks: [
      {
        type: "command",
        command: denyHookCommand,
      },
    ],
  };

  // Check if we already injected a CSM hook (avoid duplicates on re-create)
  const hasExistingCsmHook = existingHooks.some(
    (h: any) =>
      h.matcher === "Bash" &&
      h.hooks?.some((inner: any) => inner.command?.includes("BLOCK: This command appears to touch"))
  );

  const mergedPreToolUse = hasExistingCsmHook
    ? existingHooks
    : [...existingHooks, csmHook];

  const merged = {
    ...existing,
    permissions: {
      ...existing.permissions,
      allow: mergedAllow,
    },
    hooks: {
      ...existing.hooks,
      PreToolUse: mergedPreToolUse,
    },
  };

  const json = JSON.stringify(merged, null, 2);
  const escaped = json.replace(/'/g, "'\\''");
  await exec(`mkdir -p "${workingDir}/.claude"`, hostName);
  await exec(`echo '${escaped}' > "${settingsPath}"`, hostName);
}

export async function createSession(
  name: string,
  workingDir: string,
  hostName?: string,
  linearIssue?: LinearIssue,
  project?: Project
): Promise<CommandResult> {
  const sessionName = getSessionName(name);

  // Write CLAUDE.md with feedback protocol (and Linear issue context if provided)
  await writeClaudeContext(workingDir, linearIssue, hostName);

  // Write .claude/settings.json with permissions and safety hooks (merges with existing)
  await writeClaudeSettings(workingDir, hostName);

  // Tell git to ignore local modifications to CLAUDE.md in this worktree
  await exec(`cd "${workingDir}" && git update-index --skip-worktree CLAUDE.md`, hostName);

  // Write inline setup script from project config if present
  if (project?.setupScript) {
    const escaped = project.setupScript.replace(/'/g, "'\\''");
    await exec(`echo '${escaped}' > "${workingDir}/.csm-setup.sh"`, hostName);
    await exec(`chmod +x "${workingDir}/.csm-setup.sh"`, hostName);
  }

  // Create detached tmux session with claude + terminal windows, but don't launch claude yet
  // so env vars can be exported into the claude window shell first.
  // The pm window is added later by startSessionPM().
  const command = `tmux new-session -d -s ${sessionName} -c "${workingDir}" -n claude && tmux new-window -t ${sessionName} -n terminal -c "${workingDir}" && tmux select-window -t ${sessionName}:claude`;
  const result = await exec(command, hostName);

  if (result.success) {
    // Inject environment variables into tmux session and both windows
    if (project?.envVars) {
      for (const [key, value] of Object.entries(project.envVars)) {
        const escapedValue = value.replace(/"/g, '\\"');
        // Set on session level for future windows/panes
        await exec(`tmux set-environment -t ${sessionName} ${key} "${escapedValue}"`, hostName);
        // Export into both existing windows
        const shellEscaped = value.replace(/'/g, "'\\''");
        await exec(`tmux send-keys -t ${sessionName}:claude 'export ${key}='"'"'${shellEscaped}'"'"'' Enter`, hostName);
        await exec(`tmux send-keys -t ${sessionName}:terminal 'export ${key}='"'"'${shellEscaped}'"'"'' Enter`, hostName);
      }
    }

    // Now launch claude (env vars are already in the shell)
    await exec(`tmux send-keys -t ${sessionName}:claude 'claude' Enter`, hostName);

    // Auto-accept trust dialog for worktree (background watcher)
    // Start immediately, don't await (runs in background)
    if (!hostName) {
      autoAcceptClaudeTrust(sessionName, 'claude').catch(() => {}); // Non-blocking
    }

    await runSetupScript(sessionName, workingDir, hostName);

    // Start per-session PM (adds :pm window with its own Claude instance)
    if (!hostName) {
      try {
        // Gather context for PM template
        const branchResult = await exec(`git -C "${workingDir}" branch --show-current 2>/dev/null`);
        const gitBranch = branchResult.success ? branchResult.stdout.trim() : undefined;

        await startSessionPM(name, workingDir, {
          projectName: project?.name,
          repoPath: project?.repoPath,
          linearIssue: linearIssue?.identifier,
          gitBranch,
        });
      } catch (err) {
        // Non-fatal: session works without PM
        console.error(`Warning: Failed to start session PM: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  return result;
}

export async function runSetupScript(
  sessionName: string,
  workingDir: string,
  hostName?: string
): Promise<boolean> {
  const checkResult = await exec(`test -f "${workingDir}/.csm-setup.sh"`, hostName);
  if (!checkResult.success) {
    return false;
  }

  await exec(`tmux send-keys -t ${sessionName}:terminal 'bash .csm-setup.sh' Enter`, hostName);
  return true;
}

export async function renameSession(
  oldName: string,
  newName: string,
  hostName?: string
): Promise<CommandResult> {
  // Check new name doesn't already exist
  if (await sessionExists(newName, hostName)) {
    return {
      success: false,
      stdout: "",
      stderr: `Session "${newName}" already exists`,
      exitCode: 1,
    };
  }

  const oldSessionName = getSessionName(oldName);
  const newSessionName = getSessionName(newName);

  // Rename tmux session
  const result = await exec(
    `tmux rename-session -t ${oldSessionName} ${newSessionName}`,
    hostName
  );
  if (!result.success) {
    return result;
  }

  // Rename worktree directory
  const { renameWorktree } = await import("./worktree");
  const renameResult = await renameWorktree(oldName, newName, hostName);
  if (!renameResult.success) {
    // Try to rollback tmux rename
    await exec(`tmux rename-session -t ${newSessionName} ${oldSessionName}`, hostName);
    return renameResult;
  }

  return result;
}

export async function killSession(
  name: string,
  hostName?: string
): Promise<CommandResult> {
  const sessionName = getSessionName(name);
  return exec(`tmux kill-session -t ${sessionName}`, hostName);
}

export async function sendToSession(name: string, text: string, hostName?: string): Promise<CommandResult> {
  const sessionName = getSessionName(name);
  // Escape single quotes for shell safety
  const escaped = text.replace(/'/g, "'\\''");
  return exec(`tmux send-keys -t ${sessionName} -l '${escaped}' && tmux send-keys -t ${sessionName} Enter`, hostName);
}

export async function attachSession(name: string): Promise<void> {
  const sessionName = getSessionName(name);

  const proc = Bun.spawn(["tmux", "attach", "-t", sessionName], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}

/**
 * Background watcher that auto-accepts Claude's trust dialog.
 * Monitors tmux pane output and sends "1\n" when trust prompt appears.
 */
export async function autoAcceptClaudeTrust(sessionName: string, windowName: string): Promise<void> {
  const fullSession = getSessionName(sessionName);
  const target = `${fullSession}:${windowName}`;
  
  // Write watcher script to temp file and execute in background
  const scriptPath = `/tmp/csm-trust-watcher-${sessionName}-${windowName}.sh`;
  const watcherScript = `#!/bin/bash
sleep 1
for i in {1..60}; do
  OUTPUT=$(tmux capture-pane -t ${target} -p 2>/dev/null || echo "")
  if echo "$OUTPUT" | grep -qi "trust this folder"; then
    sleep 0.3
    tmux send-keys -t ${target} "1" 2>/dev/null || true
    sleep 0.2
    tmux send-keys -t ${target} Enter 2>/dev/null || true
    rm -f ${scriptPath}
    exit 0
  fi
  sleep 0.5
done
rm -f ${scriptPath}
`;
  
  try {
    // Write script file
    await Bun.write(scriptPath, watcherScript);
    await exec(`chmod +x ${scriptPath}`);
    // Execute in background (no await - fire and forget)
    exec(`${scriptPath} >/dev/null 2>&1 &`);
  } catch {
    // Ignore errors - non-critical background task
  }
}
