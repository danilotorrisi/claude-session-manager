export interface HostConfig {
  host: string;
  defaultRepo?: string;
}

export interface Config {
  defaultRepo?: string;
  worktreeBase: string;
  hosts: Record<string, HostConfig>;
}

export interface Session {
  name: string;
  fullName: string;
  attached: boolean;
  windows: number;
  created: string;
  worktreePath?: string;
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
