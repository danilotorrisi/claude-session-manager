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

  const proc = Bun.spawn(["ssh", hostConfig.host, command], {
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

export async function attachRemote(hostName: string, sessionName: string): Promise<void> {
  const hostConfig = await getHost(hostName);
  if (!hostConfig) {
    console.error(`Host '${hostName}' not found in config`);
    process.exit(1);
  }

  // Use exec to replace the current process with SSH
  const args = ["ssh", "-t", hostConfig.host, `tmux attach -t ${sessionName}`];

  const proc = Bun.spawn(args, {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}
