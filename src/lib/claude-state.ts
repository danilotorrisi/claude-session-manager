import { readdirSync, readFileSync, realpathSync, statSync, unlinkSync } from "fs";
import { join } from "path";
import { exec } from "./ssh";

const STATE_DIR = "/tmp/csm-claude-state";
const STALE_THRESHOLD_MS = 60_000; // 60 seconds
const WAITING_STALE_THRESHOLD_MS = 120_000; // 2 minutes
const TRANSCRIPT_ACTIVE_THRESHOLD_MS = 10_000; // 10 seconds
const MERGE_TIMESTAMP_THRESHOLD_S = 5; // 5 seconds

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

const STATE_PRIORITY: Record<string, number> = {
  waiting_for_input: 2,
  working: 1,
  idle: 0,
};

function getFileMtimeSeconds(filePath: string): number | null {
  try {
    const stat = statSync(filePath);
    return Math.floor(stat.mtimeMs / 1000);
  } catch {
    return null;
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

      // Handle waiting_for_input staleness with transcript fallback
      if (
        info.state === "waiting_for_input" &&
        now - info.timestamp > WAITING_STALE_THRESHOLD_MS / 1000
      ) {
        if (info.transcriptPath) {
          const transcriptMtime = getFileMtimeSeconds(info.transcriptPath);
          if (transcriptMtime !== null && transcriptMtime > info.timestamp) {
            // Transcript was modified after state was set — Claude likely continued
            info.state = "working";
          } else {
            info.state = "idle";
          }
        } else {
          info.state = "idle";
        }
      }

      // Normalize the cwd for matching
      const normalizedCwd = normalizePath(info.cwd);

      // When multiple sessions share the same cwd (e.g. parent + subagents),
      // merge states carefully to avoid subagent interference.
      const existing = states.get(normalizedCwd);
      if (existing) {
        const existingPriority = STATE_PRIORITY[existing.state] ?? 0;
        const newPriority = STATE_PRIORITY[info.state] ?? 0;
        const bothActive = existingPriority > 0 && newPriority > 0;
        const timestampDiff = Math.abs(info.timestamp - existing.timestamp);

        if (bothActive && timestampDiff > MERGE_TIMESTAMP_THRESHOLD_S) {
          // Both are active states with divergent timestamps — prefer the most recent
          if (info.timestamp > existing.timestamp) {
            states.set(normalizedCwd, info);
          }
        } else if (newPriority > existingPriority) {
          states.set(normalizedCwd, info);
        } else if (newPriority === existingPriority && info.timestamp > existing.timestamp) {
          states.set(normalizedCwd, info);
        }
        // Otherwise keep existing
      } else {
        states.set(normalizedCwd, info);
      }
    } catch {
      // Skip malformed files
    }
  }

  // Post-processing: transcript mtime fallback for idle states
  for (const [cwd, info] of states) {
    if (info.state === "idle" && info.transcriptPath) {
      const transcriptMtime = getFileMtimeSeconds(info.transcriptPath);
      if (transcriptMtime !== null && now - transcriptMtime < TRANSCRIPT_ACTIVE_THRESHOLD_MS / 1000) {
        info.state = "working";
        states.set(cwd, info);
      }
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

export async function readRemoteClaudeStates(hostName: string): Promise<Map<string, ClaudeStateInfo>> {
  const states = new Map<string, ClaudeStateInfo>();

  // Read all state files in one SSH call
  const result = await exec(
    `for f in ${STATE_DIR}/*.json; do [ -f "$f" ] && cat "$f" && echo "---CSM_SEP---"; done 2>/dev/null`,
    hostName
  );

  if (!result.success || !result.stdout.trim()) {
    return states;
  }

  const now = Math.floor(Date.now() / 1000);
  const chunks = result.stdout.split("---CSM_SEP---").filter((c) => c.trim());

  for (const chunk of chunks) {
    try {
      const info: ClaudeStateInfo = JSON.parse(chunk.trim());

      if (info.state === "working" && now - info.timestamp > STALE_THRESHOLD_MS / 1000) {
        info.state = "idle";
      }
      if (info.state === "waiting_for_input" && now - info.timestamp > WAITING_STALE_THRESHOLD_MS / 1000) {
        info.state = "idle";
      }

      const cwd = info.cwd;
      const existing = states.get(cwd);
      if (existing) {
        const existingPriority = STATE_PRIORITY[existing.state] ?? 0;
        const newPriority = STATE_PRIORITY[info.state] ?? 0;
        if (newPriority > existingPriority || (newPriority === existingPriority && info.timestamp > existing.timestamp)) {
          states.set(cwd, info);
        }
      } else {
        states.set(cwd, info);
      }
    } catch {
      // Skip malformed
    }
  }

  return states;
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
