// Types ported from src/types.ts and src/worker/types.ts
// Pure TS — no Bun/Node deps

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description?: string;
  state?: string;
  stateType?: string;
  stateId?: string;
  teamId?: string;
  priority?: number;
}

export interface GitStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  fileChanges?: GitFileChange[];
}

export interface GitFileChange {
  file: string;
  insertions: number;
  deletions: number;
  status: "modified" | "added" | "deleted" | "renamed";
  source?: "uncommitted" | "committed";
}

export interface FeedbackReport {
  url: string;
  timestamp: string;
}

export type ClaudeState = "idle" | "working" | "waiting_for_input";

export interface Session {
  name: string;
  fullName: string;
  attached: boolean;
  windows: number;
  created: string;
  host?: string;
  worktreePath?: string;
  title?: string;
  claudeState?: ClaudeState;
  claudeLastMessage?: string;
  linearIssue?: LinearIssue;
  projectName?: string;
  gitStats?: GitStats;
  feedbackReports?: FeedbackReport[];
  archived?: boolean;
  mergedAt?: string;
  workerId?: string;
  lastUpdate?: string;
  sessionName?: string;
}

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
  hostname: string;
  os: string;
  uptime: string;
  ramUsage?: string;
  arch: string;
  cpuCount: number;
}

export interface WorkerEvent {
  type: WorkerEventType;
  timestamp: string;
  workerId: string;
  sessionName?: string;
  data?: {
    hostInfo?: WorkerHostInfo;
    worktreePath?: string;
    projectName?: string;
    linearIssue?: LinearIssue;
    claudeState?: ClaudeState;
    claudeLastMessage?: string;
    gitStats?: GitStats;
    reason?: string;
    sessionCount?: number;
  };
}

export type WorkerStatus = "online" | "stale" | "offline";

export interface Worker {
  id: string;
  status: WorkerStatus;
  lastHeartbeat: string;
  registeredAt: string;
  sessionCount: number;
  hostInfo?: WorkerHostInfo;
}

export interface HealthResponse {
  status: string;
  workers: number;
  sessions: number;
  events: number;
}

export interface StateResponse {
  workers: Array<{ id: string; lastHeartbeat: string; sessionCount: number; hostInfo?: WorkerHostInfo; registeredAt: string }>;
  sessions: Session[];
  recentEvents: WorkerEvent[];
}

export interface EventsResponse {
  events: WorkerEvent[];
  hasMore: boolean;
  total: number;
}

export interface WorkersResponse {
  workers: Worker[];
}
