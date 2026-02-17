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
  projectsBase?: string;
}

export interface Project {
  name: string;
  repoPath: string;
  setupScript?: string;
  envVars?: Record<string, string>;
  runScripts?: Record<string, string>;
}

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl?: string;
}

export interface ClaudeSettingsConfig {
  allowedTools?: string[];
  denyPatterns?: string[];
}

export interface ApiToken {
  token: string;
  name: string;
  created: string;
  lastUsed?: string;
}

export interface ToolApprovalRule {
  tool: string;         // Tool name to match (e.g., "Bash", "Read", "*" for any)
  pattern?: string;     // Optional glob pattern matched against primary input
  action: 'allow' | 'deny' | 'ask';
}

export interface Config {
  defaultRepo?: string;
  worktreeBase: string;
  hosts: Record<string, HostConfig>;
  linearApiKey?: string;
  projects?: Project[];
  projectsBase?: string;
  r2?: R2Config;
  feedbackEnabled?: boolean;
  claudeSettings?: ClaudeSettingsConfig;
  apiPort?: number; // Default: 3000
  apiTokens?: ApiToken[];
  toolApprovalRules?: ToolApprovalRule[];
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
  status: 'modified' | 'added' | 'deleted' | 'renamed';
  source?: 'uncommitted' | 'committed';
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
  host?: string;
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
  project?: string;
  effort?: 'low' | 'medium' | 'high';
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

