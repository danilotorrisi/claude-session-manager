import type { Session, GitStats, LinearIssue } from "../types";

export type WorkerEventType =
  | "worker_registered"
  | "worker_deregistered"
  | "session_created"
  | "session_attached"
  | "session_detached"
  | "session_killed"
  | "claude_state_changed"
  | "git_changes"
  | "heartbeat";

export interface WorkerHostInfo {
  hostname: string;   // os.hostname() — used by TUI for "local" matching
  os: string;         // "macOS 15.3", "Ubuntu 24.04"
  uptime: string;     // "up 5 days", "up 2h 30m"
  ramUsage?: string;  // "12.4/32.0 GB"
  arch: string;       // "arm64", "x86_64"
  cpuCount: number;
}

export interface WorkerEvent {
  type: WorkerEventType;
  timestamp: string;
  workerId: string;
  sessionName?: string;
  data?: {
    // worker_registered / heartbeat
    hostInfo?: WorkerHostInfo;

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
