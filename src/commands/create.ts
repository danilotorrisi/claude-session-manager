import type { CreateOptions } from "../types";
import { getDefaultRepo } from "../lib/config";
import { sessionExists, createSession } from "../lib/tmux";
import { createWorktree, getWorktreePath } from "../lib/worktree";

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
  const repoPath = repo || (await getDefaultRepo(host));
  if (!repoPath) {
    console.error("Error: No repository specified. Use --repo or set defaultRepo in config");
    process.exit(1);
  }

  console.log(`Creating session '${name}'...`);

  // Create git worktree
  console.log(`  Creating git worktree...`);
  const worktreeResult = await createWorktree(name, repoPath, host);
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

  console.log(`\nSession '${name}' created successfully!`);
  console.log(`\nTo attach: csm attach ${name}${host ? ` --host ${host}` : ""}`);
}
