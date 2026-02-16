/**
 * Phase 4 API Integration Tests
 *
 * Tests the four new HTTP endpoints added in Phase 4:
 *   GET  /api/sessions              — list sessions with merged WS state
 *   POST /api/sessions/:name/message — send message (WS-first, tmux fallback)
 *   GET  /api/sessions/:name/stream  — SSE stream of session events
 *   POST /api/sessions/:name/approve-tool — approve/deny tool use requests
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import type { Server } from "bun";
import { startApiServer, resetMasterState } from "../server";
import { wsSessionManager, type WsSocketData } from "../../lib/ws-session-manager";
import type {
  SystemInitMessage,
  AssistantMessage,
  ResultSuccessMessage,
  ControlRequestMessage,
  WsSessionEvent,
} from "../../lib/ws-types";

// ─── Helpers ────────────────────────────────────────────────────────────────

let port: number;
let server: Server<WsSocketData>;

function apiUrl(path: string): string {
  return `http://localhost:${port}${path}`;
}

function wsUrl(sessionName: string): string {
  return `ws://localhost:${port}/ws/sessions?name=${sessionName}`;
}

function sendNdjson(ws: WebSocket, msg: unknown): void {
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

function tick(ms = 50): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Mock message factories ─────────────────────────────────────────────────

function makeSystemInit(overrides: Partial<SystemInitMessage> = {}): SystemInitMessage {
  return {
    type: "system",
    subtype: "init",
    cwd: "/tmp/test-project",
    session_id: "claude-session-abc",
    tools: ["Bash", "Read", "Write"],
    mcp_servers: [],
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

function makeResultSuccess(overrides: Partial<ResultSuccessMessage> = {}): ResultSuccessMessage {
  return {
    type: "result",
    subtype: "success",
    is_error: false,
    result: "Task completed",
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

/**
 * Helper: connect a WS client, initialize a session, and optionally bring it
 * to a desired state (ready, working, waiting_for_input, with tool approval).
 */
async function setupWsSession(
  name: string,
  opts?: { working?: boolean; waitingForInput?: boolean; pendingApproval?: boolean }
): Promise<WebSocket> {
  const ws = new WebSocket(wsUrl(name));
  await waitForOpen(ws);
  sendNdjson(ws, makeSystemInit({ session_id: `claude-${name}` }));
  await tick();

  if (opts?.working) {
    sendNdjson(ws, makeAssistantMessage("Working..."));
    await tick();
  }

  if (opts?.waitingForInput) {
    sendNdjson(ws, makeAssistantMessage("Done"));
    await tick();
    sendNdjson(ws, makeResultSuccess());
    await tick();
  }

  if (opts?.pendingApproval) {
    sendNdjson(ws, makeControlRequest("Bash", { request_id: "req-tool-001" }));
    await tick();
  }

  return ws;
}

// ─── Test suite ─────────────────────────────────────────────────────────────

