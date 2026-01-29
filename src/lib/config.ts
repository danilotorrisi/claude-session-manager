import { homedir } from "os";
import { join } from "path";
import type { Config, HostConfig, Project } from "../types";

export function expandTilde(filepath: string): string {
  if (filepath === "~") return homedir();
  if (filepath.startsWith("~/")) return join(homedir(), filepath.slice(2));
  return filepath;
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
      const content = await file.json();
      return { ...DEFAULT_CONFIG, ...content };
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
  const projects = config.projects || [];
  // Replace if same name exists
  const filtered = projects.filter((p) => p.name !== project.name);
  filtered.push(project);
  config.projects = filtered;
  await saveConfig(config);
}

export async function deleteProject(name: string): Promise<void> {
  const config = await loadConfig();
  config.projects = (config.projects || []).filter((p) => p.name !== name);
  await saveConfig(config);
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

export async function getHosts(): Promise<Record<string, HostConfig>> {
  const config = await loadConfig();
  return config.hosts;
}

export async function addHost(name: string, hostConfig: HostConfig): Promise<void> {
  const config = await loadConfig();
  config.hosts[name] = hostConfig;
  await saveConfig(config);
}

export async function updateHost(name: string, hostConfig: HostConfig): Promise<void> {
  const config = await loadConfig();
  config.hosts[name] = hostConfig;
  await saveConfig(config);
}

export async function deleteHost(name: string): Promise<void> {
  const config = await loadConfig();
  delete config.hosts[name];
  await saveConfig(config);
}

export { CONFIG_DIR, CONFIG_FILE };
