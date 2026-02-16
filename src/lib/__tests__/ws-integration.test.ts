import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import type { Server } from "bun";
import { startApiServer, resetMasterState } from "../../api/server";
import { wsSessionManager, type WsSocketData } from "../ws-session-manager";
import type {
  WsSessionEvent,
  SystemInitMessage,
  AssistantMessage,
  ResultSuccessMessage,
  ResultErrorMessage,
  StreamEventMessage,
  ControlRequestMessage,
} from "../ws-types";

// Use a random high port to avoid conflicts
let port: number;
let server: Server<WsSocketData>;

function wsUrl(sessionName: string): string {
  return `ws://localhost:${port}/ws/sessions?name=${sessionName}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sendNdjson(ws: WebSocket, msg: any): void {
  ws.send(JSON.stringify(msg) + "\n");
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener("error", (e) => reject(e), { once: true });
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) return resolve();
    ws.addEventListener("close", () => resolve(), { once: true });
  });
}

function collectEvents(): { events: WsSessionEvent[]; unsub: () => void } {
  const events: WsSessionEvent[] = [];
  const unsub = wsSessionManager.on((e) => events.push(e));
  return { events, unsub };
}

function tick(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Mock message factories ─────────────────────────────────────────

function makeSystemInit(overrides: Partial<SystemInitMessage> = {}): SystemInitMessage {
  return {
    type: "system",
    subtype: "init",
    cwd: "/tmp/test-project",
    session_id: "claude-session-abc",
    tools: ["Bash", "Read", "Write", "Glob", "Grep"],
    mcp_servers: [{ name: "test-mcp", status: "connected" }],
    model: "claude-sonnet-4-5-20250929",
    permissionMode: "default",
    uuid: "uuid-init-001",
    ...overrides,
  };
}

function makeAssistantMessage(
  text: string,
  overrides: Partial<AssistantMessage> = {}
): AssistantMessage {
  return {
    type: "assistant",
    message: {
      id: "msg-001",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
    parent_tool_use_id: null,
    uuid: "uuid-assistant-001",
    session_id: "claude-session-abc",
    ...overrides,
  };
}

function makeResultSuccess(
  overrides: Partial<ResultSuccessMessage> = {}
): ResultSuccessMessage {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Task completed successfully",
    duration_ms: 5000,
    duration_api_ms: 4000,
    num_turns: 1,
    total_cost_usd: 0.015,
    stop_reason: "end_turn",
    usage: {
      input_tokens: 200,
      output_tokens: 100,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    uuid: "uuid-result-001",
    session_id: "claude-session-abc",
    ...overrides,
  };
}

function makeResultError(
  overrides: Partial<ResultErrorMessage> = {}
): ResultErrorMessage {
  return {
    type: "result",
    subtype: "error_during_execution",
    is_error: true,
    errors: ["Something went wrong"],
    duration_ms: 3000,
    num_turns: 1,
    total_cost_usd: 0.01,
    uuid: "uuid-result-err-001",
    session_id: "claude-session-abc",
    ...overrides,
  };
}

function makeStreamEvent(
  deltaText: string,
  overrides: Partial<StreamEventMessage> = {}
): StreamEventMessage {
  return {
    type: "stream_event",
    event: {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: deltaText },
    },
    parent_tool_use_id: null,
    uuid: "uuid-stream-001",
    session_id: "claude-session-abc",
    ...overrides,
  };
}

function makeControlRequest(
  toolName: string,
  overrides: Partial<ControlRequestMessage> = {}
): ControlRequestMessage {
  return {
    type: "control_request",
    request_id: "req-001",
    request: {
      subtype: "can_use_tool",
      tool_name: toolName,
      input: { command: "ls -la" },
      tool_use_id: "tool-use-001",
    },
    ...overrides,
  };
}

// ─── Test suite ────────────────────────────────────────────────────

describe("WebSocket Integration Tests", () => {
  beforeEach(async () => {
    resetMasterState();
    for (const [name] of wsSessionManager.getAllSessions()) {
      wsSessionManager.removeSession(name);
    }
    port = 10000 + Math.floor(Math.random() * 50000);
    server = await startApiServer(port);
  });

  afterEach(async () => {
    server.stop(true);
    await tick(10);
  });

  // ─── 1. Connection establishment ────────────────────────────────

  describe("WebSocket connection establishment", () => {
    test("connects and tracks session with initial connecting state", async () => {
      const ws = new WebSocket(wsUrl("test-session"));
      await waitForOpen(ws);

      expect(ws.readyState).toBe(WebSocket.OPEN);
      expect(wsSessionManager.isConnected("test-session")).toBe(true);

      const state = wsSessionManager.getSessionState("test-session");
      expect(state).toBeDefined();
      expect(state!.status).toBe("connecting");
      expect(state!.sessionName).toBe("test-session");

      ws.close();
      await waitForClose(ws);
    });

    test("rejects connection without name parameter", async () => {
      const response = await fetch(`http://localhost:${port}/ws/sessions`);
      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("name");
    });
  });

  // ─── 2. System init message handling ───────────────────────────

  describe("system init message handling", () => {
    test("processes system/init and transitions to ready", async () => {
      const ws = new WebSocket(wsUrl("init-test"));
      await waitForOpen(ws);

      const { events, unsub } = collectEvents();

      sendNdjson(ws, makeSystemInit());
      await tick();

      const state = wsSessionManager.getSessionState("init-test");
      expect(state).toBeDefined();
      expect(state!.status).toBe("ready");
      expect(state!.claudeSessionId).toBe("claude-session-abc");
      expect(state!.model).toBe("claude-sonnet-4-5-20250929");
      expect(state!.tools).toEqual(["Bash", "Read", "Write", "Glob", "Grep"]);
      expect(state!.mcpServers).toEqual([{ name: "test-mcp", status: "connected" }]);
      expect(state!.cwd).toBe("/tmp/test-project");

      const connectedEvents = events.filter((e) => e.type === "session_connected");
      expect(connectedEvents.length).toBe(1);
      const ce = connectedEvents[0] as any;
      expect(ce.claudeSessionId).toBe("claude-session-abc");
      expect(ce.model).toBe("claude-sonnet-4-5-20250929");
      expect(ce.tools).toEqual(["Bash", "Read", "Write", "Glob", "Grep"]);

      const statusEvents = events.filter((e) => e.type === "status_changed");
      expect(statusEvents.length).toBe(1);
      const se = statusEvents[0] as any;
      expect(se.newStatus).toBe("ready");
      expect(se.previousStatus).toBe("connecting");

      unsub();
      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 3. Assistant message flow ──────────────────────────────────

  describe("assistant message flow", () => {
    test("processes assistant message and transitions to working", async () => {
      const ws = new WebSocket(wsUrl("assistant-test"));
      await waitForOpen(ws);

      sendNdjson(ws, makeSystemInit());
      await tick();

      const { events, unsub } = collectEvents();

      sendNdjson(ws, makeAssistantMessage("Hello, I can help with that!"));
      await tick();

      const state = wsSessionManager.getSessionState("assistant-test");
      expect(state!.status).toBe("working");
      expect(state!.lastAssistantMessage).toBe("Hello, I can help with that!");
      expect(state!.totalUsage.input_tokens).toBe(100);
      expect(state!.totalUsage.output_tokens).toBe(50);

      const statusEvents = events.filter((e) => e.type === "status_changed");
      expect(statusEvents.length).toBe(1);
      expect((statusEvents[0] as any).newStatus).toBe("working");

      const msgEvents = events.filter((e) => e.type === "assistant_message");
      expect(msgEvents.length).toBe(1);
      expect((msgEvents[0] as any).text).toBe("Hello, I can help with that!");

      unsub();
      ws.close();
      await waitForClose(ws);
    });

    test("handles assistant message with tool_use content blocks", async () => {
      const ws = new WebSocket(wsUrl("tool-use-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      const { events, unsub } = collectEvents();

      const msg: AssistantMessage = {
        type: "assistant",
        message: {
          id: "msg-002",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-4-5-20250929",
          content: [
            { type: "text", text: "Let me check that file." },
            { type: "tool_use", id: "tu-1", name: "Read", input: { file_path: "/tmp/test.txt" } },
          ],
          stop_reason: "tool_use",
          usage: {
            input_tokens: 80,
            output_tokens: 40,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
          },
        },
        parent_tool_use_id: null,
        uuid: "uuid-assistant-002",
        session_id: "claude-session-abc",
      };

      sendNdjson(ws, msg);
      await tick();

      const state = wsSessionManager.getSessionState("tool-use-test");
      expect(state!.lastAssistantMessage).toBe("Let me check that file.");

      const msgEvents = events.filter((e) => e.type === "assistant_message");
      expect(msgEvents.length).toBe(1);
      const me = msgEvents[0] as any;
      expect(me.contentBlocks).toHaveLength(2);
      expect(me.contentBlocks[0].type).toBe("text");
      expect(me.contentBlocks[1].type).toBe("tool_use");
      expect(me.stopReason).toBe("tool_use");

      unsub();
      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 4. Result message handling ──────────────────────────────────

  describe("result message handling", () => {
    test("processes success result and transitions to waiting_for_input", async () => {
      const ws = new WebSocket(wsUrl("result-test"));
      await waitForOpen(ws);

      sendNdjson(ws, makeSystemInit());
      await tick();
      sendNdjson(ws, makeAssistantMessage("Working on it..."));
      await tick();

      const { events, unsub } = collectEvents();

      sendNdjson(ws, makeResultSuccess());
      await tick();

      const state = wsSessionManager.getSessionState("result-test");
      expect(state!.status).toBe("waiting_for_input");
      expect(state!.turnCount).toBeGreaterThanOrEqual(1);
      expect(state!.totalCostUsd).toBe(0.015);

      const statusEvents = events.filter((e) => e.type === "status_changed");
      expect(statusEvents.length).toBe(1);
      expect((statusEvents[0] as any).newStatus).toBe("waiting_for_input");
      expect((statusEvents[0] as any).previousStatus).toBe("working");

      const resultEvents = events.filter((e) => e.type === "result");
      expect(resultEvents.length).toBe(1);
      const re = resultEvents[0] as any;
      expect(re.success).toBe(true);
      expect(re.durationMs).toBe(5000);
      expect(re.numTurns).toBe(1);
      expect(re.totalCostUsd).toBe(0.015);

      unsub();
      ws.close();
      await waitForClose(ws);
    });

    test("handles error result", async () => {
      const ws = new WebSocket(wsUrl("error-result-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      const { events, unsub } = collectEvents();

      sendNdjson(ws, makeResultError());
      await tick();

      const resultEvents = events.filter((e) => e.type === "result");
      expect(resultEvents.length).toBe(1);
      const re = resultEvents[0] as any;
      expect(re.success).toBe(false);

      // Should also emit an error event
      const errorEvents = events.filter((e) => e.type === "error");
      expect(errorEvents.length).toBe(1);
      expect((errorEvents[0] as any).error).toContain("Something went wrong");

      unsub();
      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 5. Stream event handling ─────────────────────────────────

  describe("stream event handling", () => {
    test("accumulates streaming text from text_delta events", async () => {
      const ws = new WebSocket(wsUrl("stream-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      const { events, unsub } = collectEvents();

      sendNdjson(ws, makeStreamEvent("Hello"));
      sendNdjson(ws, makeStreamEvent(", "));
      sendNdjson(ws, makeStreamEvent("world!"));
      await tick();

      const state = wsSessionManager.getSessionState("stream-test");
      expect(state!.streamingText).toBe("Hello, world!");

      const deltaEvents = events.filter((e) => e.type === "stream_delta");
      expect(deltaEvents.length).toBe(3);

      const lastDelta = deltaEvents[2] as any;
      expect(lastDelta.accumulatedText).toBe("Hello, world!");
      expect(lastDelta.text).toBe("world!");

      unsub();
      ws.close();
      await waitForClose(ws);
    });

    test("ignores non-text_delta stream events", async () => {
      const ws = new WebSocket(wsUrl("stream-ignore-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      const { events, unsub } = collectEvents();

      const msgStart: StreamEventMessage = {
        type: "stream_event",
        event: { type: "message_start" },
        parent_tool_use_id: null,
        uuid: "uuid-stream-noop",
        session_id: "claude-session-abc",
      };
      sendNdjson(ws, msgStart);
      await tick();

      const deltaEvents = events.filter((e) => e.type === "stream_delta");
      expect(deltaEvents.length).toBe(0);

      unsub();
      ws.close();
      await waitForClose(ws);
    });

    test("streaming text resets on new assistant message", async () => {
      const ws = new WebSocket(wsUrl("stream-reset-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      sendNdjson(ws, makeStreamEvent("partial output..."));
      await tick();

      const stateBefore = wsSessionManager.getSessionState("stream-reset-test");
      expect(stateBefore!.streamingText).toBe("partial output...");

      sendNdjson(ws, makeAssistantMessage("Complete response"));
      await tick();

      const stateAfter = wsSessionManager.getSessionState("stream-reset-test");
      expect(stateAfter!.streamingText).toBe("");

      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 6. Tool approval flow ────────────────────────────────────

  describe("tool approval flow", () => {
    test("sets pendingToolApproval and emits event", async () => {
      const ws = new WebSocket(wsUrl("tool-approval-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      const { events, unsub } = collectEvents();

      sendNdjson(ws, makeControlRequest("Bash"));
      await tick();

      const state = wsSessionManager.getSessionState("tool-approval-test");
      expect(state!.pendingToolApproval).toBeDefined();
      expect(state!.pendingToolApproval!.toolName).toBe("Bash");
      expect(state!.pendingToolApproval!.requestId).toBe("req-001");
      expect(state!.pendingToolApproval!.toolInput).toEqual({ command: "ls -la" });

      const approvalEvents = events.filter((e) => e.type === "tool_approval_needed");
      expect(approvalEvents.length).toBe(1);
      const ae = approvalEvents[0] as any;
      expect(ae.approval.toolName).toBe("Bash");
      expect(ae.approval.requestId).toBe("req-001");

      unsub();
      ws.close();
      await waitForClose(ws);
    });

    test("respondToToolApproval sends allow response and clears pending", async () => {
      const ws = new WebSocket(wsUrl("tool-allow-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();
      sendNdjson(ws, makeControlRequest("Bash"));
      await tick();

      const received: string[] = [];
      ws.addEventListener("message", (e) => {
        received.push(typeof e.data === "string" ? e.data : "");
      });

      const { events, unsub } = collectEvents();

      const result = wsSessionManager.respondToToolApproval(
        "tool-allow-test",
        "req-001",
        "allow"
      );
      expect(result).toBe(true);
      await tick();

      // Pending approval should be cleared
      const state = wsSessionManager.getSessionState("tool-allow-test");
      expect(state!.pendingToolApproval).toBeUndefined();

      // Should emit tool_approval_resolved event
      const resolvedEvents = events.filter((e) => e.type === "tool_approval_resolved");
      expect(resolvedEvents.length).toBe(1);
      expect((resolvedEvents[0] as any).requestId).toBe("req-001");

      // Verify the response was sent over WebSocket
      expect(received.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(received[0].trim());
      expect(parsed.type).toBe("control_response");
      expect(parsed.response.subtype).toBe("success");
      expect(parsed.response.request_id).toBe("req-001");
      expect(parsed.response.response.behavior).toBe("allow");

      unsub();
      ws.close();
      await waitForClose(ws);
    });

    test("respondToToolApproval sends deny response", async () => {
      const ws = new WebSocket(wsUrl("tool-deny-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();
      sendNdjson(ws, makeControlRequest("Bash"));
      await tick();

      const received: string[] = [];
      ws.addEventListener("message", (e) => {
        received.push(typeof e.data === "string" ? e.data : "");
      });

      const result = wsSessionManager.respondToToolApproval(
        "tool-deny-test",
        "req-001",
        "deny",
        "Not allowed"
      );
      expect(result).toBe(true);
      await tick();

      expect(received.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(received[0].trim());
      expect(parsed.response.response.behavior).toBe("deny");

      ws.close();
      await waitForClose(ws);
    });

    test("respondToToolApproval returns false for unknown session", () => {
      const result = wsSessionManager.respondToToolApproval(
        "nonexistent-session",
        "req-001",
        "allow"
      );
      expect(result).toBe(false);
    });
  });

  // ─── 7. Connection close ──────────────────────────────────────

  describe("connection close", () => {
    test("marks session as disconnected and emits events", async () => {
      const ws = new WebSocket(wsUrl("close-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      const { events, unsub } = collectEvents();

      ws.close();
      await waitForClose(ws);
      await tick();

      const state = wsSessionManager.getSessionState("close-test");
      expect(state!.status).toBe("disconnected");

      const disconnectEvents = events.filter((e) => e.type === "session_disconnected");
      expect(disconnectEvents.length).toBe(1);
      expect((disconnectEvents[0] as any).sessionName).toBe("close-test");

      const statusEvents = events.filter((e) => e.type === "status_changed");
      expect(statusEvents.length).toBe(1);
      expect((statusEvents[0] as any).newStatus).toBe("disconnected");

      expect(wsSessionManager.isConnected("close-test")).toBe(false);

      unsub();
    });
  });

  // ─── 8. Multiple sessions ─────────────────────────────────────

  describe("multiple sessions", () => {
    test("tracks multiple sessions independently", async () => {
      const ws1 = new WebSocket(wsUrl("session-alpha"));
      const ws2 = new WebSocket(wsUrl("session-beta"));
      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      sendNdjson(ws1, makeSystemInit({
        session_id: "claude-alpha",
        model: "claude-sonnet-4-5-20250929",
      }));
      sendNdjson(ws2, makeSystemInit({
        session_id: "claude-beta",
        model: "claude-opus-4-6",
      }));
      await tick();

      expect(wsSessionManager.isConnected("session-alpha")).toBe(true);
      expect(wsSessionManager.isConnected("session-beta")).toBe(true);

      const stateA = wsSessionManager.getSessionState("session-alpha");
      const stateB = wsSessionManager.getSessionState("session-beta");

      expect(stateA!.claudeSessionId).toBe("claude-alpha");
      expect(stateB!.claudeSessionId).toBe("claude-beta");
      expect(stateA!.model).toBe("claude-sonnet-4-5-20250929");
      expect(stateB!.model).toBe("claude-opus-4-6");

      sendNdjson(ws1, makeAssistantMessage("Alpha response", { session_id: "claude-alpha" }));
      await tick();

      expect(stateA!.status).toBe("working");
      expect(stateB!.status).toBe("ready");

      const allSessions = wsSessionManager.getAllSessions();
      expect(allSessions.size).toBeGreaterThanOrEqual(2);

      ws1.close();
      ws2.close();
      await Promise.all([waitForClose(ws1), waitForClose(ws2)]);
    });

    test("closing one session does not affect another", async () => {
      const ws1 = new WebSocket(wsUrl("persist-a"));
      const ws2 = new WebSocket(wsUrl("persist-b"));
      await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);

      sendNdjson(ws1, makeSystemInit({ session_id: "persist-a-id" }));
      sendNdjson(ws2, makeSystemInit({ session_id: "persist-b-id" }));
      await tick();

      ws1.close();
      await waitForClose(ws1);
      await tick();

      expect(wsSessionManager.isConnected("persist-b")).toBe(true);
      expect(wsSessionManager.getSessionState("persist-b")!.status).toBe("ready");
      expect(wsSessionManager.isConnected("persist-a")).toBe(false);

      ws2.close();
      await waitForClose(ws2);
    });
  });

  // ─── 9. NDJSON parsing ────────────────────────────────────────

  describe("NDJSON parsing", () => {
    test("handles multiple messages in a single WebSocket frame", async () => {
      const ws = new WebSocket(wsUrl("ndjson-multi"));
      await waitForOpen(ws);

      const { events, unsub } = collectEvents();

      const combined =
        JSON.stringify(makeSystemInit()) +
        "\n" +
        JSON.stringify(makeAssistantMessage("Batch message"));
      ws.send(combined);
      await tick();

      const state = wsSessionManager.getSessionState("ndjson-multi");
      expect(state!.status).toBe("working");
      expect(state!.claudeSessionId).toBe("claude-session-abc");
      expect(state!.lastAssistantMessage).toBe("Batch message");

      const connectedEvents = events.filter((e) => e.type === "session_connected");
      const msgEvents = events.filter((e) => e.type === "assistant_message");
      expect(connectedEvents.length).toBe(1);
      expect(msgEvents.length).toBe(1);

      unsub();
      ws.close();
      await waitForClose(ws);
    });

    test("handles malformed JSON lines gracefully", async () => {
      const ws = new WebSocket(wsUrl("ndjson-malformed"));
      await waitForOpen(ws);

      const data =
        '{"this is not valid json}\n' +
        JSON.stringify(makeSystemInit()) +
        "\n" +
        "also not json\n";
      ws.send(data);
      await tick();

      const state = wsSessionManager.getSessionState("ndjson-malformed");
      expect(state!.status).toBe("ready");
      expect(state!.claudeSessionId).toBe("claude-session-abc");

      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 10. sendUserMessage ──────────────────────────────────────

  describe("sendUserMessage", () => {
    test("sends user message over WebSocket and transitions to working", async () => {
      const ws = new WebSocket(wsUrl("send-msg-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      sendNdjson(ws, makeResultSuccess());
      await tick();

      expect(wsSessionManager.getSessionState("send-msg-test")!.status).toBe(
        "waiting_for_input"
      );

      const received: string[] = [];
      ws.addEventListener("message", (e) => {
        received.push(typeof e.data === "string" ? e.data : "");
      });

      const { events, unsub } = collectEvents();

      const result = wsSessionManager.sendUserMessage(
        "send-msg-test",
        "Please list files"
      );
      expect(result).toBe(true);
      await tick();

      expect(wsSessionManager.getSessionState("send-msg-test")!.status).toBe(
        "working"
      );

      const statusEvents = events.filter((e) => e.type === "status_changed");
      expect(statusEvents.length).toBe(1);
      expect((statusEvents[0] as any).newStatus).toBe("working");

      expect(received.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(received[0].trim());
      expect(parsed.type).toBe("user");
      expect(parsed.message.content).toBe("Please list files");
      expect(parsed.session_id).toBe("claude-session-abc");

      unsub();
      ws.close();
      await waitForClose(ws);
    });

    test("sendUserMessage returns false for unknown session", () => {
      const result = wsSessionManager.sendUserMessage(
        "nonexistent",
        "hello"
      );
      expect(result).toBe(false);
    });
  });

  // ─── 11. keep_alive handling ──────────────────────────────────

  describe("keep_alive handling", () => {
    test("ignores keep_alive messages without errors", async () => {
      const ws = new WebSocket(wsUrl("keepalive-test"));
      await waitForOpen(ws);
      sendNdjson(ws, makeSystemInit());
      await tick();

      const { events, unsub } = collectEvents();

      sendNdjson(ws, { type: "keep_alive" });
      await tick();

      expect(events.length).toBe(0);

      const state = wsSessionManager.getSessionState("keepalive-test");
      expect(state!.status).toBe("ready");

      unsub();
      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 12. Event subscription ───────────────────────────────────

  describe("event subscription", () => {
    test("on() returns working unsubscribe function", async () => {
      const ws = new WebSocket(wsUrl("unsub-test"));
      await waitForOpen(ws);

      const events: WsSessionEvent[] = [];
      const unsub = wsSessionManager.on((e) => events.push(e));

      sendNdjson(ws, makeSystemInit());
      await tick();

      const countBefore = events.length;
      expect(countBefore).toBeGreaterThan(0);

      unsub();

      sendNdjson(ws, makeAssistantMessage("Should not be captured"));
      await tick();

      expect(events.length).toBe(countBefore);

      ws.close();
      await waitForClose(ws);
    });

    test("multiple listeners receive the same events", async () => {
      const ws = new WebSocket(wsUrl("multi-listener-test"));
      await waitForOpen(ws);

      const events1: WsSessionEvent[] = [];
      const events2: WsSessionEvent[] = [];
      const unsub1 = wsSessionManager.on((e) => events1.push(e));
      const unsub2 = wsSessionManager.on((e) => events2.push(e));

      sendNdjson(ws, makeSystemInit());
      await tick();

      expect(events1.length).toBe(events2.length);
      expect(events1.length).toBeGreaterThan(0);

      unsub1();
      unsub2();
      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 13. Full message lifecycle ───────────────────────────────

  describe("full message lifecycle", () => {
    test("connecting -> ready -> working -> waiting_for_input cycle", async () => {
      const ws = new WebSocket(wsUrl("lifecycle-test"));
      await waitForOpen(ws);

      const { events, unsub } = collectEvents();

      expect(wsSessionManager.getSessionState("lifecycle-test")!.status).toBe("connecting");

      sendNdjson(ws, makeSystemInit());
      await tick();
      expect(wsSessionManager.getSessionState("lifecycle-test")!.status).toBe("ready");

      sendNdjson(ws, makeAssistantMessage("Starting work..."));
      await tick();
      expect(wsSessionManager.getSessionState("lifecycle-test")!.status).toBe("working");

      sendNdjson(ws, makeStreamEvent("streaming "));
      sendNdjson(ws, makeStreamEvent("output..."));
      await tick();
      expect(wsSessionManager.getSessionState("lifecycle-test")!.status).toBe("working");
      expect(wsSessionManager.getSessionState("lifecycle-test")!.streamingText).toBe("streaming output...");

      sendNdjson(ws, makeResultSuccess());
      await tick();
      expect(wsSessionManager.getSessionState("lifecycle-test")!.status).toBe("waiting_for_input");
      expect(wsSessionManager.getSessionState("lifecycle-test")!.streamingText).toBe("");

      const statusChanges = events
        .filter((e): e is Extract<WsSessionEvent, { type: "status_changed" }> => e.type === "status_changed")
        .map((e) => `${e.previousStatus} -> ${e.newStatus}`);

      expect(statusChanges).toEqual([
        "connecting -> ready",
        "ready -> working",
        "working -> waiting_for_input",
      ]);

      unsub();
      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 14. Queue initial prompt ─────────────────────────────────

  describe("queueInitialPrompt", () => {
    test("sends queued prompt after system/init", async () => {
      wsSessionManager.queueInitialPrompt("queued-test", "Do something for me");

      const ws = new WebSocket(wsUrl("queued-test"));
      await waitForOpen(ws);

      const received: string[] = [];
      ws.addEventListener("message", (e) => {
        received.push(typeof e.data === "string" ? e.data : "");
      });

      sendNdjson(ws, makeSystemInit());
      await tick(100);

      expect(received.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(received[0].trim());
      expect(parsed.type).toBe("user");
      expect(parsed.message.content).toBe("Do something for me");

      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 15. HTTP endpoints still work ────────────────────────────

  describe("existing HTTP endpoints", () => {
    test("health endpoint returns OK alongside WebSocket support", async () => {
      const response = await fetch(`http://localhost:${port}/api/health`);
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe("ok");
    });

    test("unknown routes return 404", async () => {
      const response = await fetch(`http://localhost:${port}/api/nonexistent`);
      expect(response.status).toBe(404);
    });
  });

  // ─── 16. claudeId to session mapping ──────────────────────────

  describe("claudeId to session mapping", () => {
    test("maps claude session ID to session name after init", async () => {
      const ws = new WebSocket(wsUrl("mapping-test"));
      await waitForOpen(ws);

      sendNdjson(ws, makeSystemInit({ session_id: "claude-id-xyz" }));
      await tick();

      const name = wsSessionManager.getSessionNameByClaudeId("claude-id-xyz");
      expect(name).toBe("mapping-test");

      ws.close();
      await waitForClose(ws);
      await tick();

      // After disconnect, mapping should be cleared
      const nameAfter = wsSessionManager.getSessionNameByClaudeId("claude-id-xyz");
      expect(nameAfter).toBeUndefined();
    });
  });

  // ─── 17. removeSession cleanup ────────────────────────────────

  describe("removeSession", () => {
    test("removes all traces of a session", async () => {
      const ws = new WebSocket(wsUrl("remove-test"));
      await waitForOpen(ws);

      sendNdjson(ws, makeSystemInit({ session_id: "claude-remove-id" }));
      await tick();

      expect(wsSessionManager.getSessionState("remove-test")).toBeDefined();

      wsSessionManager.removeSession("remove-test");

      expect(wsSessionManager.getSessionState("remove-test")).toBeUndefined();
      expect(wsSessionManager.isConnected("remove-test")).toBe(false);

      ws.close();
      await waitForClose(ws);
    });
  });
});
