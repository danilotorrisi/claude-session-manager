import type { Session, CommandResult } from "../types";
import { exec } from "./ssh";

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
    'tmux list-sessions -F "#{session_name}|#{session_attached}|#{session_windows}|#{session_created}" 2>/dev/null || true',
    hostName
  );

  if (!result.stdout) {
    return [];
  }

  const sessions: Session[] = [];
  const lines = result.stdout.split("\n").filter(Boolean);

  for (const line of lines) {
    const [fullName, attached, windows, created] = line.split("|");
    const name = parseSessionName(fullName);

    if (name) {
      sessions.push({
        name,
        fullName,
        attached: attached === "1",
        windows: parseInt(windows, 10),
        created: new Date(parseInt(created, 10) * 1000).toISOString(),
      });
    }
  }

  return sessions;
}

export async function sessionExists(
  name: string,
  hostName?: string
): Promise<boolean> {
  const sessionName = getSessionName(name);
  const result = await exec(`tmux has-session -t ${sessionName} 2>/dev/null`, hostName);
  return result.success;
}

export async function createSession(
  name: string,
  workingDir: string,
  hostName?: string
): Promise<CommandResult> {
  const sessionName = getSessionName(name);

  // Create detached tmux session with a login shell, then run claude
  // Using a login shell ensures proper environment (PATH, etc.)
  // The shell stays open if claude exits, allowing debugging
  const command = `tmux new-session -d -s ${sessionName} -c "${workingDir}" && tmux send-keys -t ${sessionName} 'claude' Enter`;
  return exec(command, hostName);
}

export async function killSession(
  name: string,
  hostName?: string
): Promise<CommandResult> {
  const sessionName = getSessionName(name);
  return exec(`tmux kill-session -t ${sessionName}`, hostName);
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
