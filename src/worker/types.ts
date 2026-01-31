import type { Session, GitStats, LinearIssue } from "../types";

export type WorkerEventType =
  | "session_created"
  | "session_attached"
  | "session_detached"
  | "session_killed"
  | "claude_state_changed"
  | "git_changes"
  | "heartbeat";

export interface WorkerEvent {
  type: WorkerEventType;
  timestamp: string;
  workerId: string;
  sessionName?: string;
  data?: {
    // session_created
    worktreePath?: string;
    projectName?: string;
    linearIssue?: LinearIssue;

    // claude_state_changed
    claudeState?: "idle" | "working" | "waiting_for_input";
    claudeLastMessage?: string;

    // git_changes
    gitStats?: GitStats;

    // session_killed
    reason?: string;

    // heartbeat
    sessionCount?: number;
  };
}

export interface WorkerState {
  workerId: string;
  sessions: Map<string, Session>;
  lastHeartbeat: string;
  eventQueue: WorkerEvent[];
}

export interface WorkerConfig {
  workerId: string;
  masterUrl?: string; // CSM Master API URL (if available)
  stateFile: string;
  pollInterval: number; // ms between tmux polls
  heartbeatInterval: number; // ms between heartbeats
}
