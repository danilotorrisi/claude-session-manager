import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { CommandResult } from "../types";
import { getHost } from "./config";

export async function execRemote(
  hostName: string,
  command: string
): Promise<CommandResult> {
  const hostConfig = await getHost(hostName);
  if (!hostConfig) {
    return {
      success: false,
      stdout: "",
      stderr: `Host '${hostName}' not found in config`,
      exitCode: 1,
    };
  }

  const escaped = command.replace(/'/g, "'\\''");
  const proc = Bun.spawn(["ssh", hostConfig.host, `bash -lc '${escaped}'`], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    success: exitCode === 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
  };
}

export async function execLocal(command: string): Promise<CommandResult> {
  const proc = Bun.spawn(["sh", "-c", command], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return {
    success: exitCode === 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
  };
}

export async function exec(
  command: string,
  hostName?: string
): Promise<CommandResult> {
  if (hostName) {
    return execRemote(hostName, command);
  }
  return execLocal(command);
}

export async function testConnection(
  hostName: string
): Promise<CommandResult & { latencyMs?: number }> {
  const hostConfig = await getHost(hostName);
  if (!hostConfig) {
    return {
      success: false,
      stdout: "",
      stderr: `Host '${hostName}' not found in config`,
      exitCode: 1,
    };
  }

  const start = Date.now();
  const proc = Bun.spawn(
    ["ssh", "-o", "ConnectTimeout=5", "-o", "BatchMode=yes", hostConfig.host, "echo ok"],
    { stdout: "pipe", stderr: "pipe" }
  );

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  const latencyMs = Date.now() - start;

  return {
    success: exitCode === 0,
    stdout: stdout.trim(),
    stderr: stderr.trim(),
    exitCode,
    latencyMs: exitCode === 0 ? latencyMs : undefined,
  };
}

export async function getHostInfo(
  hostName: string
): Promise<{ hostname: string; os: string; uptime: string; ramUsage?: string } | null> {
  const hostConfig = await getHost(hostName);
  if (!hostConfig) return null;

  const proc = Bun.spawn(
    [
      "ssh",
      "-o", "ConnectTimeout=5",
      "-o", "BatchMode=yes",
      hostConfig.host,
      "hostname; uname -s; uptime; (cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null || true); echo '---MEM---'; (free -m 2>/dev/null || vm_stat 2>/dev/null || true)",
    ],
    { stdout: "pipe", stderr: "pipe" }
  );

  const stdout = await new Response(proc.stdout).text();
  const exitCode = await proc.exited;
  if (exitCode !== 0) return null;

  // Split at the memory marker
  const [mainPart, memPart] = stdout.trim().split("---MEM---");
  const lines = mainPart.trim().split("\n");
  const hostname = lines[0] || "unknown";
  const kernel = lines[1] || "";
  const uptimeRaw = lines[2] || "";

  // Parse uptime - extract the "up X days, H:MM" part
  const uptimeMatch = uptimeRaw.match(/up\s+(.+?)(?:,\s+\d+\s+user|$)/);
  const uptime = uptimeMatch ? `up ${uptimeMatch[1].trim()}` : uptimeRaw.trim();

  // Parse OS info
  let os = kernel;
  const remaining = lines.slice(3).join("\n");
  if (kernel === "Linux") {
    const prettyMatch = remaining.match(/PRETTY_NAME="([^"]+)"/);
    if (prettyMatch) {
      os = prettyMatch[1];
    }
  } else if (kernel === "Darwin") {
    const nameMatch = remaining.match(/ProductName:\s*(.+)/);
    const versionMatch = remaining.match(/ProductVersion:\s*(.+)/);
    if (nameMatch && versionMatch) {
      os = `${nameMatch[1].trim()} ${versionMatch[1].trim()}`;
    } else {
      os = "macOS";
    }
  }

  // Parse RAM usage
  let ramUsage: string | undefined;
  if (memPart) {
    const memLines = memPart.trim();
    if (kernel === "Linux") {
      // free -m output: "Mem: total used free shared buff/cache available"
      const memMatch = memLines.match(/Mem:\s+(\d+)\s+(\d+)/);
      if (memMatch) {
        const totalMb = parseInt(memMatch[1], 10);
        const usedMb = parseInt(memMatch[2], 10);
        const totalGb = (totalMb / 1024).toFixed(1);
        const usedGb = (usedMb / 1024).toFixed(1);
        ramUsage = `${usedGb}/${totalGb} GB`;
      }
    } else if (kernel === "Darwin") {
      // vm_stat output: parse page size and page counts
      const pageSizeMatch = memLines.match(/page size of (\d+) bytes/);
      const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;
      const freeMatch = memLines.match(/Pages free:\s+(\d+)/);
      const activeMatch = memLines.match(/Pages active:\s+(\d+)/);
      const inactiveMatch = memLines.match(/Pages inactive:\s+(\d+)/);
      const wiredMatch = memLines.match(/Pages wired down:\s+(\d+)/);
      const speculativeMatch = memLines.match(/Pages speculative:\s+(\d+)/);
      const compressorMatch = memLines.match(/Pages occupied by compressor:\s+(\d+)/);

      if (activeMatch && wiredMatch) {
        const free = parseInt(freeMatch?.[1] || "0", 10);
        const active = parseInt(activeMatch[1], 10);
        const inactive = parseInt(inactiveMatch?.[1] || "0", 10);
        const wired = parseInt(wiredMatch[1], 10);
        const speculative = parseInt(speculativeMatch?.[1] || "0", 10);
        const compressor = parseInt(compressorMatch?.[1] || "0", 10);
        const totalPages = free + active + inactive + wired + speculative + compressor;
        const usedPages = active + wired + compressor;
        const totalGb = ((totalPages * pageSize) / (1024 * 1024 * 1024)).toFixed(1);
        const usedGb = ((usedPages * pageSize) / (1024 * 1024 * 1024)).toFixed(1);
        ramUsage = `${usedGb}/${totalGb} GB`;
      }
    }
  }

  return { hostname, os, uptime, ramUsage };
}

export async function getLocalHostInfo(): Promise<{
  hostname: string;
  os: string;
  uptime: string;
  ramUsage?: string;
}> {
  const cmd =
    "hostname; uname -s; uptime; (cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null || true); echo '---MEM---'; (free -m 2>/dev/null || vm_stat 2>/dev/null || true)";
  const result = await execLocal(cmd);
  if (!result.success) {
    const { hostname } = await import("os");
    return { hostname: hostname(), os: process.platform, uptime: "" };
  }

  const [mainPart, memPart] = result.stdout.split("---MEM---");
  const lines = mainPart.trim().split("\n");
  const host = lines[0] || "localhost";
  const kernel = lines[1] || "";
  const uptimeRaw = lines[2] || "";

  const uptimeMatch = uptimeRaw.match(/up\s+(.+?)(?:,\s+\d+\s+user|$)/);
  const uptime = uptimeMatch ? `up ${uptimeMatch[1].trim()}` : uptimeRaw.trim();

  let os = kernel;
  const remaining = lines.slice(3).join("\n");
  if (kernel === "Linux") {
    const prettyMatch = remaining.match(/PRETTY_NAME="([^"]+)"/);
    if (prettyMatch) os = prettyMatch[1];
  } else if (kernel === "Darwin") {
    const nameMatch = remaining.match(/ProductName:\s*(.+)/);
    const versionMatch = remaining.match(/ProductVersion:\s*(.+)/);
    if (nameMatch && versionMatch) {
      os = `${nameMatch[1].trim()} ${versionMatch[1].trim()}`;
    } else {
      os = "macOS";
    }
  }

  let ramUsage: string | undefined;
  if (memPart) {
    const memLines = memPart.trim();
    if (kernel === "Linux") {
      const memMatch = memLines.match(/Mem:\s+(\d+)\s+(\d+)/);
      if (memMatch) {
        const totalMb = parseInt(memMatch[1], 10);
        const usedMb = parseInt(memMatch[2], 10);
        ramUsage = `${(usedMb / 1024).toFixed(1)}/${(totalMb / 1024).toFixed(1)} GB`;
      }
    } else if (kernel === "Darwin") {
      const pageSizeMatch = memLines.match(/page size of (\d+) bytes/);
      const pageSize = pageSizeMatch ? parseInt(pageSizeMatch[1], 10) : 16384;
      const freeMatch = memLines.match(/Pages free:\s+(\d+)/);
      const activeMatch = memLines.match(/Pages active:\s+(\d+)/);
      const inactiveMatch = memLines.match(/Pages inactive:\s+(\d+)/);
      const wiredMatch = memLines.match(/Pages wired down:\s+(\d+)/);
      const speculativeMatch = memLines.match(/Pages speculative:\s+(\d+)/);
      const compressorMatch = memLines.match(/Pages occupied by compressor:\s+(\d+)/);

      if (activeMatch && wiredMatch) {
        const free = parseInt(freeMatch?.[1] || "0", 10);
        const active = parseInt(activeMatch[1], 10);
        const inactive = parseInt(inactiveMatch?.[1] || "0", 10);
        const wired = parseInt(wiredMatch[1], 10);
        const speculative = parseInt(speculativeMatch?.[1] || "0", 10);
        const compressor = parseInt(compressorMatch?.[1] || "0", 10);
        const totalPages = free + active + inactive + wired + speculative + compressor;
        const usedPages = active + wired + compressor;
        ramUsage = `${((usedPages * pageSize) / (1024 * 1024 * 1024)).toFixed(1)}/${((totalPages * pageSize) / (1024 * 1024 * 1024)).toFixed(1)} GB`;
      }
    }
  }

  return { hostname: host, os, uptime, ramUsage };
}

