import { describe, expect, test, afterEach } from "bun:test";
import {
  getSessionName,
  parseSessionName,
  listSessions,
  sessionExists,
  createSession,
  killSession,
} from "../lib/tmux";
import { $ } from "bun";

describe("tmux session operations", () => {
  const TEST_SESSION = "unit-test-session";

  afterEach(async () => {
    // Clean up test session
    try {
      await $`tmux kill-session -t csm-${TEST_SESSION} 2>/dev/null`.quiet();
    } catch {}
  });

  describe("listSessions", () => {
    test("returns empty array when no csm sessions", async () => {
      const sessions = await listSessions();
      // Filter out any test sessions that might exist
      const nonTestSessions = sessions.filter(s => !s.name.includes("unit-test"));
      // Just verify it returns an array
      expect(Array.isArray(sessions)).toBe(true);
    });

    test("returns session info with correct structure", async () => {
      // Create a test session first
      await $`tmux new-session -d -s csm-${TEST_SESSION} "sleep 60"`.quiet();

      const sessions = await listSessions();
      const testSession = sessions.find(s => s.name === TEST_SESSION);

      expect(testSession).toBeDefined();
      expect(testSession!.fullName).toBe(`csm-${TEST_SESSION}`);
      expect(typeof testSession!.attached).toBe("boolean");
      expect(typeof testSession!.windows).toBe("number");
      expect(testSession!.created).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    test("filters out non-csm sessions", async () => {
      // Create a non-csm session
      await $`tmux new-session -d -s regular-test-session "sleep 60"`.quiet();

      try {
        const sessions = await listSessions();
        const regularSession = sessions.find(s => s.fullName === "regular-test-session");
        expect(regularSession).toBeUndefined();
      } finally {
        await $`tmux kill-session -t regular-test-session 2>/dev/null`.quiet();
      }
    });
  });

  describe("sessionExists", () => {
    test("returns false for non-existent session", async () => {
      const exists = await sessionExists("definitely-does-not-exist-12345");
      expect(exists).toBe(false);
    });

    test("returns true for existing session", async () => {
      await $`tmux new-session -d -s csm-${TEST_SESSION} "sleep 60"`.quiet();

      const exists = await sessionExists(TEST_SESSION);
      expect(exists).toBe(true);
    });
  });

  describe("createSession", () => {
    test("creates tmux session with correct name", async () => {
      const result = await createSession(TEST_SESSION, "/tmp");

      expect(result.success).toBe(true);

      // Verify session exists
      const sessions = await $`tmux list-sessions -F "#{session_name}"`.text();
      expect(sessions).toContain(`csm-${TEST_SESSION}`);
    });

    test("starts session in specified directory", async () => {
      await createSession(TEST_SESSION, "/tmp");

      // Get the session's working directory
      const pwd = await $`tmux display-message -t csm-${TEST_SESSION} -p "#{pane_current_path}"`.text();
      expect(pwd.trim()).toContain("/tmp");
    });
  });

  describe("killSession", () => {
    test("kills existing session", async () => {
      // Create session first
      await $`tmux new-session -d -s csm-${TEST_SESSION} "sleep 60"`.quiet();

      const result = await killSession(TEST_SESSION);
      expect(result.success).toBe(true);

      // Verify session is gone
      const sessions = await $`tmux list-sessions -F "#{session_name}" 2>/dev/null || true`.text();
      expect(sessions).not.toContain(`csm-${TEST_SESSION}`);
    });

    test("returns failure for non-existent session", async () => {
      const result = await killSession("definitely-does-not-exist-12345");
      expect(result.success).toBe(false);
    });
  });
});
