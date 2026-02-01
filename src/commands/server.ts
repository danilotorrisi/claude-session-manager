import { homedir } from "os";
import { join } from "path";
import { startApiServer } from "../api/server";
import { WorkerAgent } from "../worker/worker-agent";
import { generateWorkerId } from "./worker";
import type { WorkerConfig } from "../worker/types";

async function startColocatedWorker(masterPort: number): Promise<WorkerAgent> {
  const config: WorkerConfig = {
    workerId: process.env.CSM_WORKER_ID || generateWorkerId(),
    masterUrl: `http://localhost:${masterPort}`,
    stateFile: join(homedir(), ".config/csm-worker/state.json"),
    pollInterval: 10000,
    heartbeatInterval: 30000,
  };

  const agent = new WorkerAgent(config);
  await agent.start();
  console.log(`[Master] Co-located worker started (ID: ${config.workerId})`);
  return agent;
}

export async function startServer(port?: number, options?: { noWorker?: boolean }): Promise<void> {
  const serverPort = port || parseInt(process.env.CSM_API_PORT || "3000", 10);

  console.log("Starting CSM Master API Server...");
  console.log();

  const server = await startApiServer(serverPort);

  // Auto-start co-located worker (unless --no-worker)
  let colocatedWorker: WorkerAgent | null = null;
  if (!options?.noWorker) {
    console.log();
    colocatedWorker = await startColocatedWorker(serverPort);
  } else {
    console.log("[Master] Co-located worker disabled (--no-worker)");
  }

  // Graceful shutdown: stop worker first, then server
  const shutdown = async (signal: string) => {
    console.log(`\n[Master] Received ${signal}, shutting down...`);
    if (colocatedWorker) {
      await colocatedWorker.stop();
      console.log("[Master] Co-located worker stopped");
    }
    server.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keep process alive
  await new Promise(() => {});
}
