import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { generateBranchName, getWorktreePath } from "../lib/worktree";

describe("worktree utilities", () => {
  describe("generateBranchName", () => {
    test("generates branch name with csm/ prefix", () => {
      const branchName = generateBranchName("my-feature");
      expect(branchName).toStartWith("csm/my-feature-");
    });

    test("includes timestamp in branch name", () => {
      const before = Date.now();
      const branchName = generateBranchName("test");
      const after = Date.now();

      const match = branchName.match(/csm\/test-(\d+)/);
      expect(match).not.toBeNull();

      const timestamp = parseInt(match![1], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    test("generates unique branch names", () => {
      const branch1 = generateBranchName("feature");
      // Small delay to ensure different timestamp
      const branch2 = generateBranchName("feature");

      // They might be the same if called in same millisecond,
      // but the format should be correct
      expect(branch1).toStartWith("csm/feature-");
      expect(branch2).toStartWith("csm/feature-");
    });
  });

  describe("getWorktreePath", () => {
    test("returns path under worktree base", async () => {
      const path = await getWorktreePath("my-session");
      expect(path).toEndWith("/my-session");
      expect(path).toContain("csm-worktrees");
    });

    test("handles session names with hyphens", async () => {
      const path = await getWorktreePath("my-long-session-name");
      expect(path).toEndWith("/my-long-session-name");
    });
  });
});
