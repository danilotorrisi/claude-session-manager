import React from "react";
import { render } from "ink";
import { App } from "./App";

let instance: ReturnType<typeof render> | null = null;

export function startTui() {
  instance = render(<App />);
}

export async function exitTuiAndAttach(command: string, args: string[]): Promise<void> {
  // Unmount Ink and wait for cleanup
  if (instance) {
    instance.unmount();
    instance = null;
    // Wait for terminal to restore
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  // Clear screen
  process.stdout.write("\x1B[2J\x1B[H");

  // Use spawnSync for proper terminal handling
  const { spawnSync } = await import("child_process");
  spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  // After detaching from tmux, restart the TUI
  // Clear screen again before restarting
  process.stdout.write("\x1B[2J\x1B[H");

  // Small delay to ensure terminal is ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Restart the TUI
  startTui();
}

// Keep the old function for cases where we want to exit completely
export async function exitTuiAndRun(command: string, args: string[]): Promise<never> {
  if (instance) {
    instance.unmount();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  process.stdout.write("\x1B[2J\x1B[H");

  const { spawnSync } = await import("child_process");
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });

  process.exit(result.status ?? 1);
}
