import { describe, expect, test, beforeAll, afterAll, afterEach } from "bun:test";
import { $ } from "bun";
import {
  generateBranchName,
  getWorktreePath,
  getMetadataPath,
  createWorktree,
  removeWorktree,
  worktreeExists,
  saveSessionMetadata,
  loadSessionMetadata,
  getWorktreeBranch,
  deleteBranch,
} from "../lib/worktree";

const TEST_REPO = "/tmp/csm-worktree-test-repo";
const TEST_SESSION = "worktree-unit-test";

describe("worktree operations", () => {
  beforeAll(async () => {
    // Create test git repo
    await $`rm -rf ${TEST_REPO}`.quiet();
    await $`mkdir -p ${TEST_REPO}`.quiet();
    await $`cd ${TEST_REPO} && git init && git config user.email "test@test.com" && git config user.name "Test"`.quiet();
    await $`cd ${TEST_REPO} && echo "test" > README.md && git add . && git commit -m "Initial"`.quiet();
  });

  afterAll(async () => {
    await $`rm -rf ${TEST_REPO}`.quiet();
  });

  afterEach(async () => {
    // Clean up test worktree
    try {
      await $`rm -rf /tmp/csm-worktrees/${TEST_SESSION}`.quiet();
      await $`cd ${TEST_REPO} && git worktree prune`.quiet();
      const branches = await $`cd ${TEST_REPO} && git branch --list 'csm/*'`.text();
      for (const branch of branches.split('\n').filter(b => b.trim())) {
        const branchName = branch.trim().replace(/^\* /, '');
        if (branchName) {
          await $`cd ${TEST_REPO} && git branch -D ${branchName}`.quiet();
        }
      }
    } catch {}
  });

  describe("getMetadataPath", () => {
    test("returns path ending with metadata file", async () => {
      const path = await getMetadataPath("my-session");
      expect(path).toEndWith(".csm-metadata.json");
      expect(path).toContain("my-session");
    });
  });

  describe("createWorktree", () => {
    test("creates worktree directory", async () => {
      const result = await createWorktree(TEST_SESSION, TEST_REPO);

      expect(result.success).toBe(true);

      // Verify worktree exists
      const worktreePath = await getWorktreePath(TEST_SESSION);
      const exists = await $`test -d ${worktreePath} && echo yes || echo no`.text();
      expect(exists.trim()).toBe("yes");
    });

    test("creates branch with csm/ prefix", async () => {
      await createWorktree(TEST_SESSION, TEST_REPO);

      const branches = await $`cd ${TEST_REPO} && git branch`.text();
      expect(branches).toContain(`csm/${TEST_SESSION}`);
    });

    test("saves metadata file", async () => {
      await createWorktree(TEST_SESSION, TEST_REPO);

      const metadataPath = await getMetadataPath(TEST_SESSION);
      const exists = await $`test -f ${metadataPath} && echo yes || echo no`.text();
      expect(exists.trim()).toBe("yes");
    });
  });

  describe("worktreeExists", () => {
    test("returns false when worktree does not exist", async () => {
      const exists = await worktreeExists("nonexistent-session-xyz");
      expect(exists).toBe(false);
    });

    test("returns true when worktree exists", async () => {
      await createWorktree(TEST_SESSION, TEST_REPO);

      const exists = await worktreeExists(TEST_SESSION);
      expect(exists).toBe(true);
    });
  });

  describe("saveSessionMetadata / loadSessionMetadata", () => {
    test("saves and loads metadata correctly", async () => {
      // Create worktree first (which creates the directory)
      await createWorktree(TEST_SESSION, TEST_REPO);

      // Load the metadata that was saved during create
      const metadata = await loadSessionMetadata(TEST_SESSION);

      expect(metadata).not.toBeNull();
      expect(metadata!.repoPath).toBe(TEST_REPO);
      expect(metadata!.branchName).toContain(`csm/${TEST_SESSION}`);
      expect(metadata!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("returns null for non-existent metadata", async () => {
      const metadata = await loadSessionMetadata("nonexistent-xyz");
      expect(metadata).toBeNull();
    });
  });

  describe("getWorktreeBranch", () => {
    test("returns branch name for existing worktree", async () => {
      await createWorktree(TEST_SESSION, TEST_REPO);

      const branch = await getWorktreeBranch(TEST_SESSION, TEST_REPO);

      expect(branch).not.toBeNull();
      expect(branch).toContain(`csm/${TEST_SESSION}`);
    });

    test("returns null for non-existent worktree", async () => {
      const branch = await getWorktreeBranch("nonexistent-xyz", TEST_REPO);
      expect(branch).toBeNull();
    });
  });

  describe("removeWorktree", () => {
    test("removes worktree directory", async () => {
      await createWorktree(TEST_SESSION, TEST_REPO);

      const result = await removeWorktree(TEST_SESSION, TEST_REPO);
      expect(result.success).toBe(true);

      const exists = await worktreeExists(TEST_SESSION);
      expect(exists).toBe(false);
    });
  });

  describe("deleteBranch", () => {
    test("deletes specified branch", async () => {
      await createWorktree(TEST_SESSION, TEST_REPO);
      const branch = await getWorktreeBranch(TEST_SESSION, TEST_REPO);

      // Remove worktree first (can't delete branch with active worktree)
      await removeWorktree(TEST_SESSION, TEST_REPO);

      const result = await deleteBranch(branch!, TEST_REPO);
      expect(result.success).toBe(true);

      const branches = await $`cd ${TEST_REPO} && git branch`.text();
      expect(branches).not.toContain(branch);
    });
  });
});
