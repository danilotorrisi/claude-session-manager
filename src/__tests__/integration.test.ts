import { describe, expect, test, beforeAll, afterAll, afterEach } from "bun:test";
import { $ } from "bun";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

const TEST_REPO = "/tmp/csm-test-integration-repo";
const TEST_WORKTREE_BASE = "/tmp/csm-test-integration-worktrees";
const CSM = join(import.meta.dir, "../../src/index.ts");

describe("integration tests", () => {
  beforeAll(async () => {
    // Create test git repo
    await $`rm -rf ${TEST_REPO} ${TEST_WORKTREE_BASE}`.quiet();
    await $`mkdir -p ${TEST_REPO}`.quiet();
    await $`cd ${TEST_REPO} && git init && git config user.email "test@test.com" && git config user.name "Test"`.quiet();
    await $`cd ${TEST_REPO} && echo "test" > README.md && git add . && git commit -m "Initial"`.quiet();
  });

  afterAll(async () => {
    // Cleanup any remaining test sessions
    try {
      await $`tmux kill-session -t csm-integration-test 2>/dev/null`.quiet();
    } catch {}
    await $`rm -rf ${TEST_REPO} ${TEST_WORKTREE_BASE}`.quiet();
  });

  afterEach(async () => {
    // Clean up test sessions after each test
    try {
      await $`tmux kill-session -t csm-integration-test 2>/dev/null`.quiet();
    } catch {}
    try {
      // Force remove worktree directory first
      await $`rm -rf /tmp/csm-worktrees/integration-test 2>/dev/null`.quiet();
    } catch {}
    try {
      // Then prune worktrees and delete branches
      await $`cd ${TEST_REPO} && git worktree prune 2>/dev/null`.quiet();
    } catch {}
    try {
      // Delete any csm branches (use for loop to handle glob)
      const branches = await $`cd ${TEST_REPO} && git branch --list 'csm/*' 2>/dev/null`.text();
      for (const branch of branches.split('\n').filter(b => b.trim())) {
        const branchName = branch.trim().replace(/^\* /, '');
        if (branchName) {
          await $`cd ${TEST_REPO} && git branch -D ${branchName} 2>/dev/null`.quiet();
        }
      }
    } catch {}
  });

  describe("csm help", () => {
    test("displays help message", async () => {
      const result = await $`bun ${CSM} help`.text();
      expect(result).toContain("Claude Session Manager");
      expect(result).toContain("COMMANDS:");
      expect(result).toContain("create");
      expect(result).toContain("list");
      expect(result).toContain("attach");
      expect(result).toContain("kill");
    });
  });

  describe("csm list", () => {
    test("shows no sessions when none exist", async () => {
      const result = await $`bun ${CSM} list`.text();
      expect(result).toContain("No active CSM sessions");
    });
  });

  describe("csm hosts", () => {
    test("shows hosts configuration message", async () => {
      const result = await $`bun ${CSM} hosts`.text();
      // Either shows configured hosts or instructions
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("csm create", () => {
    test("fails without session name", async () => {
      const proc = Bun.spawn(["bun", CSM, "create"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stderr).toContain("Session name required");
    });

    test("fails with invalid session name", async () => {
      const proc = Bun.spawn(["bun", CSM, "create", "invalid name!", "--repo", TEST_REPO], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stderr).toContain("alphanumeric");
    });

    test("creates session with valid name and repo", async () => {
      const result = await $`bun ${CSM} create integration-test --repo ${TEST_REPO}`.text();

      expect(result).toContain("Creating session");
      expect(result).toContain("created successfully");

      // Verify tmux session exists
      const sessions = await $`tmux list-sessions -F "#{session_name}" 2>/dev/null || true`.text();
      expect(sessions).toContain("csm-integration-test");

      // Verify worktree exists
      const worktrees = await $`cd ${TEST_REPO} && git worktree list`.text();
      expect(worktrees).toContain("integration-test");
    });

    test("fails when session already exists", async () => {
      // Create first session
      await $`bun ${CSM} create integration-test --repo ${TEST_REPO}`.quiet();

      // Try to create duplicate
      const proc = Bun.spawn(["bun", CSM, "create", "integration-test", "--repo", TEST_REPO], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stderr).toContain("already exists");
    });
  });

  describe("csm kill", () => {
    test("fails for non-existent session", async () => {
      const proc = Bun.spawn(["bun", CSM, "kill", "nonexistent"], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const stderr = await new Response(proc.stderr).text();
      const exitCode = await proc.exited;

      expect(exitCode).toBe(1);
      expect(stderr).toContain("does not exist");
    });

    test("kills session and removes worktree", async () => {
      // Create session first
      await $`bun ${CSM} create integration-test --repo ${TEST_REPO}`.quiet();

      // Kill it
      const result = await $`bun ${CSM} kill integration-test`.text();
      expect(result).toContain("killed successfully");

      // Verify tmux session is gone
      const sessions = await $`tmux list-sessions -F "#{session_name}" 2>/dev/null || true`.text();
      expect(sessions).not.toContain("csm-integration-test");
    });

    test("kills session and deletes branch with --delete-branch", async () => {
      // Create session first
      await $`bun ${CSM} create integration-test --repo ${TEST_REPO}`.quiet();

      // Get branch name before killing
      const worktrees = await $`cd ${TEST_REPO} && git worktree list --porcelain`.text();
      const branchMatch = worktrees.match(/branch refs\/heads\/(csm\/integration-test-\d+)/);
      const branchName = branchMatch?.[1];

      // Kill with delete-branch
      const result = await $`bun ${CSM} kill integration-test --delete-branch`.text();
      expect(result).toContain("killed successfully");
      expect(result).toContain("Deleting branch");

      // Verify branch is deleted
      if (branchName) {
        const branches = await $`cd ${TEST_REPO} && git branch`.text();
        expect(branches).not.toContain(branchName);
      }
    });
  });
});
