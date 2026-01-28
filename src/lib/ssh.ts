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