/**
 * Write a file to a remote host via SSH using base64 encoding.
 * This bypasses execRemote's JSON.stringify quoting which breaks
 * heredocs and shell metacharacters in file content.
 */
async function writeRemoteFile(
  sshHost: string,
  remotePath: string,
  content: string,
  options?: { executable?: boolean }
): Promise<CommandResult> {
  const b64 = Buffer.from(content).toString("base64");
  const dir = remotePath.replace(/\/[^/]+$/, "");
  const chmodCmd = options?.executable ? ` && chmod +x ${remotePath}` : "";
  const cmd = `mkdir -p ${dir} && echo '${b64}' | base64 -d > ${remotePath}${chmodCmd}`;

  const proc = Bun.spawn(["ssh", sshHost, cmd], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { success: exitCode === 0, stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

export async function installHooks(hostName: string): Promise<CommandResult> {
  const hostConfig = await getHost(hostName);
  if (!hostConfig) {
    return {
      success: false,
      stdout: "",
      stderr: `Host '${hostName}' not found in config`,
      exitCode: 1,
    };
  }

  // Read local hook script
  const hookScriptPath = join(homedir(), ".claude", "hooks", "csm-state-tracker.sh");
  let hookScript: string;
  try {
    hookScript = readFileSync(hookScriptPath, "utf-8");
  } catch {
    return {
      success: false,
      stdout: "",
      stderr: `Local hook script not found at ${hookScriptPath}`,
      exitCode: 1,
    };
  }

  // Read local settings to get hook definitions
  const settingsPath = join(homedir(), ".claude", "settings.json");
  let localSettings: Record<string, unknown>;
  try {
    localSettings = JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch {
    return {
      success: false,
      stdout: "",
      stderr: `Local settings not found at ${settingsPath}`,
      exitCode: 1,
    };
  }

  const hooksConfig = localSettings.hooks;
  if (!hooksConfig) {
    return {
      success: false,
      stdout: "",
      stderr: "No hooks config found in local settings",
      exitCode: 1,
    };
  }

  // Step 1: Write hook script to remote via base64
  const writeScriptResult = await writeRemoteFile(
    hostConfig.host,
    "~/.claude/hooks/csm-state-tracker.sh",
    hookScript,
    { executable: true }
  );

  if (!writeScriptResult.success) {
    return {
      success: false,
      stdout: "",
      stderr: `Failed to write hook script: ${writeScriptResult.stderr}`,
      exitCode: 1,
    };
  }

  // Step 2: Read remote settings, merge hooks, write back
  const readSettingsResult = await execRemote(
    hostName,
    "cat ~/.claude/settings.json 2>/dev/null || echo '{}'"
  );

  let remoteSettings: Record<string, unknown>;
  try {
    remoteSettings = JSON.parse(readSettingsResult.stdout || "{}");
  } catch {
    remoteSettings = {};
  }

  // Merge: preserve all remote settings, overwrite only the hooks key
  remoteSettings.hooks = hooksConfig;

  const mergedSettingsJson = JSON.stringify(remoteSettings, null, 2);

  const writeSettingsResult = await writeRemoteFile(
    hostConfig.host,
    "~/.claude/settings.json",
    mergedSettingsJson
  );

  if (!writeSettingsResult.success) {
    return {
      success: false,
      stdout: "",
      stderr: `Failed to write settings: ${writeSettingsResult.stderr}`,
      exitCode: 1,
    };
  }

  // Restart Claude in any running CSM sessions so hooks take effect
  const restartCount = await restartClaudeInSessions(hostName);

  return {
    success: true,
    stdout: restartCount > 0
      ? `Hooks installed and Claude restarted in ${restartCount} session(s)`
      : "Hooks installed (no running sessions to restart)",
    stderr: "",
    exitCode: 0,
  };
}

/**
 * Restart Claude in all running CSM tmux sessions on a remote host.
 * Sends Ctrl-C, waits, then `claude` to restart with new hooks.
 */
async function restartClaudeInSessions(hostName: string): Promise<number> {
  // List CSM sessions on the remote
  const result = await execRemote(
    hostName,
    'tmux list-sessions -F "#{session_name}" 2>/dev/null || true'
  );

  if (!result.success || !result.stdout.trim()) {
    return 0;
  }

  const sessions = result.stdout
    .split("\n")
    .filter((s) => s.startsWith("csm-"));

  let restarted = 0;
  for (const sessionName of sessions) {
    // Send Ctrl-C to interrupt Claude, then restart it
    // Target the first window (claude window)
    const cmd = [
      `tmux send-keys -t ${sessionName}:0 C-c`,
      "sleep 1",
      `tmux send-keys -t ${sessionName}:0 '/exit' Enter`,
      "sleep 1",
      `tmux send-keys -t ${sessionName}:0 'claude' Enter`,
    ].join(" && ");

    const restartResult = await execRemote(hostName, cmd);
    if (restartResult.success) {
      restarted++;
    }
  }

  return restarted;
}

export async function attachRemote(hostName: string, sessionName: string): Promise<void> {
  const hostConfig = await getHost(hostName);
  if (!hostConfig) {
    console.error(`Host '${hostName}' not found in config`);
    process.exit(1);
  }

  // Use exec to replace the current process with SSH
  const args = ["ssh", "-t", hostConfig.host, `bash -lc 'TERM=xterm-256color tmux attach -t ${sessionName}'`];

  const proc = Bun.spawn(args, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}
