/**
 * Phase 2 Integration Tests
 *
 * Tests the WebSocket-first integration for local sessions:
 * - createSession() uses --sdk-url for local, plain claude for remote
 * - sendToSession() tries WebSocket first, falls back to tmux
 * - autoAcceptClaudeTrust() only called for remote sessions
 * - apiPort configuration (default 3000 and custom)
 */

import { describe, expect, test, beforeEach, afterEach, afterAll, mock, spyOn } from "bun:test";

// Track all exec() calls to verify command construction
let execCalls: Array<{ command: string; hostName?: string }> = [];
let execResults: Map<string, { success: boolean; stdout: string; stderr: string; exitCode: number }> = new Map();

// Mock ssh.exec to capture all shell commands without actually executing them
const mockExec = mock(async (command: string, hostName?: string) => {
  execCalls.push({ command, hostName });

  // Check for specific command overrides
  for (const [pattern, result] of execResults) {
    if (command.includes(pattern)) {
      return result;
    }
  }

  // Default success response
  return { success: true, stdout: "", stderr: "", exitCode: 0 };
});

// Mock loadConfig to control apiPort
let mockConfig: Record<string, unknown> = {};
const mockLoadConfig = mock(async () => ({
  worktreeBase: "/tmp/csm-worktrees",
  hosts: {},
  ...mockConfig,
}));

const mockIsFeedbackEnabled = mock(async () => false);

// Mock ws-session-manager
let wsConnectedSessions = new Set<string>();
let wsSentMessages: Array<{ name: string; text: string }> = [];
let wsQueuedPrompts: Array<{ name: string; text: string }> = [];
let wsStoredSessions = new Map<string, any>();

const mockWsSessionManager = {
  isConnected: (name: string) => wsConnectedSessions.has(name),
  sendUserMessage: (name: string, text: string) => {
    wsSentMessages.push({ name, text });
    return true;
  },
  queueInitialPrompt: (name: string, text: string) => {
    wsQueuedPrompts.push({ name, text });
  },
  // Add methods needed by phase4 tests to prevent mock leakage issues
  getAllSessions: () => wsStoredSessions,
  getSessionState: (name: string) => wsStoredSessions.get(name),
  removeSession: (name: string) => wsStoredSessions.delete(name),
  handleConnection: () => {},
  handleMessage: () => {},
  handleClose: () => {},
  on: () => () => {}, // Returns unsubscribe function
  respondToToolApproval: () => {},
};

// Apply mocks
mock.module("../ssh", () => ({ exec: mockExec }));
mock.module("../config", () => ({
  loadConfig: mockLoadConfig,
  isFeedbackEnabled: mockIsFeedbackEnabled,
}));
mock.module("../ws-session-manager", () => ({
  wsSessionManager: mockWsSessionManager,
}));

// Mock worktree module (needed by createSession)
mock.module("../worktree", () => ({
  getWorktreePath: mock(async () => "/tmp/csm-worktrees/test"),
  loadSessionMetadata: mock(async () => null),
}));

// Import after mocking
const { createSession, sendToSession, autoAcceptClaudeTrust, getSessionName } = await import("../tmux");

// ─── Test suite ────────────────────────────────────────────────────

