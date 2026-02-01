import { homedir } from "os";
import { basename, join } from "path";
import type { Config, HostConfig, Project, R2Config } from "../types";

export function expandTilde(filepath: string): string {
  if (filepath === "~") return homedir();
  if (filepath.startsWith("~/")) return join(homedir(), filepath.slice(2));
  return filepath;
}

export function isRelativePath(path: string): boolean {
  return !path.startsWith("/") && !path.startsWith("~");
}

export function getProjectsBase(config: Config, hostName?: string): string | undefined {
  if (hostName) {
    const host = config.hosts[hostName];
    // For remote hosts, prefer host-specific projectsBase, then fall back to
    // the host's defaultRepo (not the global projectsBase, which is a local path).
    return host?.projectsBase || host?.defaultRepo;
  }
  return config.projectsBase;
}

export function resolveProjectPath(repoPath: string, config: Config, hostName?: string): string {
  if (!isRelativePath(repoPath)) {
    // For remote hosts, an absolute local path won't exist on the remote.
    // Extract the repo name and combine with the remote host's projectsBase.
    if (hostName) {
      const remoteBase = getProjectsBase(config, hostName);
      if (remoteBase) {
        const repoName = basename(expandTilde(repoPath));
        return join(expandTilde(remoteBase), repoName);
      }
    }
    return expandTilde(repoPath);
  }
  const base = getProjectsBase(config, hostName);
  if (base) {
    return join(expandTilde(base), repoPath);
  }
  // No projectsBase set, treat as-is (expandTilde is a no-op for relative paths)
  return repoPath;
}

export function migrateProjectPaths(config: Config): boolean {
  const base = config.projectsBase;
  if (!base || !config.projects?.length) return false;

  const expandedBase = expandTilde(base);
  const prefix = expandedBase.endsWith("/") ? expandedBase : expandedBase + "/";
  let changed = false;

  for (const project of config.projects) {
    if (!isRelativePath(project.repoPath)) {
      const expandedPath = expandTilde(project.repoPath);
      if (expandedPath.startsWith(prefix)) {
        project.repoPath = expandedPath.slice(prefix.length);
        changed = true;
      }
    }
  }

  return changed;
}

export function normalizeProjectPath(repoPath: string, config: Config): string {
  const base = config.projectsBase;
  if (!base) return repoPath;

  const expandedBase = expandTilde(base);
  const prefix = expandedBase.endsWith("/") ? expandedBase : expandedBase + "/";
  const expandedPath = expandTilde(repoPath);

  if (expandedPath.startsWith(prefix)) {
    return expandedPath.slice(prefix.length);
  }
  return repoPath;
}

const CONFIG_DIR = join(homedir(), ".config", "csm");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

const DEFAULT_CONFIG: Config = {
  worktreeBase: "/tmp/csm-worktrees",
  hosts: {},
};

export async function loadConfig(): Promise<Config> {
  try {
    const file = Bun.file(CONFIG_FILE);
    if (await file.exists()) {
      const config = { ...DEFAULT_CONFIG, ...(await file.json()) };
      if (migrateProjectPaths(config)) {
        await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
      }
      return config;
    }
  } catch {
    // Config doesn't exist or is invalid, use defaults
  }
  return DEFAULT_CONFIG;
}

