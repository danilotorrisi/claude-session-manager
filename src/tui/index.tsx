import React from "react";
import { render } from "ink";
import { App } from "./App";

let instance: ReturnType<typeof render> | null = null;

export function startTui() {
  instance = render(<App />);
}

export async function exitTuiAndRun(command: string, args: string[]): Promise<never> {
  // Unmount Ink and wait for cleanup
  if (instance) {
    instance.unmount();
    // Wait for terminal to restore
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Clear any remaining Ink output
  process.stdout.write("\x1B[2J\x1B[H");

  // Use spawnSync for proper terminal handling
  const { spawnSync } = await import("child_process");
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  process.exit(result.status ?? 1);
}
