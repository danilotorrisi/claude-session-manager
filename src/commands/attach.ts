import type { AttachOptions } from "../types";
import { sessionExists, attachSession, getSessionName } from "../lib/tmux";
import { attachRemote } from "../lib/ssh";

export async function attach(name: string, options: AttachOptions): Promise<void> {
  const { host } = options;

  // Check if session exists
  if (!(await sessionExists(name, host))) {
    console.error(`Error: Session '${name}' does not exist`);
    process.exit(1);
  }

  if (host) {
    // Attach to remote session via SSH
    await attachRemote(host, getSessionName(name));
  } else {
    // Attach to local session
    await attachSession(name);
  }
}
