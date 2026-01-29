export interface LinearIssue {
  id: string;           // Linear UUID
  identifier: string;   // e.g. "ENG-123"
  title: string;
  url: string;
  description?: string;
  state?: string;       // e.g. "In Progress"
  stateType?: string;   // e.g. "started", "unstarted", "backlog", "completed", "canceled"
  stateId?: string;     // Linear state UUID
  teamId?: string;      // Linear team UUID
  priority?: number;
}

export interface HostConfig {
  host: string;
  defaultRepo?: string;
}

export interface Project {
  name: string;
  repoPath: string;
}

export interface Config {
  defaultRepo?: string;
  worktreeBase: string;
  hosts: Record<string, HostConfig>;
  linearApiKey?: string;
  projects?: Project[];
}

export interface GitStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface FeedbackReport {
  url: string;
  timestamp: string;
}

export interface Session {
  name: string;
  fullName: string;
  attached: boolean;
  windows: number;
  created: string;
  worktreePath?: string;
  title?: string; // Claude Code session title (from tmux pane_title)
  claudeState?: "idle" | "working" | "waiting_for_input";
  claudeLastMessage?: string;
  linearIssue?: LinearIssue;
  projectName?: string;
  gitStats?: GitStats;
  feedbackReports?: FeedbackReport[];
  archived?: boolean;
  mergedAt?: string;
}

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface CreateOptions {
  repo?: string;
  host?: string;
}

export interface ListOptions {
  host?: string;
}

export interface AttachOptions {
  host?: string;
}

export interface KillOptions {
  host?: string;
  deleteBranch?: boolean;
}