export async function saveConfig(config: Config): Promise<void> {
  await Bun.write(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export async function ensureConfigDir(): Promise<void> {
  const fs = await import("fs/promises");
  await fs.mkdir(CONFIG_DIR, { recursive: true });
}

export async function getHost(hostName: string): Promise<HostConfig | null> {
  const config = await loadConfig();
  return config.hosts[hostName] || null;
}

export async function getDefaultRepo(hostName?: string): Promise<string | undefined> {
  const config = await loadConfig();
  if (hostName) {
    const host = config.hosts[hostName];
    const repo = host?.defaultRepo || config.defaultRepo;
    return repo ? expandTilde(repo) : repo;
  }
  return config.defaultRepo ? expandTilde(config.defaultRepo) : config.defaultRepo;
}

export async function getWorktreeBase(): Promise<string> {
  const config = await loadConfig();
  return expandTilde(config.worktreeBase);
}

export async function getLinearApiKey(): Promise<string | undefined> {
  const config = await loadConfig();
  return config.linearApiKey;
}

export async function getProjects(): Promise<Project[]> {
  const config = await loadConfig();
  return config.projects || [];
}

export async function addProject(project: Project): Promise<void> {
  const config = await loadConfig();
  const normalized = { ...project, repoPath: normalizeProjectPath(project.repoPath, config) };
  const projects = config.projects || [];
  // Replace if same name exists
  const filtered = projects.filter((p) => p.name !== normalized.name);
  filtered.push(normalized);
  config.projects = filtered;
  await saveConfig(config);
}

export async function deleteProject(name: string): Promise<void> {
  const config = await loadConfig();
  config.projects = (config.projects || []).filter((p) => p.name !== name);
  await saveConfig(config);
}

const HOSTS_DEPRECATION_MSG =
  "[Deprecated] Static host configuration (config.hosts) is deprecated. " +
  "Use `csm worker start` on remote machines instead. " +
  "Workers register automatically with the master server.";

let hostsDeprecationWarned = false;

/**
 * Log a deprecation warning if config.hosts has entries.
 * Only warns once per process to avoid spam.
 */
export function warnHostsDeprecation(hosts: Record<string, HostConfig>): void {
  if (hostsDeprecationWarned) return;
  if (Object.keys(hosts).length > 0) {
    hostsDeprecationWarned = true;
    console.warn(HOSTS_DEPRECATION_MSG);
  }
}

export async function getHosts(): Promise<Record<string, HostConfig>> {
  const config = await loadConfig();
  return config.hosts;
}

/** @deprecated Use `csm worker start` on remote machines instead. */
export async function addHost(name: string, hostConfig: HostConfig): Promise<void> {
  const config = await loadConfig();
  config.hosts[name] = hostConfig;
  await saveConfig(config);
}

/** @deprecated Use `csm worker start` on remote machines instead. */
export async function updateHost(name: string, hostConfig: HostConfig): Promise<void> {
  const config = await loadConfig();
  config.hosts[name] = hostConfig;
  await saveConfig(config);
}

/** @deprecated Use `csm worker start` on remote machines instead. */
export async function deleteHost(name: string): Promise<void> {
  const config = await loadConfig();
  delete config.hosts[name];
  await saveConfig(config);
}

/** @deprecated Use `csm worker start` on remote machines instead. */
export async function renameHost(oldName: string, newName: string): Promise<void> {
  const config = await loadConfig();
  const hostConfig = config.hosts[oldName];
  if (hostConfig) {
    delete config.hosts[oldName];
    config.hosts[newName] = hostConfig;
    await saveConfig(config);
  }
}

export async function renameProject(oldName: string, newName: string): Promise<void> {
  const config = await loadConfig();
  const projects = config.projects || [];
  const project = projects.find((p) => p.name === oldName);
  if (project) {
    project.name = newName;
    await saveConfig(config);
  }
}

export async function updateProject(oldName: string, updated: Project): Promise<void> {
  const config = await loadConfig();
  const normalized = { ...updated, repoPath: normalizeProjectPath(updated.repoPath, config) };
  const projects = config.projects || [];
  const idx = projects.findIndex((p) => p.name === oldName);
  if (idx >= 0) {
    projects[idx] = normalized;
  } else {
    projects.push(normalized);
  }
  config.projects = projects;
  await saveConfig(config);
}

export interface ArchivedSession {
  name: string;
  branchName: string;
  repoPath: string;
  projectName?: string;
  linearIssue?: import("../types").LinearIssue;
  createdAt: string;
  mergedAt: string;
  archivedAt: string;
}

const ARCHIVED_FILE = join(CONFIG_DIR, "archived.json");

export async function saveArchivedSession(session: ArchivedSession): Promise<void> {
  let archived: ArchivedSession[] = [];
  try {
    const file = Bun.file(ARCHIVED_FILE);
    if (await file.exists()) {
      archived = await file.json();
    }
  } catch {
    // ignore
  }
  archived.push(session);
  await ensureConfigDir();
  await Bun.write(ARCHIVED_FILE, JSON.stringify(archived, null, 2));
}

export async function getR2Config(): Promise<R2Config | undefined> {
  const config = await loadConfig();
  return config.r2;
}

export async function saveR2Config(r2Config: R2Config): Promise<void> {
  const config = await loadConfig();
  config.r2 = r2Config;
  await saveConfig(config);
}

export async function isFeedbackEnabled(): Promise<boolean> {
  const config = await loadConfig();
  return config.feedbackEnabled ?? false;
}

export async function setFeedbackEnabled(enabled: boolean): Promise<void> {
  const config = await loadConfig();
  config.feedbackEnabled = enabled;
  await saveConfig(config);
}

export { CONFIG_DIR, CONFIG_FILE };
