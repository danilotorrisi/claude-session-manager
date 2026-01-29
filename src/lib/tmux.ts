import type { Session, CommandResult, LinearIssue, GitStats } from "../types";
import { exec } from "./ssh";
import { readClaudeStates, getLastAssistantMessage } from "./claude-state";
import { getWorktreePath, loadSessionMetadata } from "./worktree";
import { realpathSync } from "fs";

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
  const claudeStates = readClaudeStates();
  for (const session of sessions) {
    try {
      const wtPath = await getWorktreePath(session.name);
      let normalizedPath: string;
      try {
        normalizedPath = realpathSync(wtPath);
      } catch {
        normalizedPath = wtPath.startsWith("/tmp/") ? "/private" + wtPath : wtPath;
      }
      session.worktreePath = wtPath;
      const stateInfo = claudeStates.get(normalizedPath);
      if (stateInfo) {
        session.claudeState = stateInfo.state;
        if (stateInfo.transcriptPath) {
          session.claudeLastMessage = getLastAssistantMessage(stateInfo.transcriptPath);
        }
      }
      session.gitStats = await getGitStats(wtPath);
    } catch {
      // Skip state enrichment on error
    }

    try {
      const metadata = await loadSessionMetadata(session.name);
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

async function getGitStats(worktreePath: string): Promise<GitStats | undefined> {
  try {
    const result = await exec(
      `git -C "${worktreePath}" diff --stat HEAD 2>/dev/null | tail -1`
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

  lines.push("", FEEDBACK_PROTOCOL);

  const content = lines.join("\n");
  const escaped = content.replace(/'/g, "'\\''");
  await exec(`echo '${escaped}' > "${workingDir}/CLAUDE.md"`, hostName);
}

export async function createSession(
  name: string,
  workingDir: string,
  hostName?: string,
  linearIssue?: LinearIssue
): Promise<CommandResult> {
  const sessionName = getSessionName(name);

  // Write CLAUDE.md with feedback protocol (and Linear issue context if provided)
  await writeClaudeContext(workingDir, linearIssue, hostName);

  // Create detached tmux session with a login shell, then run claude
  // Using a login shell ensures proper environment (PATH, etc.)
  // The shell stays open if claude exits, allowing debugging
  const command = `tmux new-session -d -s ${sessionName} -c "${workingDir}" -n claude && tmux send-keys -t ${sessionName}:claude 'claude' Enter && tmux new-window -t ${sessionName} -n terminal -c "${workingDir}" && tmux select-window -t ${sessionName}:claude`;
  const result = await exec(command, hostName);

  if (result.success) {
    await runSetupScript(sessionName, workingDir, hostName);
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

export async function killSession(
  name: string,
  hostName?: string
): Promise<CommandResult> {
  const sessionName = getSessionName(name);
  return exec(`tmux kill-session -t ${sessionName}`, hostName);
}

export async function sendToSession(name: string, text: string): Promise<CommandResult> {
  const sessionName = getSessionName(name);
  // Escape single quotes for shell safety
  const escaped = text.replace(/'/g, "'\\''");
  return exec(`tmux send-keys -t ${sessionName} -l '${escaped}' && tmux send-keys -t ${sessionName} Enter`);
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
