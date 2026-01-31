import { startApiServer } from "../api/server";

export async function startServer(port?: number): Promise<void> {
  const serverPort = port || parseInt(process.env.CSM_API_PORT || "3000", 10);

  console.log("Starting CSM Master API Server...");
  console.log();

  const server = await startApiServer(serverPort);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down server...");
    server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    server.stop();
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}
