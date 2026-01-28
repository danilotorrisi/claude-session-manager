import { homedir } from "os";
import { join } from "path";
import type { Config, HostConfig } from "../types";

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
    return host?.defaultRepo || config.defaultRepo;
  }
  return config.defaultRepo;
}

export async function getWorktreeBase(): Promise<string> {
  const config = await loadConfig();
  return config.worktreeBase;
}

export { CONFIG_DIR, CONFIG_FILE };