describe("Phase 2: WebSocket-first integration", () => {
  beforeEach(() => {
    execCalls = [];
    execResults = new Map();
    wsConnectedSessions = new Set();
    wsSentMessages = [];
    wsQueuedPrompts = [];
    wsStoredSessions = new Map();
    mockConfig = {};
    mockExec.mockClear();
    mockLoadConfig.mockClear();
    mockIsFeedbackEnabled.mockClear();
  });

  // ─── 1. createSession: --sdk-url for local sessions ────────────

  describe("createSession() --sdk-url command construction", () => {
    test("local session launches claude with --sdk-url and default port 3000", async () => {
      const result = await createSession("test-ws", "/tmp/work");

      expect(result.success).toBe(true);

      // Find the tmux send-keys command that launches claude
      const claudeLaunchCmd = execCalls.find(
        (c) => c.command.includes("--sdk-url") && c.command.includes("send-keys")
      );

      expect(claudeLaunchCmd).toBeDefined();
      expect(claudeLaunchCmd!.command).toContain("--sdk-url");
      expect(claudeLaunchCmd!.command).toContain("ws://localhost:3000/ws/sessions?name=test-ws");
      expect(claudeLaunchCmd!.command).toContain("--print");
      expect(claudeLaunchCmd!.command).toContain("--output-format stream-json");
      expect(claudeLaunchCmd!.command).toContain("--input-format stream-json");
      expect(claudeLaunchCmd!.command).toContain("--verbose");
      expect(claudeLaunchCmd!.command).toContain("--permission-mode acceptEdits");
      expect(claudeLaunchCmd!.hostName).toBeUndefined();
    });

    test("local session uses custom apiPort from config", async () => {
      mockConfig = { apiPort: 8080 };

      await createSession("custom-port", "/tmp/work");

      const claudeLaunchCmd = execCalls.find(
        (c) => c.command.includes("--sdk-url") && c.command.includes("send-keys")
      );

      expect(claudeLaunchCmd).toBeDefined();
      expect(claudeLaunchCmd!.command).toContain("ws://localhost:8080/ws/sessions?name=custom-port");
    });

    test("local session URL-encodes session name in --sdk-url", async () => {
      await createSession("test session+special", "/tmp/work");

      const claudeLaunchCmd = execCalls.find(
        (c) => c.command.includes("--sdk-url") && c.command.includes("send-keys")
      );

      expect(claudeLaunchCmd).toBeDefined();
      // encodeURIComponent should encode spaces and plus signs
      expect(claudeLaunchCmd!.command).toContain(
        encodeURIComponent("test session+special")
      );
      expect(claudeLaunchCmd!.command).not.toContain("name=test session+special");
    });
  });

  // ─── 2. createSession: queued prompt delivery ─────────────────

  describe("createSession() queued prompt delivery", () => {
    test("local session queues initial prompt via wsSessionManager", async () => {
      await createSession("prompt-test", "/tmp/work");

      const mainPrompt = wsQueuedPrompts.find((p) => p.name === "prompt-test");
      expect(mainPrompt).toBeDefined();
      expect(mainPrompt!.text).toContain("CSM session ready");
    });

    test("remote session does NOT queue prompt", async () => {
      await createSession("remote-test", "/tmp/work", "my-server");

      const queuedForThisSession = wsQueuedPrompts.filter(
        (p) => p.name === "remote-test"
      );
      expect(queuedForThisSession).toHaveLength(0);
    });
  });

  // ─── 3. createSession: remote sessions unchanged ──────────────

  describe("createSession() remote session behavior", () => {
    test("remote session launches plain 'claude' without --sdk-url", async () => {
      await createSession("remote-session", "/tmp/work", "my-server");

      // The claude launch command should be plain 'claude' via send-keys
      const claudeLaunch = execCalls.find(
        (c) =>
          c.command.includes("send-keys") &&
          c.command.includes(":claude") &&
          c.command.includes("'claude'") &&
          c.command.includes("Enter")
      );

      expect(claudeLaunch).toBeDefined();
      expect(claudeLaunch!.command).not.toContain("--sdk-url");
      expect(claudeLaunch!.hostName).toBe("my-server");
    });

    test("remote session does NOT include --permission-mode acceptEdits", async () => {
      await createSession("remote-no-perms", "/tmp/work", "my-server");

      const allCommands = execCalls.map((c) => c.command).join("\n");
      // The only send-keys to :claude should be 'claude' Enter
      const claudeWindow = execCalls.filter(
        (c) =>
          c.command.includes("send-keys") &&
          c.command.includes(":claude") &&
          c.command.includes("claude")
      );

      // None of the commands should contain --permission-mode
      for (const cmd of claudeWindow) {
        if (cmd.command.includes("'claude'") && cmd.command.includes("Enter")) {
          expect(cmd.command).not.toContain("--permission-mode");
        }
      }
    });
  });

  // ─── 4. autoAcceptClaudeTrust for remote only ──────────────────

  describe("autoAcceptClaudeTrust() usage", () => {
    test("local session does NOT call autoAcceptClaudeTrust", async () => {
      await createSession("local-no-trust", "/tmp/work");

      // autoAcceptClaudeTrust writes a watcher script to /tmp/csm-trust-watcher-*
      const trustWatcherCmds = execCalls.filter((c) =>
        c.command.includes("csm-trust-watcher")
      );

      expect(trustWatcherCmds).toHaveLength(0);
    });

    test("remote session calls autoAcceptClaudeTrust", async () => {
      await createSession("remote-trust", "/tmp/work", "my-server");

      // autoAcceptClaudeTrust writes a watcher script
      const trustWatcherCmds = execCalls.filter((c) =>
        c.command.includes("csm-trust-watcher")
      );

      expect(trustWatcherCmds.length).toBeGreaterThan(0);
    });
  });

  // ─── 5. sendToSession: WebSocket-first ─────────────────────────

  describe("sendToSession() WebSocket-first message sending", () => {
    test("sends via WebSocket when session is connected locally", async () => {
      wsConnectedSessions.add("ws-test");

      const result = await sendToSession("ws-test", "Hello from WS");

      expect(result.success).toBe(true);
      expect(wsSentMessages).toHaveLength(1);
      expect(wsSentMessages[0].name).toBe("ws-test");
      expect(wsSentMessages[0].text).toBe("Hello from WS");

      // Should NOT have called tmux send-keys for this
      const tmuxSendKeys = execCalls.filter((c) =>
        c.command.includes("send-keys") && c.command.includes("csm-ws-test")
      );
      expect(tmuxSendKeys).toHaveLength(0);
    });

    test("falls back to tmux send-keys when session is not WS-connected", async () => {
      // wsConnectedSessions is empty — no WS connections

      const result = await sendToSession("fallback-test", "Hello from tmux");

      expect(result.success).toBe(true);
      expect(wsSentMessages).toHaveLength(0);

      // Should have used tmux send-keys
      const tmuxSendKeys = execCalls.filter(
        (c) => c.command.includes("send-keys") && c.command.includes("csm-fallback-test")
      );
      expect(tmuxSendKeys.length).toBeGreaterThan(0);
    });

    test("remote session always uses tmux send-keys (never WebSocket)", async () => {
      // Even if session name matches a WS-connected one
      wsConnectedSessions.add("remote-send");

      const result = await sendToSession("remote-send", "Hello remote", "my-server");

      expect(result.success).toBe(true);

      // WebSocket should NOT be used for remote sessions
      expect(wsSentMessages).toHaveLength(0);

      // Should use tmux send-keys with hostName
      const tmuxSendKeys = execCalls.filter(
        (c) => c.command.includes("send-keys") && c.hostName === "my-server"
      );
      expect(tmuxSendKeys.length).toBeGreaterThan(0);
    });
  });

  // ─── 6. apiPort configuration ──────────────────────────────────

  describe("apiPort configuration", () => {
    test("default apiPort is 3000 when not configured", async () => {
      mockConfig = {}; // no apiPort

      await createSession("default-port", "/tmp/work");

      const claudeCmd = execCalls.find((c) => c.command.includes("--sdk-url"));
      expect(claudeCmd).toBeDefined();
      expect(claudeCmd!.command).toContain("ws://localhost:3000/");
    });

    test("custom apiPort 4567 is used in SDK URL", async () => {
      mockConfig = { apiPort: 4567 };

      await createSession("custom-4567", "/tmp/work");

      const claudeCmd = execCalls.find((c) => c.command.includes("--sdk-url"));
      expect(claudeCmd).toBeDefined();
      expect(claudeCmd!.command).toContain("ws://localhost:4567/");
    });

  });

  // ─── 7. getSessionName helper ──────────────────────────────────

  describe("getSessionName helper", () => {
    test("prefixes with csm-", () => {
      expect(getSessionName("my-session")).toBe("csm-my-session");
    });
  });

  // Clean up mocks to prevent leakage into other test files
  afterAll(async () => {
    // Restore all mocks
    mock.restore();
    // Force re-import of real modules to clear module cache
    await import("../ssh?t=" + Date.now());
    await import("../config?t=" + Date.now());
    await import("../ws-session-manager?t=" + Date.now());
    await import("../worktree?t=" + Date.now());
  });
});
