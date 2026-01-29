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

  const proc = Bun.spawn(["ssh", hostConfig.host, `bash -lc ${JSON.stringify(command)}`], {
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

export async function testConnection(hostName: string): Promise<CommandResult> {
  const hostConfig = await getHost(hostName);
  if (!hostConfig) {
    return {
      success: false,
      stdout: "",
      stderr: `Host '${hostName}' not found in config`,
      exitCode: 1,
    };
  }

  const proc = Bun.spawn(
    ["ssh", "-o", "ConnectTimeout=5", hostConfig.host, "bash -lc 'echo ok'"],
    {
      stdout: "pipe",
      stderr: "pipe",
    }
  );

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
