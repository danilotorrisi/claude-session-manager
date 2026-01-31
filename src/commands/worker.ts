import { homedir } from "os";
import { join } from "path";
import { WorkerAgent } from "../worker/worker-agent";
import type { WorkerConfig } from "../worker/types";

const DEFAULT_CONFIG: WorkerConfig = {
  workerId: "mac-mini",
  masterUrl: process.env.CSM_MASTER_URL, // Optional
  stateFile: join(homedir(), ".config/csm-worker/state.json"),
  pollInterval: 10000, // 10s
  heartbeatInterval: 30000, // 30s
};

export async function startWorker(): Promise<void> {
  const config: WorkerConfig = {
    ...DEFAULT_CONFIG,
    workerId: process.env.CSM_WORKER_ID || DEFAULT_CONFIG.workerId,
  };

  const agent = new WorkerAgent(config);

  console.log("Starting CSM Worker Agent...");
  console.log(`Worker ID: ${config.workerId}`);
  console.log(`Master URL: ${config.masterUrl || "not configured"}`);
  console.log(`State file: ${config.stateFile}`);
  console.log();

  await agent.start();

  // Graceful shutdown
  let shuttingDown = false;
  
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log("\nShutting down...");
    await agent.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep process alive - wait forever
  // The timers in WorkerAgent (pollTimer, heartbeatTimer) keep the event loop busy
  while (!shuttingDown) {
    await new Promise(resolve => setTimeout(resolve, 60000)); // Sleep 1 minute
  }
}

export async function statusWorker(): Promise<void> {
  const config: WorkerConfig = {
    ...DEFAULT_CONFIG,
    workerId: process.env.CSM_WORKER_ID || DEFAULT_CONFIG.workerId,
  };

  const agent = new WorkerAgent(config);
  const sessions = agent.getSessions();

  console.log(`Worker ID: ${config.workerId}`);
  console.log(`Sessions: ${sessions.length}`);
  console.log();

  if (sessions.length === 0) {
    console.log("No active sessions");
    return;
  }

  for (const session of sessions) {
    console.log(`• ${session.name}`);
    console.log(`  Status: ${session.attached ? "attached" : "detached"}`);
    if (session.claudeState) {
      console.log(`  Claude: ${session.claudeState}`);
    }
    if (session.gitStats) {
      const { filesChanged, insertions, deletions } = session.gitStats;
      console.log(
        `  Changes: ${filesChanged} files (+${insertions}/-${deletions})`
      );
    }
    console.log();
  }

  const masterAvailable = await agent.checkMasterAvailability();
  console.log(`Master: ${masterAvailable ? "online" : "offline"}`);
}

export async function syncWorker(): Promise<void> {
  const config: WorkerConfig = {
    ...DEFAULT_CONFIG,
    workerId: process.env.CSM_WORKER_ID || DEFAULT_CONFIG.workerId,
  };

  const agent = new WorkerAgent(config);

  console.log("Syncing state with master...");
  const success = await agent.forceSync();

  if (success) {
    console.log("✓ State synced successfully");
  } else {
    console.log("✗ Failed to sync (master unavailable?)");
    process.exit(1);
  }
}
