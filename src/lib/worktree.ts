import { join } from "path";
import type { CommandResult, LinearIssue, FeedbackReport } from "../types";
import { exec } from "./ssh";
import { getWorktreeBase } from "./config";

interface SessionMetadata {
  repoPath: string;
  branchName: string;
  createdAt: string;
  linearIssue?: LinearIssue;
  projectName?: string;
  feedbackReports?: FeedbackReport[];
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

export async function renameWorktree(
  oldName: string,
  newName: string,
  hostName?: string
): Promise<CommandResult> {
  const oldPath = await getWorktreePath(oldName);
  const newPath = await getWorktreePath(newName);

  // Move the worktree directory
  const mvResult = await exec(`mv "${oldPath}" "${newPath}"`, hostName);
  if (!mvResult.success) {
    return mvResult;
  }

  // Load metadata to get repoPath for git worktree repair
  const metadata = await loadSessionMetadata(newName, hostName);
  if (metadata?.repoPath) {
    await exec(`cd "${metadata.repoPath}" && git worktree repair`, hostName);
  }

  return mvResult;
}

export async function updateSessionProject(
  sessionName: string,
  projectName: string | null,
  hostName?: string
): Promise<void> {
  let metadata = await loadSessionMetadata(sessionName, hostName);
  if (!metadata) {
    // Create minimal metadata if none exists
    metadata = {
      repoPath: "",
      branchName: "",
      createdAt: new Date().toISOString(),
    };
  }

  if (projectName) {
    metadata.projectName = projectName;
  } else {
    delete metadata.projectName;
  }

  const metadataPath = await getMetadataPath(sessionName);
  const json = JSON.stringify(metadata);
  const escaped = json.replace(/'/g, "'\\''");
  await exec(`echo '${escaped}' > "${metadataPath}"`, hostName);
}

export async function updateSessionTask(
  sessionName: string,
  linearIssue: LinearIssue | null,
  hostName?: string
): Promise<void> {
  let metadata = await loadSessionMetadata(sessionName, hostName);
  if (!metadata) {
    metadata = {
      repoPath: "",
      branchName: "",
      createdAt: new Date().toISOString(),
    };
  }

  if (linearIssue) {
    metadata.linearIssue = linearIssue;
  } else {
    delete metadata.linearIssue;
  }

  const metadataPath = await getMetadataPath(sessionName);
  const json = JSON.stringify(metadata);
  const escaped = json.replace(/'/g, "'\\''");
  await exec(`echo '${escaped}' > "${metadataPath}"`, hostName);
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
  const result = await exec(`git -C "${worktreePath}" status --porcelain -uno`, hostName);
  return result.success && !result.stdout.trim();
}

export async function generateCommitMessage(
  worktreePath: string,
  hostName?: string
): Promise<{ success: boolean; message: string }> {
  // Check if there are commits to merge
  const logResult = await exec(
    `git -C "${worktreePath}" log origin/main..HEAD --oneline`,
    hostName
  );
  if (!logResult.success || !logResult.stdout.trim()) {
    return { success: false, message: "No commits to merge" };
  }

  const diffStatResult = await exec(
    `git -C "${worktreePath}" diff --stat origin/main...HEAD`,
    hostName
  );

  const commitLog = logResult.stdout.trim();
  const diffStat = diffStatResult.success ? diffStatResult.stdout.trim() : "";

  const prompt = `Generate a concise git commit message for a squash merge. Here are the individual commits being squashed:\n\n${commitLog}\n\nDiff stats:\n${diffStat}\n\nWrite a clear, conventional commit message (subject line + optional body). No markdown formatting, no code fences. Just the raw commit message text.`;

  try {
    // Run claude -p with a 30s timeout
    const claudePromise = exec(`claude -p "${prompt.replace(/"/g, '\\"')}"`, hostName);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), 30000)
    );

    const result = await Promise.race([claudePromise, timeoutPromise]);
    if (result.success && result.stdout.trim()) {
      return { success: true, message: result.stdout.trim() };
    }
  } catch {
    // Timeout or error — fall through to fallback
  }

  // Fallback: build message from git log
  const lines = commitLog.split("\n").map((l) => `- ${l.replace(/^[a-f0-9]+ /, "")}`);
  const fallback = `Squash merge\n\n${lines.join("\n")}`;
  return { success: true, message: fallback };
}

export async function squashMergeToMain(
  worktreePath: string,
  commitMessage: string,
  hostName?: string
): Promise<CommandResult> {
  // Fetch latest from origin
  const fetchResult = await exec(`git -C "${worktreePath}" fetch origin`, hostName);
  if (!fetchResult.success) {
    return fetchResult;
  }

  // Merge origin/main into the branch so HEAD^{tree} includes all main changes.
  // Without this, any features merged to main after the branch forked would be lost.
  const mergeResult = await exec(`git -C "${worktreePath}" merge origin/main --no-edit`, hostName);
  if (!mergeResult.success) {
    return mergeResult;
  }

  // Create a single commit with the session's tree, parented to origin/main
  const escapedMessage = commitMessage.replace(/'/g, "'\\''");
  const commitTreeResult = await exec(
    `git -C "${worktreePath}" commit-tree HEAD^{tree} -p origin/main -m '${escapedMessage}'`,
    hostName
  );
  if (!commitTreeResult.success) {
    return commitTreeResult;
  }

  const sha = commitTreeResult.stdout.trim();

  // Push the new commit to main
  const pushResult = await exec(
    `git -C "${worktreePath}" push origin ${sha}:refs/heads/main`,
    hostName
  );
  if (!pushResult.success) {
    return pushResult;
  }

  // Pull the updated origin/main so local refs are in sync
  await exec(`git -C "${worktreePath}" fetch origin main`, hostName);

  return pushResult;
}
