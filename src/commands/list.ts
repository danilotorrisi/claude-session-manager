import type { ListOptions } from "../types";
import { listSessions } from "../lib/tmux";

export async function list(options: ListOptions): Promise<void> {
  const { host } = options;

  const sessions = await listSessions(host);

  if (sessions.length === 0) {
    console.log("No active CSM sessions found.");
    return;
  }

  console.log("Active CSM Sessions:");
  console.log("─".repeat(60));
  console.log(
    `${"NAME".padEnd(20)} ${"STATUS".padEnd(12)} ${"WINDOWS".padEnd(10)} CREATED`
  );
  console.log("─".repeat(60));

  for (const session of sessions) {
    const status = session.attached ? "attached" : "detached";
    const created = new Date(session.created).toLocaleString();
    console.log(
      `${session.name.padEnd(20)} ${status.padEnd(12)} ${String(session.windows).padEnd(10)} ${created}`
    );
  }
}
