import { readdirSync, readFileSync, realpathSync, unlinkSync } from "fs";
import { join } from "path";

const STATE_DIR = "/tmp/csm-claude-state";
const STALE_THRESHOLD_MS = 60_000; // 60 seconds

export interface ClaudeStateInfo {
  state: "idle" | "working" | "waiting_for_input";
  event: string;
  cwd: string;
  timestamp: number;
  transcriptPath?: string;
}

function normalizePath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    // If path doesn't exist, manually resolve /tmp -> /private/tmp on macOS
    if (p.startsWith("/tmp/")) {
      return "/private" + p;
    }
    return p;
  }
}

export function readClaudeStates(): Map<string, ClaudeStateInfo> {
  const states = new Map<string, ClaudeStateInfo>();

  let files: string[];
  try {
    files = readdirSync(STATE_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    return states;
  }

  const now = Math.floor(Date.now() / 1000);

  for (const file of files) {
    try {
      const content = readFileSync(join(STATE_DIR, file), "utf-8");
      const info: ClaudeStateInfo = JSON.parse(content);

      // Handle staleness: if state is "working" but file is old, treat as idle
      if (info.state === "working" && now - info.timestamp > STALE_THRESHOLD_MS / 1000) {
        info.state = "idle";
      }

      // Normalize the cwd for matching
      const normalizedCwd = normalizePath(info.cwd);
      states.set(normalizedCwd, info);
    } catch {
      // Skip malformed files
    }
  }

  return states;
}

export function getLastAssistantMessage(transcriptPath: string, maxLength = 2000): string | undefined {
  try {
    const content = readFileSync(transcriptPath, "utf-8");
    const lines = content.split("\n").filter(Boolean);

    // Iterate backwards to find the last assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (
          entry.type === "assistant" &&
          entry.message?.role === "assistant" &&
          Array.isArray(entry.message.content)
        ) {
          // Find text blocks in content
          for (let j = entry.message.content.length - 1; j >= 0; j--) {
            const block = entry.message.content[j];
            if (block.type === "text" && block.text) {
              const text = block.text.trim();
              if (text.length > maxLength) {
                return text.slice(0, maxLength - 3) + "...";
              }
              return text;
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File not found or unreadable
  }
  return undefined;
}

export function cleanupStateFile(sessionName: string): void {
  const stateDir = STATE_DIR;

  try {
    const files = readdirSync(stateDir).filter((f: string) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const content = readFileSync(join(stateDir, file), "utf-8");
        const info = JSON.parse(content);
        const normalizedCwd = normalizePath(info.cwd);
        // Match by session name in the worktree path
        if (normalizedCwd.includes(`/csm-worktrees/${sessionName}`)) {
          unlinkSync(join(stateDir, file));
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // State dir may not exist
  }
}
