/**
 * Phase 3 TUI Hook Integration Tests
 *
 * Tests the three new/updated hooks:
 * - useWsSessions: WebSocket session state + tool approvals
 * - useStreamLog: Per-session live log entries
 * - useSessions: WS state merging into tmux sessions
 */

import { describe, expect, test, beforeEach, mock } from "bun:test";
import React, { useRef, useEffect } from "react";
import type {
  WsSessionState,
  WsSessionEvent,
  WsEventListener,
  PendingToolApproval,
} from "../../../lib/ws-types";
import { createInitialSessionState } from "../../../lib/ws-types";

// ─── Mock wsSessionManager ──────────────────────────────────────────────────

// We store the listener callbacks registered via on() so we can fire events in tests.
let eventListeners: WsEventListener[] = [];
let mockSessions: Map<string, WsSessionState> = new Map();
let respondCalls: Array<{
  sessionName: string;
  requestId: string;
  decision: "allow" | "deny";
  message?: string;
}> = [];
let sendMessageCalls: Array<{ sessionName: string; text: string }> = [];

const mockWsSessionManager = {
  getAllSessions: () => new Map(mockSessions),
  getSessionState: (name: string) => mockSessions.get(name),
  isConnected: (name: string) => mockSessions.has(name),
  on: (listener: WsEventListener) => {
    eventListeners.push(listener);
    return () => {
      const idx = eventListeners.indexOf(listener);
      if (idx >= 0) eventListeners.splice(idx, 1);
    };
  },
  respondToToolApproval: (
    sessionName: string,
    requestId: string,
    decision: "allow" | "deny",
    message?: string
  ) => {
    respondCalls.push({ sessionName, requestId, decision, message });
    return true;
  },
  sendUserMessage: (sessionName: string, text: string) => {
    sendMessageCalls.push({ sessionName, text });
    return true;
  },
};

mock.module("../../../lib/ws-session-manager", () => ({
  wsSessionManager: mockWsSessionManager,
}));

// Mock listSessions and getHosts for useSessions tests
let mockListSessionsResult: any[] = [];
let mockHostsResult: Record<string, { host: string }> = {};

mock.module("../../../lib/tmux", () => ({
  listSessions: mock(async () => [...mockListSessionsResult]),
}));

mock.module("../../../lib/config", () => ({
  getHosts: mock(async () => ({ ...mockHostsResult })),
}));

// Import hooks after mocking
const { useWsSessions } = await import("../useWsSessions");
const { useStreamLog } = await import("../useStreamLog");
const { useSessions } = await import("../useSessions");

// Import ink-testing-library
const { render } = await import("ink-testing-library");
const { Text } = await import("ink");

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Fire an event to all registered listeners (simulates wsSessionManager.emit) */
function fireEvent(event: WsSessionEvent): void {
  for (const listener of [...eventListeners]) {
    listener(event);
  }
}

