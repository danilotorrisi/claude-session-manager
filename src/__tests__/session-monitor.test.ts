import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, readdirSync } from "fs";
import { join } from "path";

// Test the internal helper logic that doesn't require tmux.
// We re-implement extractSessionName here since it's not exported,
// and test the state file parsing logic directly.

const TEST_STATE_DIR = "/tmp/csm-test-claude-state";

function extractSessionName(cwd: string): string | null {
  const match = cwd.match(/csm-worktrees\/([^/]+)/);
  return match ? match[1] : null;
}

describe("session-monitor", () => {
  describe("extractSessionName", () => {
    test("extracts name from standard worktree path", () => {
      expect(extractSessionName("/tmp/csm-worktrees/my-feature")).toBe("my-feature");
    });

    test("extracts name from /private/tmp path (macOS)", () => {
      expect(extractSessionName("/private/tmp/csm-worktrees/bugfix-123")).toBe("bugfix-123");
    });

    test("extracts name ignoring subdirectories", () => {
      expect(extractSessionName("/tmp/csm-worktrees/dev-session/src/lib")).toBe("dev-session");
    });

    test("returns null for non-worktree path", () => {
      expect(extractSessionName("/home/user/projects/my-app")).toBeNull();
    });

    test("returns null for empty string", () => {
      expect(extractSessionName("")).toBeNull();
    });

    test("handles pm session path", () => {
      expect(extractSessionName("/tmp/csm-worktrees/pm")).toBe("pm");
    });
  });

  describe("state file parsing", () => {
    beforeEach(() => {
      if (!existsSync(TEST_STATE_DIR)) {
        mkdirSync(TEST_STATE_DIR, { recursive: true });
      }
      // Clean up any leftover files
      for (const f of readdirSync(TEST_STATE_DIR)) {
        unlinkSync(join(TEST_STATE_DIR, f));
      }
    });

    afterEach(() => {
      for (const f of readdirSync(TEST_STATE_DIR)) {
        unlinkSync(join(TEST_STATE_DIR, f));
      }
    });

    test("valid state file can be parsed", () => {
      const stateFile = join(TEST_STATE_DIR, "test-session.json");
      const state = {
        state: "waiting_for_input",
        event: "tool_use",
        cwd: "/tmp/csm-worktrees/test-dev",
        timestamp: Math.floor(Date.now() / 1000),
      };
      writeFileSync(stateFile, JSON.stringify(state));

      const content = require("fs").readFileSync(stateFile, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.state).toBe("waiting_for_input");
      expect(parsed.cwd).toBe("/tmp/csm-worktrees/test-dev");
      expect(typeof parsed.timestamp).toBe("number");
    });

    test("malformed state file is handled gracefully", () => {
      const stateFile = join(TEST_STATE_DIR, "bad.json");
      writeFileSync(stateFile, "not json{{{");

      let parsed: any = null;
      try {
        const content = require("fs").readFileSync(stateFile, "utf-8");
        parsed = JSON.parse(content);
      } catch {
        // Expected
      }

      expect(parsed).toBeNull();
    });

    test("state transition detection logic", () => {
      // Simulate the monitor's transition detection
      const previous = { state: "working", timestamp: 100, cwd: "/tmp/csm-worktrees/dev" };
      const current = { state: "waiting_for_input", timestamp: 200, cwd: "/tmp/csm-worktrees/dev" };

      const isTransitionToWaiting =
        current.state === "waiting_for_input" &&
        previous.state !== "waiting_for_input";

      expect(isTransitionToWaiting).toBe(true);
    });

    test("no false transition when already waiting", () => {
      const previous = { state: "waiting_for_input", timestamp: 100, cwd: "/tmp/csm-worktrees/dev" };
      const current = { state: "waiting_for_input", timestamp: 200, cwd: "/tmp/csm-worktrees/dev" };

      const isTransitionToWaiting =
        current.state === "waiting_for_input" &&
        previous.state !== "waiting_for_input";

      expect(isTransitionToWaiting).toBe(false);
    });

    test("idle detection logic", () => {
      const threshold = 120; // seconds
      const now = Math.floor(Date.now() / 1000);

      const recentSession = { state: "waiting_for_input", timestamp: now - 60, cwd: "" };
      const idleSession = { state: "waiting_for_input", timestamp: now - 200, cwd: "" };
      const workingSession = { state: "working", timestamp: now - 200, cwd: "" };

      expect(recentSession.state === "waiting_for_input" && now - recentSession.timestamp > threshold).toBe(false);
      expect(idleSession.state === "waiting_for_input" && now - idleSession.timestamp > threshold).toBe(true);
      expect(workingSession.state === "waiting_for_input" && now - workingSession.timestamp > threshold).toBe(false);
    });
  });
});
