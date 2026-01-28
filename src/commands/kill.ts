import type { KillOptions } from "../types";
import { getDefaultRepo } from "../lib/config";
import { sessionExists, killSession } from "../lib/tmux";
import {
  removeWorktree,
  deleteBranch,
  worktreeExists,
  loadSessionMetadata,
} from "../lib/worktree";
import { cleanupStateFile } from "../lib/claude-state";

export async function kill(name: string, options: KillOptions): Promise<void> {
  const { host, deleteBranch: shouldDeleteBranch } = options;

  // Check if session exists
  if (!(await sessionExists(name, host))) {
    console.error(`Error: Session '${name}' does not exist`);
    process.exit(1);
  }

  // Load session metadata to get repo path and branch name
  const metadata = await loadSessionMetadata(name, host);

  // Fall back to config if no metadata
  const repoPath = metadata?.repoPath || (await getDefaultRepo(host));
  if (!repoPath) {
    console.error("Error: No repository found. Session metadata missing and no defaultRepo in config");
    process.exit(1);
  }

  const branchName = metadata?.branchName || null;

  console.log(`Killing session '${name}'...`);

  // Kill the tmux session
  console.log(`  Killing tmux session...`);
  const killResult = await killSession(name, host);
  if (!killResult.success) {
    console.error(`Warning: Could not kill tmux session: ${killResult.stderr}`);
  }

  // Remove the git worktree
  if (await worktreeExists(name, host)) {
    console.log(`  Removing git worktree...`);
    const removeResult = await removeWorktree(name, repoPath, host);
    if (!removeResult.success) {
      console.error(`Warning: Could not remove worktree: ${removeResult.stderr}`);
    }
  }

  // Optionally delete the branch
  if (shouldDeleteBranch && branchName) {
    console.log(`  Deleting branch '${branchName}'...`);
    const deleteBranchResult = await deleteBranch(branchName, repoPath, host);
    if (!deleteBranchResult.success) {
      console.error(`Warning: Could not delete branch: ${deleteBranchResult.stderr}`);
    }
  }

  // Clean up Claude state file
  cleanupStateFile(name);

  console.log(`\nSession '${name}' killed successfully!`);
}