/** Small async delay */
function tick(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Create a mock WsSessionState with optional overrides */
function makeSessionState(
  name: string,
  overrides: Partial<WsSessionState> = {}
): WsSessionState {
  return {
    ...createInitialSessionState(name),
    status: "ready",
    claudeSessionId: `claude-${name}`,
    model: "claude-sonnet-4-5-20250929",
    ...overrides,
  };
}

/** Create a mock PendingToolApproval */
function makePendingApproval(
  overrides: Partial<PendingToolApproval> = {}
): PendingToolApproval {
  return {
    requestId: "req-001",
    toolName: "Bash",
    toolInput: { command: "ls -la" },
    toolUseId: "tool-use-001",
    receivedAt: Date.now(),
    ...overrides,
  };
}

// ─── Reset state before each test ───────────────────────────────────────────

beforeEach(() => {
  eventListeners = [];
  mockSessions = new Map();
  respondCalls = [];
  sendMessageCalls = [];
  mockListSessionsResult = [];
  mockHostsResult = {};
});

// ─── useWsSessions Tests ────────────────────────────────────────────────────

describe("useWsSessions hook", () => {
  test("returns initial wsStates from wsSessionManager", async () => {
    // Set up mock sessions before rendering
    mockSessions.set("session-a", makeSessionState("session-a"));
    mockSessions.set("session-b", makeSessionState("session-b", { status: "working" }));

    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    expect(hookResult).toBeDefined();
    expect(hookResult!.wsStates.size).toBe(2);
    expect(hookResult!.wsStates.get("session-a")?.status).toBe("ready");
    expect(hookResult!.wsStates.get("session-b")?.status).toBe("working");

    unmount();
  });

  test("subscribes to wsSessionManager events on mount", async () => {
    const TestComponent = () => {
      useWsSessions();
      return React.createElement(Text, null, "test");
    };

    expect(eventListeners.length).toBe(0);

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    expect(eventListeners.length).toBeGreaterThan(0);

    unmount();
  });

  test("unsubscribes from events on unmount", async () => {
    const TestComponent = () => {
      useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    const listenerCount = eventListeners.length;
    expect(listenerCount).toBeGreaterThan(0);

    unmount();
    await tick();

    expect(eventListeners.length).toBe(listenerCount - 1);
  });

  test("updates wsStates when events are fired", async () => {
    mockSessions.set("session-a", makeSessionState("session-a"));

    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Simulate a status change by updating the mock state and firing event
    mockSessions.set(
      "session-a",
      makeSessionState("session-a", { status: "working" })
    );
    fireEvent({
      type: "status_changed",
      sessionName: "session-a",
      previousStatus: "ready",
      newStatus: "working",
    });
    await tick();

    expect(hookResult!.wsStates.get("session-a")?.status).toBe("working");

    unmount();
  });

  test("tracks pending approvals from tool_approval_needed events", async () => {
    mockSessions.set("session-a", makeSessionState("session-a"));

    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, `approvals:${hookResult.pendingApprovals.length}`);
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    expect(hookResult!.pendingApprovals).toHaveLength(0);

    // Fire a tool approval event
    fireEvent({
      type: "tool_approval_needed",
      sessionName: "session-a",
      approval: makePendingApproval(),
    });
    await tick();

    expect(hookResult!.pendingApprovals).toHaveLength(1);
    expect(hookResult!.pendingApprovals[0].sessionName).toBe("session-a");
    expect(hookResult!.pendingApprovals[0].toolName).toBe("Bash");
    expect(hookResult!.pendingApprovals[0].requestId).toBe("req-001");

    unmount();
  });

  test("removes pending approvals on tool_approval_resolved events", async () => {
    mockSessions.set("session-a", makeSessionState("session-a"));

    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Add a pending approval
    fireEvent({
      type: "tool_approval_needed",
      sessionName: "session-a",
      approval: makePendingApproval(),
    });
    await tick();
    expect(hookResult!.pendingApprovals).toHaveLength(1);

    // Resolve the approval
    fireEvent({
      type: "tool_approval_resolved",
      sessionName: "session-a",
      requestId: "req-001",
    });
    await tick();

    expect(hookResult!.pendingApprovals).toHaveLength(0);

    unmount();
  });

  test("cleans up approvals when session disconnects", async () => {
    mockSessions.set("session-a", makeSessionState("session-a"));

    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Add pending approvals
    fireEvent({
      type: "tool_approval_needed",
      sessionName: "session-a",
      approval: makePendingApproval({ requestId: "req-001" }),
    });
    fireEvent({
      type: "tool_approval_needed",
      sessionName: "session-a",
      approval: makePendingApproval({ requestId: "req-002", toolName: "Read" }),
    });
    await tick();
    expect(hookResult!.pendingApprovals).toHaveLength(2);

    // Disconnect the session
    fireEvent({
      type: "session_disconnected",
      sessionName: "session-a",
    });
    await tick();

    expect(hookResult!.pendingApprovals).toHaveLength(0);

    unmount();
  });

  test("tracks approvals across multiple sessions independently", async () => {
    mockSessions.set("session-a", makeSessionState("session-a"));
    mockSessions.set("session-b", makeSessionState("session-b"));

    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Add approvals for different sessions
    fireEvent({
      type: "tool_approval_needed",
      sessionName: "session-a",
      approval: makePendingApproval({ requestId: "req-a1" }),
    });
    fireEvent({
      type: "tool_approval_needed",
      sessionName: "session-b",
      approval: makePendingApproval({ requestId: "req-b1", toolName: "Write" }),
    });
    await tick();

    expect(hookResult!.pendingApprovals).toHaveLength(2);

    // Disconnect session-a only
    fireEvent({
      type: "session_disconnected",
      sessionName: "session-a",
    });
    await tick();

    expect(hookResult!.pendingApprovals).toHaveLength(1);
    expect(hookResult!.pendingApprovals[0].sessionName).toBe("session-b");

    unmount();
  });

  test("approveTool calls wsSessionManager.respondToToolApproval with 'allow'", async () => {
    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    const result = hookResult!.approveTool("session-a", "req-001");

    expect(result).toBe(true);
    expect(respondCalls).toHaveLength(1);
    expect(respondCalls[0]).toEqual({
      sessionName: "session-a",
      requestId: "req-001",
      decision: "allow",
      message: undefined,
    });

    unmount();
  });

  test("denyTool calls wsSessionManager.respondToToolApproval with 'deny'", async () => {
    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    const result = hookResult!.denyTool("session-a", "req-001", "Not allowed");

    expect(result).toBe(true);
    expect(respondCalls).toHaveLength(1);
    expect(respondCalls[0]).toEqual({
      sessionName: "session-a",
      requestId: "req-001",
      decision: "deny",
      message: "Not allowed",
    });

    unmount();
  });

  test("sendMessage calls wsSessionManager.sendUserMessage", async () => {
    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    const result = hookResult!.sendMessage("session-a", "Hello");

    expect(result).toBe(true);
    expect(sendMessageCalls).toHaveLength(1);
    expect(sendMessageCalls[0]).toEqual({
      sessionName: "session-a",
      text: "Hello",
    });

    unmount();
  });

  test("picks up initial pending approvals from existing sessions", async () => {
    const approval = makePendingApproval();
    mockSessions.set(
      "session-a",
      makeSessionState("session-a", { pendingToolApproval: approval })
    );

    let hookResult: ReturnType<typeof useWsSessions> | undefined;

    const TestComponent = () => {
      hookResult = useWsSessions();
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Should pick up the pre-existing approval
    expect(hookResult!.pendingApprovals).toHaveLength(1);
    expect(hookResult!.pendingApprovals[0].requestId).toBe("req-001");
    expect(hookResult!.pendingApprovals[0].toolName).toBe("Bash");

    unmount();
  });
});

// ─── useStreamLog Tests ─────────────────────────────────────────────────────

describe("useStreamLog hook", () => {
  test("starts with empty entries and no streaming text", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    expect(hookResult).toBeDefined();
    expect(hookResult!.entries).toHaveLength(0);
    expect(hookResult!.streamingText).toBe("");

    unmount();
  });

  test("adds assistant_message events as log entries", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    fireEvent({
      type: "assistant_message",
      sessionName: "session-a",
      text: "Hello, I can help!",
      contentBlocks: [{ type: "text", text: "Hello, I can help!" }],
      stopReason: "end_turn",
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(1);
    expect(hookResult!.entries[0].type).toBe("assistant");
    expect(hookResult!.entries[0].content).toBe("Hello, I can help!");
    expect(hookResult!.entries[0].metadata?.stopReason).toBe("end_turn");

    unmount();
  });

  test("adds tool_approval_needed events as log entries", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    fireEvent({
      type: "tool_approval_needed",
      sessionName: "session-a",
      approval: makePendingApproval(),
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(1);
    expect(hookResult!.entries[0].type).toBe("tool_approval");
    expect(hookResult!.entries[0].content).toContain("Bash");
    expect(hookResult!.entries[0].metadata?.toolName).toBe("Bash");

    unmount();
  });

  test("adds result events as log entries", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    fireEvent({
      type: "result",
      sessionName: "session-a",
      success: true,
      result: "Task completed",
      numTurns: 3,
      totalCostUsd: 0.05,
      durationMs: 10000,
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(1);
    expect(hookResult!.entries[0].type).toBe("result");
    expect(hookResult!.entries[0].content).toBe("Task completed");
    expect(hookResult!.entries[0].metadata?.success).toBe(true);
    expect(hookResult!.entries[0].metadata?.numTurns).toBe(3);

    unmount();
  });

  test("adds error result events with error content", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    fireEvent({
      type: "result",
      sessionName: "session-a",
      success: false,
      errors: ["Something broke"],
      numTurns: 1,
      totalCostUsd: 0.01,
      durationMs: 2000,
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(1);
    expect(hookResult!.entries[0].type).toBe("result");
    expect(hookResult!.entries[0].content).toContain("Error");
    expect(hookResult!.entries[0].content).toContain("Something broke");
    expect(hookResult!.entries[0].metadata?.success).toBe(false);

    unmount();
  });

  test("adds status_changed events as log entries", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    fireEvent({
      type: "status_changed",
      sessionName: "session-a",
      previousStatus: "ready",
      newStatus: "working",
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(1);
    expect(hookResult!.entries[0].type).toBe("status");
    expect(hookResult!.entries[0].content).toBe("ready -> working");
    expect(hookResult!.entries[0].metadata?.previousStatus).toBe("ready");
    expect(hookResult!.entries[0].metadata?.newStatus).toBe("working");

    unmount();
  });

  test("adds error events as log entries", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    fireEvent({
      type: "error",
      sessionName: "session-a",
      error: "Connection lost",
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(1);
    expect(hookResult!.entries[0].type).toBe("error");
    expect(hookResult!.entries[0].content).toBe("Connection lost");

    unmount();
  });

  test("accumulates streaming text from stream_delta events", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    fireEvent({
      type: "stream_delta",
      sessionName: "session-a",
      text: "Hello",
      accumulatedText: "Hello",
    });
    await tick();

    expect(hookResult!.streamingText).toBe("Hello");

    fireEvent({
      type: "stream_delta",
      sessionName: "session-a",
      text: ", world!",
      accumulatedText: "Hello, world!",
    });
    await tick();

    expect(hookResult!.streamingText).toBe("Hello, world!");

    unmount();
  });

  test("clears streaming text when result event arrives", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Start streaming
    fireEvent({
      type: "stream_delta",
      sessionName: "session-a",
      text: "partial output...",
      accumulatedText: "partial output...",
    });
    await tick();
    expect(hookResult!.streamingText).toBe("partial output...");

    // Result arrives
    fireEvent({
      type: "result",
      sessionName: "session-a",
      success: true,
      result: "Done",
      numTurns: 1,
      totalCostUsd: 0.01,
      durationMs: 1000,
    });
    await tick();

    expect(hookResult!.streamingText).toBe("");

    unmount();
  });

  test("filters events by session name", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Fire event for a different session
    fireEvent({
      type: "assistant_message",
      sessionName: "session-b",
      text: "This is for session-b",
      contentBlocks: [{ type: "text", text: "This is for session-b" }],
      stopReason: "end_turn",
    });
    await tick();

    // Should not appear in session-a's log
    expect(hookResult!.entries).toHaveLength(0);

    // Fire event for session-a
    fireEvent({
      type: "assistant_message",
      sessionName: "session-a",
      text: "This is for session-a",
      contentBlocks: [{ type: "text", text: "This is for session-a" }],
      stopReason: "end_turn",
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(1);
    expect(hookResult!.entries[0].content).toBe("This is for session-a");

    unmount();
  });

  test("limits log entries to maxEntries", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a", 3);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Add 5 entries
    for (let i = 0; i < 5; i++) {
      fireEvent({
        type: "assistant_message",
        sessionName: "session-a",
        text: `Message ${i}`,
        contentBlocks: [{ type: "text", text: `Message ${i}` }],
        stopReason: "end_turn",
      });
      await tick();
    }

    // Should only have the last 3
    expect(hookResult!.entries).toHaveLength(3);
    expect(hookResult!.entries[0].content).toBe("Message 2");
    expect(hookResult!.entries[1].content).toBe("Message 3");
    expect(hookResult!.entries[2].content).toBe("Message 4");

    unmount();
  });

  test("resets state when session name changes", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;
    let currentSession = "session-a";

    const TestComponent = ({ sessionName }: { sessionName: string }) => {
      hookResult = useStreamLog(sessionName);
      return React.createElement(Text, null, "test");
    };

    const { rerender, unmount } = render(
      React.createElement(TestComponent, { sessionName: "session-a" })
    );
    await tick();

    // Add entries for session-a
    fireEvent({
      type: "assistant_message",
      sessionName: "session-a",
      text: "Session A message",
      contentBlocks: [{ type: "text", text: "Session A message" }],
      stopReason: "end_turn",
    });
    await tick();
    expect(hookResult!.entries).toHaveLength(1);

    // Switch to session-b
    rerender(React.createElement(TestComponent, { sessionName: "session-b" }));
    await tick();

    // Entries should be reset
    expect(hookResult!.entries).toHaveLength(0);
    expect(hookResult!.streamingText).toBe("");

    unmount();
  });

  test("does nothing when sessionName is undefined", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog(undefined);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // No listeners should be registered for undefined session
    const listenerCountBefore = eventListeners.length;

    fireEvent({
      type: "assistant_message",
      sessionName: "any-session",
      text: "Should not be captured",
      contentBlocks: [{ type: "text", text: "Should not be captured" }],
      stopReason: "end_turn",
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(0);

    unmount();
  });

  test("clear() resets entries and streaming text", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    // Add some entries and streaming text
    fireEvent({
      type: "assistant_message",
      sessionName: "session-a",
      text: "Message 1",
      contentBlocks: [{ type: "text", text: "Message 1" }],
      stopReason: "end_turn",
    });
    fireEvent({
      type: "stream_delta",
      sessionName: "session-a",
      text: "streaming...",
      accumulatedText: "streaming...",
    });
    await tick();

    expect(hookResult!.entries).toHaveLength(1);
    expect(hookResult!.streamingText).toBe("streaming...");

    // Clear
    hookResult!.clear();
    await tick();

    expect(hookResult!.entries).toHaveLength(0);
    expect(hookResult!.streamingText).toBe("");

    unmount();
  });

  test("log entries have timestamps", async () => {
    let hookResult: ReturnType<typeof useStreamLog> | undefined;

    const TestComponent = () => {
      hookResult = useStreamLog("session-a");
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick();

    const before = new Date();
    fireEvent({
      type: "assistant_message",
      sessionName: "session-a",
      text: "Timed message",
      contentBlocks: [{ type: "text", text: "Timed message" }],
      stopReason: "end_turn",
    });
    await tick();
    const after = new Date();

    expect(hookResult!.entries[0].timestamp).toBeInstanceOf(Date);
    expect(hookResult!.entries[0].timestamp.getTime()).toBeGreaterThanOrEqual(
      before.getTime()
    );
    expect(hookResult!.entries[0].timestamp.getTime()).toBeLessThanOrEqual(
      after.getTime()
    );

    unmount();
  });
});

// ─── useSessions WS State Merging Tests ─────────────────────────────────────

describe("useSessions WS state merging", () => {
  test("merges WS status into tmux sessions", async () => {
    // Set up tmux sessions
    mockListSessionsResult = [
      {
        name: "session-a",
        fullName: "csm-session-a",
        attached: false,
        windows: 1,
        created: new Date().toISOString(),
      },
    ];

    // Set up WS state
    mockSessions.set(
      "session-a",
      makeSessionState("session-a", { status: "working" })
    );

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    // Find SET_SESSIONS action
    const setSessionsAction = dispatched.find(
      (a) => a.type === "SET_SESSIONS"
    );
    expect(setSessionsAction).toBeDefined();
    expect(setSessionsAction.sessions[0].claudeState).toBe("working");

    unmount();
  });

  test("maps WS 'waiting_for_input' status correctly", async () => {
    mockListSessionsResult = [
      {
        name: "session-a",
        fullName: "csm-session-a",
        attached: false,
        windows: 1,
        created: new Date().toISOString(),
      },
    ];

    mockSessions.set(
      "session-a",
      makeSessionState("session-a", { status: "waiting_for_input" })
    );

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    const setSessionsAction = dispatched.find(
      (a) => a.type === "SET_SESSIONS"
    );
    expect(setSessionsAction).toBeDefined();
    expect(setSessionsAction.sessions[0].claudeState).toBe("waiting_for_input");

    unmount();
  });

  test("maps WS 'ready' status to 'idle'", async () => {
    mockListSessionsResult = [
      {
        name: "session-a",
        fullName: "csm-session-a",
        attached: false,
        windows: 1,
        created: new Date().toISOString(),
      },
    ];

    mockSessions.set(
      "session-a",
      makeSessionState("session-a", { status: "ready" })
    );

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    const setSessionsAction = dispatched.find(
      (a) => a.type === "SET_SESSIONS"
    );
    expect(setSessionsAction).toBeDefined();
    expect(setSessionsAction.sessions[0].claudeState).toBe("idle");

    unmount();
  });

  test("does not merge WS state for disconnected sessions", async () => {
    mockListSessionsResult = [
      {
        name: "session-a",
        fullName: "csm-session-a",
        attached: false,
        windows: 1,
        created: new Date().toISOString(),
      },
    ];

    mockSessions.set(
      "session-a",
      makeSessionState("session-a", { status: "disconnected" })
    );

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    const setSessionsAction = dispatched.find(
      (a) => a.type === "SET_SESSIONS"
    );
    expect(setSessionsAction).toBeDefined();
    // Should not have claudeState set since WS is disconnected
    expect(setSessionsAction.sessions[0].claudeState).toBeUndefined();

    unmount();
  });

  test("merges lastAssistantMessage from WS state", async () => {
    mockListSessionsResult = [
      {
        name: "session-a",
        fullName: "csm-session-a",
        attached: false,
        windows: 1,
        created: new Date().toISOString(),
      },
    ];

    mockSessions.set(
      "session-a",
      makeSessionState("session-a", {
        status: "working",
        lastAssistantMessage: "Working on it...",
      })
    );

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    const setSessionsAction = dispatched.find(
      (a) => a.type === "SET_SESSIONS"
    );
    expect(setSessionsAction.sessions[0].claudeLastMessage).toBe(
      "Working on it..."
    );

    unmount();
  });

  test("triggers refresh on session_connected event", async () => {
    mockListSessionsResult = [
      {
        name: "session-a",
        fullName: "csm-session-a",
        attached: false,
        windows: 1,
        created: new Date().toISOString(),
      },
    ];

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    const initialCount = dispatched.filter(
      (a) => a.type === "SET_SESSIONS"
    ).length;

    // Fire a session_connected event to trigger refresh
    fireEvent({
      type: "session_connected",
      sessionName: "session-a",
      claudeSessionId: "claude-a",
      model: "claude-sonnet-4-5-20250929",
      tools: [],
    });
    await tick(200);

    const newCount = dispatched.filter(
      (a) => a.type === "SET_SESSIONS"
    ).length;
    expect(newCount).toBeGreaterThan(initialCount);

    unmount();
  });

  test("triggers refresh on status_changed event", async () => {
    mockListSessionsResult = [
      {
        name: "session-a",
        fullName: "csm-session-a",
        attached: false,
        windows: 1,
        created: new Date().toISOString(),
      },
    ];

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    const initialCount = dispatched.filter(
      (a) => a.type === "SET_SESSIONS"
    ).length;

    fireEvent({
      type: "status_changed",
      sessionName: "session-a",
      previousStatus: "ready",
      newStatus: "working",
    });
    await tick(200);

    const newCount = dispatched.filter(
      (a) => a.type === "SET_SESSIONS"
    ).length;
    expect(newCount).toBeGreaterThan(initialCount);

    unmount();
  });

  test("triggers refresh on session_disconnected event", async () => {
    mockListSessionsResult = [
      {
        name: "session-a",
        fullName: "csm-session-a",
        attached: false,
        windows: 1,
        created: new Date().toISOString(),
      },
    ];

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    const initialCount = dispatched.filter(
      (a) => a.type === "SET_SESSIONS"
    ).length;

    fireEvent({
      type: "session_disconnected",
      sessionName: "session-a",
    });
    await tick(200);

    const newCount = dispatched.filter(
      (a) => a.type === "SET_SESSIONS"
    ).length;
    expect(newCount).toBeGreaterThan(initialCount);

    unmount();
  });

  test("dispatches SET_ERROR on exception", async () => {
    // Set up listSessions to throw
    const { listSessions } = await import("../../../lib/tmux");
    (listSessions as any).mockImplementationOnce(() => {
      throw new Error("Network error");
    });

    let dispatched: any[] = [];
    const dispatch = (action: any) => {
      dispatched.push(action);
    };

    const TestComponent = () => {
      useSessions(dispatch);
      return React.createElement(Text, null, "test");
    };

    const { unmount } = render(React.createElement(TestComponent));
    await tick(200);

    const errorAction = dispatched.find((a) => a.type === "SET_ERROR");
    expect(errorAction).toBeDefined();
    expect(errorAction.error).toContain("Network error");

    unmount();
  });
});
