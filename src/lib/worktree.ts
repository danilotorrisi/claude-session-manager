import { join } from "path";
import type { CommandResult, LinearIssue } from "../types";
import { exec } from "./ssh";
import { getWorktreeBase } from "./config";

interface SessionMetadata {
  repoPath: string;
  branchName: string;
  createdAt: string;
  linearIssue?: LinearIssue;
  projectName?: string;
}

export function generateBranchName(sessionName: string): string {
  const timestamp = Date.now();
  return `csm/${sessionName}-${timestamp}`;
}

export async function getWorktreePath(sessionName: string): Promise<string> {
  const base = await getWorktreeBase();
  return join(base, sessionName);
}

export async function getMetadataPath(sessionName: string): Promise<string> {
  const worktreePath = await getWorktreePath(sessionName);
  return join(worktreePath, ".csm-metadata.json");
}

export async function saveSessionMetadata(
  sessionName: string,
  repoPath: string,
  branchName: string,
  hostName?: string,
  linearIssue?: LinearIssue,
  projectName?: string
): Promise<void> {
  const metadataPath = await getMetadataPath(sessionName);
  const metadata: SessionMetadata = {
    repoPath,
    branchName,
    createdAt: new Date().toISOString(),
    ...(linearIssue && { linearIssue }),
    ...(projectName && { projectName }),
  };
  await exec(`echo '${JSON.stringify(metadata)}' > "${metadataPath}"`, hostName);
}

export async function loadSessionMetadata(
  sessionName: string,
  hostName?: string
): Promise<SessionMetadata | null> {
  const metadataPath = await getMetadataPath(sessionName);
  const result = await exec(`cat "${metadataPath}" 2>/dev/null`, hostName);
  if (!result.success || !result.stdout) {
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

export function isWorktreeConflictError(stderr: string): boolean {
  return (
    stderr.includes("already registered worktree") ||
    stderr.includes("already exists") ||
    stderr.includes("is a missing but already registered")
  );
}

export async function cleanupStaleWorktree(
  sessionName: string,
  repoPath: string,
  hostName?: string
): Promise<CommandResult> {
  const worktreePath = await getWorktreePath(sessionName);

  // Remove the directory if it exists
  await exec(`rm -rf "${worktreePath}"`, hostName);

  // Prune stale worktree entries
  await exec(`cd "${repoPath}" && git worktree prune`, hostName);

  // Also try to remove any lingering csm branches for this session
  const branchResult = await exec(
    `cd "${repoPath}" && git branch --list "csm/${sessionName}-*" | head -1`,
    hostName
  );
  if (branchResult.success && branchResult.stdout.trim()) {
    const branchName = branchResult.stdout.trim().replace(/^\* /, "");
    await exec(`cd "${repoPath}" && git branch -D "${branchName}"`, hostName);
  }

  return { success: true, stdout: "Cleanup complete", stderr: "", exitCode: 0 };
}

export async function createWorktree(
  sessionName: string,
  repoPath: string,
  hostName?: string,
  linearIssue?: LinearIssue,
  projectName?: string
): Promise<CommandResult> {
  const branchName = generateBranchName(sessionName);
  const worktreePath = await getWorktreePath(sessionName);

  // Ensure the worktree base directory exists
  const base = await getWorktreeBase();
  await exec(`mkdir -p "${base}"`, hostName);

  // Create a new worktree with a new branch based on the current HEAD
  const command = `cd "${repoPath}" && git worktree add -b "${branchName}" "${worktreePath}"`;
  const result = await exec(command, hostName);

  // Save metadata for later cleanup
  if (result.success) {
    await saveSessionMetadata(sessionName, repoPath, branchName, hostName, linearIssue, projectName);
  }

  return result;
}

export async function removeWorktree(
  sessionName: string,
  repoPath: string,
  hostName?: string
): Promise<CommandResult> {
  const worktreePath = await getWorktreePath(sessionName);

  // Remove the worktree
  const command = `cd "${repoPath}" && git worktree remove "${worktreePath}" --force`;
  return exec(command, hostName);
}

export async function getWorktreeBranch(
  sessionName: string,
  repoPath: string,
  hostName?: string
): Promise<string | null> {
  const worktreePath = await getWorktreePath(sessionName);

  // Resolve the path to handle symlinks (e.g., /tmp -> /private/tmp on macOS)
  const resolvedPathResult = await exec(`cd "${worktreePath}" && pwd -P 2>/dev/null || echo "${worktreePath}"`, hostName);
  const resolvedWorktreePath = resolvedPathResult.stdout.trim() || worktreePath;

  // List worktrees and find the branch for our path
  const result = await exec(
    `cd "${repoPath}" && git worktree list --porcelain`,
    hostName
  );

  if (!result.success) {
    return null;
  }

  const lines = result.stdout.split("\n");
  let currentPath = "";

  for (const line of lines) {
    if (line.startsWith("worktree ")) {
      currentPath = line.slice(9);
    } else if (line.startsWith("branch ") && currentPath === resolvedWorktreePath) {
      // Return just the branch name without refs/heads/
      return line.slice(7).replace("refs/heads/", "");
    }
  }

  return null;
}

export async function deleteBranch(
  branchName: string,
  repoPath: string,
  hostName?: string
): Promise<CommandResult> {
  const command = `cd "${repoPath}" && git branch -D "${branchName}"`;
  return exec(command, hostName);
}

export async function worktreeExists(
  sessionName: string,
  hostName?: string
): Promise<boolean> {
  const worktreePath = await getWorktreePath(sessionName);
  const result = await exec(`test -d "${worktreePath}"`, hostName);
  return result.success;
}

export async function checkWorktreeClean(
  worktreePath: string,
  hostName?: string
): Promise<boolean> {
  const result = await exec(`git -C "${worktreePath}" status --porcelain`, hostName);
  return result.success && !result.stdout.trim();
}

export async function mergeToMain(
  worktreePath: string,
  branchName: string,
  hostName?: string
): Promise<CommandResult> {
  // Fetch latest from origin
  const fetchResult = await exec(`git -C "${worktreePath}" fetch origin`, hostName);
  if (!fetchResult.success) {
    return fetchResult;
  }

  // Merge origin/main into the branch to bring it up-to-date
  const mergeResult = await exec(`git -C "${worktreePath}" merge origin/main --no-edit`, hostName);
  if (!mergeResult.success) {
    return mergeResult;
  }

  // Push the branch to main (fast-forward)
  const pushResult = await exec(`git -C "${worktreePath}" push origin HEAD:main`, hostName);
  return pushResult;
}
