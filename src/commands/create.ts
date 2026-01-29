import type { CreateOptions } from "../types";
import { getDefaultRepo, loadConfig, resolveProjectPath } from "../lib/config";
import { sessionExists, createSession } from "../lib/tmux";
import { exec } from "../lib/ssh";
import {
  createWorktree,
  getWorktreePath,
  isWorktreeConflictError,
  cleanupStaleWorktree,
} from "../lib/worktree";

async function promptYesNo(question: string): Promise<boolean> {
  process.stdout.write(`${question} [y/N] `);

  return new Promise((resolve) => {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", (data) => {
      const char = data.toString().toLowerCase();
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      console.log(char);
      resolve(char === "y");
    });
  });
}

export async function create(name: string, options: CreateOptions): Promise<void> {
  const { repo, host } = options;

  // Validate session name
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    console.error("Error: Session name must only contain alphanumeric characters, hyphens, and underscores");
    process.exit(1);
  }

  // Check if session already exists
  if (await sessionExists(name, host)) {
    console.error(`Error: Session '${name}' already exists`);
    process.exit(1);
  }

  // Get repository path
  const config = await loadConfig();
  const repoPath = (repo ? resolveProjectPath(repo, config, host) : null) || (await getDefaultRepo(host));
  if (!repoPath) {
    console.error("Error: No repository specified. Use --repo or set defaultRepo in config");
    process.exit(1);
  }

  console.log(`Creating session '${name}'...`);

  // Create git worktree
  console.log(`  Creating git worktree...`);
  let worktreeResult = await createWorktree(name, repoPath, host);

  // Handle worktree conflict errors
  if (!worktreeResult.success && isWorktreeConflictError(worktreeResult.stderr)) {
    console.error(`\n  Warning: Stale worktree detected for '${name}'`);
    console.log(`  This can happen if a previous session wasn't cleaned up properly.\n`);

    const shouldClean = await promptYesNo("  Clean up and retry?");

    if (shouldClean) {
      console.log(`\n  Cleaning up stale worktree...`);
      await cleanupStaleWorktree(name, repoPath, host);

      console.log(`  Retrying worktree creation...`);
      worktreeResult = await createWorktree(name, repoPath, host);
    } else {
      console.log("\nAborted.");
      process.exit(1);
    }
  }

  if (!worktreeResult.success) {
    console.error(`Error creating worktree: ${worktreeResult.stderr}`);
    process.exit(1);
  }

  const worktreePath = await getWorktreePath(name);
  console.log(`  Worktree created at: ${worktreePath}`);

  // Create tmux session with Claude
  console.log(`  Starting tmux session with Claude...`);
  const sessionResult = await createSession(name, worktreePath, host);
  if (!sessionResult.success) {
    console.error(`Error creating tmux session: ${sessionResult.stderr}`);
    process.exit(1);
  }

  // Check if setup script was run (createSession runs it internally, but we log here)
  const setupCheck = await exec(`test -f "${worktreePath}/.csm-setup.sh"`, host);
  if (setupCheck.success) {
    console.log(`  Running setup script (.csm-setup.sh)...`);
  }

  console.log(`\nSession '${name}' created successfully!`);
  console.log(`\nTo attach: csm attach ${name}${host ? ` --host ${host}` : ""}`);
}
