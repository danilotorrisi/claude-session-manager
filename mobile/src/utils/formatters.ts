import type { ClaudeState, GitStats, WorkerEventType } from "../types";

export function relativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  if (diff < 0) return "just now";

  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatGitStats(stats: GitStats): string {
  const parts: string[] = [];
  parts.push(`${stats.filesChanged} file${stats.filesChanged !== 1 ? "s" : ""}`);
  if (stats.insertions > 0) parts.push(`+${stats.insertions}`);
  if (stats.deletions > 0) parts.push(`-${stats.deletions}`);
  return parts.join("  ");
}

export function claudeStateLabel(state?: ClaudeState): string {
  switch (state) {
    case "idle":
      return "Idle";
    case "working":
      return "Working";
    case "waiting_for_input":
      return "Waiting";
    default:
      return "Unknown";
  }
}

export function eventTypeDescription(type: WorkerEventType): string {
  switch (type) {
    case "worker_registered":
      return "Worker registered";
    case "worker_deregistered":
      return "Worker deregistered";
    case "session_created":
      return "Session created";
    case "session_attached":
      return "Session attached";
    case "session_detached":
      return "Session detached";
    case "session_killed":
      return "Session killed";
    case "claude_state_changed":
      return "State changed";
    case "git_changes":
      return "Git changes";
    case "heartbeat":
      return "Heartbeat";
    default:
      return type;
  }
}

export function eventTypeIcon(type: WorkerEventType): string {
  switch (type) {
    case "worker_registered":
      return "server";
    case "worker_deregistered":
      return "cloud-off-outline";
    case "session_created":
      return "plus-circle-outline";
    case "session_attached":
      return "link";
    case "session_detached":
      return "link-off";
    case "session_killed":
      return "close-circle-outline";
    case "claude_state_changed":
      return "swap-horizontal";
    case "git_changes":
      return "git-commit";
    case "heartbeat":
      return "heart-pulse";
    default:
      return "information-outline";
  }
}

export function priorityLabel(priority?: number): string {
  switch (priority) {
    case 0:
      return "No priority";
    case 1:
      return "Urgent";
    case 2:
      return "High";
    case 3:
      return "Medium";
    case 4:
      return "Low";
    default:
      return "";
  }
}

export function fileStatusIcon(status: string): string {
  switch (status) {
    case "added":
      return "+";
    case "deleted":
      return "−";
    case "renamed":
      return "→";
    default:
      return "~";
  }
}