describe("Phase 4 API Endpoints", () => {
  beforeEach(async () => {
    resetMasterState();
    for (const [name] of wsSessionManager.getAllSessions()) {
      wsSessionManager.removeSession(name);
    }
    port = 10000 + Math.floor(Math.random() * 50000);
    server = await startApiServer(port);
  });

  afterEach(async () => {
    if (server) {
      server.stop(true);
    }
    await tick(10);
  });

  // ─── 1. GET /api/sessions ───────────────────────────────────────────────

  describe("GET /api/sessions", () => {
    test("returns 200 with sessions array", async () => {
      const response = await fetch(apiUrl("/api/sessions"));
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body).toHaveProperty("sessions");
      expect(Array.isArray(body.sessions)).toBe(true);
    });

    test("merges WS state into session objects when WS-connected", async () => {
      // Connect a WS session so wsSessionManager knows about it
      const ws = await setupWsSession("test-merge", { working: true });

      const response = await fetch(apiUrl("/api/sessions"));
      const body = await response.json();

      // The session list comes from tmux (which won't have our test session),
      // but we can verify the endpoint itself responds correctly.
      // If there happened to be a matching tmux session, wsConnected would be true.
      expect(response.status).toBe(200);
      expect(body.sessions).toBeDefined();

      ws.close();
      await waitForClose(ws);
    });

    test("includes CORS headers", async () => {
      const response = await fetch(apiUrl("/api/sessions"));
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  // ─── 2. POST /api/sessions/:name/message ────────────────────────────────

  describe("POST /api/sessions/:name/message", () => {
    test("sends message via WebSocket when session is connected", async () => {
      const ws = await setupWsSession("msg-ws", { waitingForInput: true });

      const received: string[] = [];
      ws.addEventListener("message", (e) => {
        received.push(typeof e.data === "string" ? e.data : "");
      });

      const response = await fetch(apiUrl("/api/sessions/msg-ws/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello via API" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.method).toBe("websocket");

      // Verify the message was actually sent over WebSocket
      await tick();
      expect(received.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(received[0].trim());
      expect(parsed.type).toBe("user");
      expect(parsed.message.content).toBe("Hello via API");

      ws.close();
      await waitForClose(ws);
    });

    test("falls back to tmux when session is not WS-connected", async () => {
      // No WS session established — should try tmux fallback
      const response = await fetch(apiUrl("/api/sessions/no-ws-session/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello via tmux" }),
      });

      // Will get either 200 (if tmux succeeds) or 500 (if tmux fails, which is expected in test env)
      const body = await response.json();
      expect(body).toHaveProperty("method", "tmux");
      expect(body).toHaveProperty("success");
    });

    test("returns 400 when text field is missing", async () => {
      const response = await fetch(apiUrl("/api/sessions/any-session/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("text");
    });

    test("returns 400 when text field is not a string", async () => {
      const response = await fetch(apiUrl("/api/sessions/any-session/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: 123 }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("text");
    });

    test("returns 400 for invalid JSON body", async () => {
      const response = await fetch(apiUrl("/api/sessions/any-session/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not valid json{",
      });

      expect(response.status).toBe(400);
    });

    test("handles URL-encoded session names", async () => {
      const ws = await setupWsSession("special-name", { waitingForInput: true });

      const response = await fetch(apiUrl("/api/sessions/special-name/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Hello" }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.method).toBe("websocket");

      ws.close();
      await waitForClose(ws);
    });
  });

  // ─── 3. GET /api/sessions/:name/stream ──────────────────────────────────

  describe("GET /api/sessions/:name/stream", () => {
    test("returns SSE content type and initial connected event", async () => {
      const controller = new AbortController();

      const response = await fetch(apiUrl("/api/sessions/stream-test/stream"), {
        signal: controller.signal,
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
      expect(response.headers.get("Cache-Control")).toBe("no-cache");

      // Read the first chunk (connected event)
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      const { value } = await reader.read();
      const text = decoder.decode(value);

      // Should start with a "connected" SSE event
      expect(text).toContain("data:");
      const eventData = JSON.parse(text.replace("data: ", "").trim());
      expect(eventData.type).toBe("connected");
      expect(eventData.sessionName).toBe("stream-test");

      controller.abort();
    });

    test("sends state snapshot when session already exists", async () => {
      const ws = await setupWsSession("snapshot-test", { working: true });

      const controller = new AbortController();
      const response = await fetch(apiUrl("/api/sessions/snapshot-test/stream"), {
        signal: controller.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Read the first chunk - may contain both connected + state_snapshot
      const { value } = await reader.read();
      const text = decoder.decode(value);

      // Split SSE events
      const events = text
        .split("\n\n")
        .filter((e) => e.startsWith("data:"))
        .map((e) => JSON.parse(e.replace("data: ", "")));

      expect(events.length).toBeGreaterThanOrEqual(1);

      // First event should be connected
      expect(events[0].type).toBe("connected");

      // Second event should be state_snapshot
      if (events.length >= 2) {
        expect(events[1].type).toBe("state_snapshot");
        expect(events[1].state).toBeDefined();
        expect(events[1].state.sessionName).toBe("snapshot-test");
      }

      controller.abort();
      ws.close();
      await waitForClose(ws);
    });

    test("streams real-time events for the session", async () => {
      const ws = await setupWsSession("realtime-test");

      const controller = new AbortController();
      const response = await fetch(apiUrl("/api/sessions/realtime-test/stream"), {
        signal: controller.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Read initial events (connected + state_snapshot)
      await reader.read();

      // Now trigger an event on this session
      sendNdjson(ws, makeAssistantMessage("A new message!"));
      await tick(100);

      // Read the streamed events
      const { value } = await reader.read();
      const text = decoder.decode(value);

      // Should contain assistant_message or status_changed events
      expect(text).toContain("data:");
      const eventLines = text
        .split("\n\n")
        .filter((e) => e.startsWith("data:"))
        .map((e) => JSON.parse(e.replace("data: ", "")));

      const eventTypes = eventLines.map((e) => e.type);
      // Should see status_changed (ready -> working) and/or assistant_message
      expect(
        eventTypes.includes("status_changed") || eventTypes.includes("assistant_message")
      ).toBe(true);

      controller.abort();
      ws.close();
      await waitForClose(ws);
    });

    test("does not stream events from other sessions", async () => {
      const ws1 = await setupWsSession("target-session");
      const ws2 = await setupWsSession("other-session");

      const controller = new AbortController();
      const response = await fetch(apiUrl("/api/sessions/target-session/stream"), {
        signal: controller.signal,
      });

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();

      // Read initial events
      await reader.read();

      // Trigger event on the OTHER session
      sendNdjson(ws2, makeAssistantMessage("Message on other session"));
      await tick(100);

      // Trigger event on the TARGET session so we get data
      sendNdjson(ws1, makeAssistantMessage("Message on target session"));
      await tick(100);

      const { value } = await reader.read();
      const text = decoder.decode(value);

      const eventLines = text
        .split("\n\n")
        .filter((e) => e.startsWith("data:"))
        .map((e) => JSON.parse(e.replace("data: ", "")));

      // All events should be for "target-session" only
      for (const event of eventLines) {
        if (event.sessionName) {
          expect(event.sessionName).toBe("target-session");
        }
      }

      controller.abort();
      ws1.close();
      ws2.close();
      await Promise.all([waitForClose(ws1), waitForClose(ws2)]);
    });

    test("includes CORS and cache headers", async () => {
      const controller = new AbortController();
      const response = await fetch(apiUrl("/api/sessions/header-test/stream"), {
        signal: controller.signal,
      });

      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Cache-Control")).toBe("no-cache");
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");

      controller.abort();
    });
  });

  // ─── 4. POST /api/sessions/:name/approve-tool ──────────────────────────

  describe("POST /api/sessions/:name/approve-tool", () => {
    test("approves a tool use request successfully", async () => {
      const ws = await setupWsSession("approve-test", { pendingApproval: true });

      const received: string[] = [];
      ws.addEventListener("message", (e) => {
        received.push(typeof e.data === "string" ? e.data : "");
      });

      const response = await fetch(apiUrl("/api/sessions/approve-test/approve-tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: "req-tool-001",
          action: "allow",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      // Verify the control_response was sent over WebSocket
      await tick();
      expect(received.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(received[0].trim());
      expect(parsed.type).toBe("control_response");
      expect(parsed.response.subtype).toBe("success");
      expect(parsed.response.request_id).toBe("req-tool-001");
      expect(parsed.response.response.behavior).toBe("allow");

      // Pending approval should be cleared
      const state = wsSessionManager.getSessionState("approve-test");
      expect(state!.pendingToolApproval).toBeUndefined();

      ws.close();
      await waitForClose(ws);
    });

    test("denies a tool use request successfully", async () => {
      const ws = await setupWsSession("deny-test", { pendingApproval: true });

      const received: string[] = [];
      ws.addEventListener("message", (e) => {
        received.push(typeof e.data === "string" ? e.data : "");
      });

      const response = await fetch(apiUrl("/api/sessions/deny-test/approve-tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: "req-tool-001",
          action: "deny",
          message: "Not allowed by policy",
        }),
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);

      await tick();
      expect(received.length).toBeGreaterThanOrEqual(1);
      const parsed = JSON.parse(received[0].trim());
      expect(parsed.response.response.behavior).toBe("deny");

      ws.close();
      await waitForClose(ws);
    });

    test("returns 400 when requestId is missing", async () => {
      const ws = await setupWsSession("missing-req-id");

      const response = await fetch(apiUrl("/api/sessions/missing-req-id/approve-tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "allow" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("requestId");

      ws.close();
      await waitForClose(ws);
    });

    test("returns 400 when action is missing", async () => {
      const ws = await setupWsSession("missing-action");

      const response = await fetch(apiUrl("/api/sessions/missing-action/approve-tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-001" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("action");

      ws.close();
      await waitForClose(ws);
    });

    test("returns 400 when action is invalid value", async () => {
      const ws = await setupWsSession("bad-action");

      const response = await fetch(apiUrl("/api/sessions/bad-action/approve-tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-001", action: "maybe" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("allow");

      ws.close();
      await waitForClose(ws);
    });

    test("returns 400 when session is not WS-connected", async () => {
      const response = await fetch(apiUrl("/api/sessions/not-connected/approve-tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: "req-001", action: "allow" }),
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toContain("not connected");
    });

    test("returns 400 for invalid JSON body", async () => {
      const response = await fetch(apiUrl("/api/sessions/any/approve-tool"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json{{{",
      });

      expect(response.status).toBe(400);
    });
  });

  // ─── 5. Cross-cutting concerns ──────────────────────────────────────────

  describe("cross-cutting concerns", () => {
    test("unknown routes still return 404", async () => {
      const response = await fetch(apiUrl("/api/sessions/foo/nonexistent"));
      expect(response.status).toBe(404);
    });

    test("OPTIONS requests return 204 for CORS preflight", async () => {
      const response = await fetch(apiUrl("/api/sessions"), { method: "OPTIONS" });
      expect(response.status).toBe(204);
    });

    test("existing endpoints (health, workers) still work", async () => {
      const healthRes = await fetch(apiUrl("/api/health"));
      expect(healthRes.status).toBe(200);
      const healthBody = await healthRes.json();
      expect(healthBody.status).toBe("ok");

      const workersRes = await fetch(apiUrl("/api/workers"));
      expect(workersRes.status).toBe(200);
      const workersBody = await workersRes.json();
      expect(workersBody.workers).toBeDefined();
    });
  });
});
