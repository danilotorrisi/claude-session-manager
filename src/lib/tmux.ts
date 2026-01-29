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

export async function writeClaudeContext(
  workingDir: string,
  issue: LinearIssue,
  hostName?: string
): Promise<void> {
  const lines = [
    `# Linear Issue: ${issue.identifier}`,
    `**Title:** ${issue.title}`,
    ...(issue.state ? [`**Status:** ${issue.state}`] : []),
    `**URL:** ${issue.url}`,
    "",
  ];

  if (issue.description) {
    lines.push("## Description", issue.description, "");
  }

  lines.push(
    'When the user refers to "the issue", "the card", "the bug", or "the task", they are referring to this Linear issue.'
  );

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

  // Write CLAUDE.md with Linear issue context if provided
  if (linearIssue) {
    await writeClaudeContext(workingDir, linearIssue, hostName);
  }

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
