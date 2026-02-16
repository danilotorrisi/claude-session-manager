# CSM WebSocket `--sdk-url` Integration Plan

## Context

CSM currently manages Claude Code sessions via tmux + file watchers (`/tmp/csm-claude-state/*.json`) for state. This is fragile, polling-based, and lossy. Claude Code's undocumented `--sdk-url` flag lets it connect as a WebSocket client to a server, sending structured NDJSON messages for everything: state, streaming output, tool approval, MCP control, session resume.

This plan adds `--sdk-url` support to CSM so that every session gets a real-time, structured WebSocket connection — while keeping tmux for manual drop-in. The TUI gets live streaming, tool approval, and eliminates pane-scraping.

**Protocol reference**: https://github.com/The-Vibe-Company/companion/blob/main/WEBSOCKET_PROTOCOL_REVERSED.md

---

## Decisions

- **tmux stays alongside** — WebSocket is a parallel control plane, tmux for manual attach
- **TUI first, web UI later** — enhance existing Ink TUI with WS data
- **Embed WS in existing API server** — `src/api/server.ts` on port 3000
- **Always connect** — every `csm create` uses `--sdk-url` automatically
- **MVP = streaming + state + tool approval**

---

## Phase 1: WebSocket Server + Session State

### New: `src/lib/ws-types.ts`

All NDJSON message types + derived session state + event types.

Key types:
- `SystemInitMessage` — first message from Claude with session_id, tools, MCP servers, model
- `AssistantMessage` — full LLM response with content blocks (text, tool_use, thinking)
- `ResultMessage` — query complete, with cost/usage
- `StreamEventMessage` — token-by-token deltas (when `--verbose`)
- `ControlRequestMessage` — tool approval requests (`can_use_tool`)
- `WsSessionState` — derived state: status, model, tools, mcpServers, lastMessage, pendingToolApproval, turnCount, cost
- `WsSessionEvent` — typed events for TUI/API: session_connected, status_changed, assistant_message, stream_delta, tool_approval_needed, result

### New: `src/lib/ws-session-manager.ts`

Singleton class managing all WebSocket connections.

```
WsSessionManager
  sessions: Map<sessionName, WsSessionState>
  connections: Map<sessionName, ServerWebSocket>
  claudeIdToSession: Map<claudeSessionId, sessionName>
  listeners: EventListener[]

  handleConnection(ws) — store connection, init state as "connecting"
  handleMessage(ws, data) — parse NDJSON lines, route to processors
  handleClose(ws) — mark disconnected, emit event

  processMessage() routes to:
    handleSystemInit() — populate state from init message, status → "ready"
    handleAssistant() — extract text, update lastMessage, status → "working"
    handleResult() — increment turns, cost, status → "waiting_for_input"
    handleStreamEvent() — accumulate streaming text, emit deltas
    handleControlRequest() — store pending approval, status → "waiting_for_input", emit

  sendUserMessage(sessionName, text) — send user message via WS
  respondToToolApproval(sessionName, requestId, "allow"|"deny") — send control_response
  queueInitialPrompt(sessionName, text) — for pre-connection prompt delivery

  on(listener) → unsubscribe — event subscription
  getSessionState(name) / getAllSessions() — query state
  isConnected(name) — check connection
```

### Modify: `src/api/server.ts`

Add WebSocket upgrade to existing `Bun.serve()`:

```typescript
// In fetch handler, before existing routes:
if (url.pathname === "/ws/sessions") {
  const sessionName = url.searchParams.get("name");
  server.upgrade(req, { data: { sessionName } });
  return;
}

// Add websocket option to Bun.serve:
websocket: {
  open(ws) { wsSessionManager.handleConnection(ws); },
  message(ws, data) { wsSessionManager.handleMessage(ws, data); },
  close(ws) { wsSessionManager.handleClose(ws); },
}
```

---

## Phase 2: Modified Session Creation

### Modify: `src/lib/tmux.ts` — `createSession()` (line 587)

Replace:
```typescript
await exec(`tmux send-keys -t ${sessionName}:claude 'claude' Enter`, hostName);
```

With (local sessions only — remote stays unchanged):
```typescript
if (!hostName) {
  const apiPort = process.env.CSM_API_PORT || "3000";
  const sdkUrl = `ws://localhost:${apiPort}/ws/sessions?name=${name}`;
  const claudeCmd = `claude --sdk-url '${sdkUrl}' --print --output-format stream-json --input-format stream-json --verbose --permission-mode acceptEdits -p "CSM session ready. Waiting for instructions."`;
  await exec(`tmux send-keys -t ${sessionName}:claude '${claudeCmd}' Enter`);
} else {
  await exec(`tmux send-keys -t ${sessionName}:claude 'claude' Enter`, hostName);
}
```

### Modify: `src/lib/tmux.ts` — remove `autoAcceptClaudeTrust()` call (line 591)

Delete the call for local sessions — `--permission-mode acceptEdits` replaces it. Keep it for remote sessions (they don't use `--sdk-url` yet).

### Modify: `src/lib/tmux.ts` — `sendToSession()` (line 677)

Try WebSocket first for local sessions, fall back to tmux:
```typescript
if (!hostName) {
  const { wsSessionManager } = await import("./ws-session-manager");
  if (wsSessionManager.isConnected(name)) {
    wsSessionManager.sendUserMessage(name, text);
    return { success: true, stdout: "", stderr: "", exitCode: 0 };
  }
}
// existing tmux send-keys fallback
```

### Modify: `src/lib/session-pm.ts` — `startSessionPM()`

Same pattern: launch PM's claude with `--sdk-url ws://localhost:{port}/ws/sessions?name={sessionName}-pm` for local sessions.

### Modify: `src/types.ts` — Add `apiPort` to Config

```typescript
export interface Config {
  // ... existing fields
  apiPort?: number; // Default: 3000
}
```

---

## Phase 3: TUI Integration

### New: `src/tui/hooks/useWsSessions.ts`

Hook that subscribes to `wsSessionManager.on()` and provides:
- `wsStates: Map<string, WsSessionState>` — all connected session states
- `pendingApprovals: Array<{sessionName, requestId, toolName, toolInput}>` — active tool requests
- `approveTool(sessionName, requestId)` — approve
- `denyTool(sessionName, requestId)` — deny
- `sendMessage(sessionName, text)` — send prompt

### New: `src/tui/hooks/useStreamLog.ts`

Per-session streaming log hook:
- `entries: LogEntry[]` — timestamped log of assistant messages, tool requests, results, status changes
- `streamingText: string` — accumulated current streaming output

### Modify: `src/tui/hooks/useSessions.ts`

1. After fetching sessions via `listSessions()`, merge WS state:
```typescript
for (const session of allSessions) {
  const wsState = wsSessionManager.getSessionState(session.name);
  if (wsState && wsState.status !== "disconnected") {
    session.claudeState = mapWsStatus(wsState.status); // "working" | "idle" | "waiting_for_input"
    if (wsState.lastAssistantMessage) {
      session.claudeLastMessage = wsState.lastAssistantMessage;
    }
  }
}
```

2. Reduce polling interval from 1s to 5s (WS provides real-time updates)

3. Add WS event listener for immediate refresh on key events (session_connected, session_disconnected, status_changed)

### Modify: `src/tui/views/SessionDetail.tsx`

Add after existing sections:
- **Live Log** section — last ~10 `LogEntry` items with timestamps, colored by type
- **Streaming text** — current accumulating output with spinner
- **Tool Approval banner** — when pendingToolApproval exists, show tool name + `y` approve / `n` deny keybindings

### Modify: `src/tui/views/Dashboard.tsx`

Add notification bar when any session has pending tool approval:
```
! 1 tool approval pending — my-feature: Bash [Space to preview]
```

---

## Phase 4: API Endpoints for External Clients (OpenClaw, future web UI)

### Modify: `src/api/server.ts` — new routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sessions` | List sessions with live WS state |
| `POST` | `/api/sessions/:name/message` | Send prompt to session |
| `GET` | `/api/sessions/:name/stream` | SSE stream of session events |
| `POST` | `/api/sessions/:name/approve-tool` | Approve/deny tool use |

The SSE endpoint enables external UIs to get real-time session events without WebSocket client support (simpler for OpenClaw HTTP-based skills).

---

## Files Summary

| Action | File | What |
|--------|------|------|
| **Create** | `src/lib/ws-types.ts` | Protocol types, session state, events |
| **Create** | `src/lib/ws-session-manager.ts` | Core WS manager singleton |
| **Create** | `src/tui/hooks/useWsSessions.ts` | TUI hook for WS state + tool approval |
| **Create** | `src/tui/hooks/useStreamLog.ts` | TUI hook for per-session streaming log |
| **Modify** | `src/api/server.ts` | WS upgrade + new API routes |
| **Modify** | `src/lib/tmux.ts` | `createSession()` with `--sdk-url`, `sendToSession()` WS-first |
| **Modify** | `src/lib/session-pm.ts` | PM claude with `--sdk-url` |
| **Modify** | `src/types.ts` | `apiPort` in Config |
| **Modify** | `src/tui/hooks/useSessions.ts` | Merge WS state, reduce polling, event-driven refresh |
| **Modify** | `src/tui/views/SessionDetail.tsx` | Live log + tool approval UI |
| **Modify** | `src/tui/views/Dashboard.tsx` | Approval notification bar |

---

## Implementation Order

```
Phase 1 (foundation):
  1. src/lib/ws-types.ts
  2. src/lib/ws-session-manager.ts
  3. src/api/server.ts (WS upgrade only)

Phase 2 (session creation):
  4. src/lib/tmux.ts (createSession + sendToSession)
  5. src/lib/session-pm.ts
  6. src/types.ts

Phase 3 (TUI):
  7. src/tui/hooks/useWsSessions.ts
  8. src/tui/hooks/useStreamLog.ts
  9. src/tui/hooks/useSessions.ts (merge WS state)
  10. src/tui/views/SessionDetail.tsx
  11. src/tui/views/Dashboard.tsx

Phase 4 (API):
  12. src/api/server.ts (HTTP API routes)
```

---

## Verification

1. **Phase 1 test**: Start API server (`csm server`), manually run `claude --sdk-url ws://localhost:3000/ws/sessions?name=test --print --output-format stream-json --input-format stream-json --verbose -p "hello"`, verify `system/init` is received and logged by WsSessionManager.

2. **Phase 2 test**: Run `csm create test-sdk`, verify Claude connects via WebSocket (check server logs), verify `csm attach test-sdk` still works for manual drop-in.

3. **Phase 3 test**: Open TUI (`csm`), verify session shows live status from WS instead of file watcher. Open SessionDetail, verify streaming log shows Claude's output in real-time. Trigger a tool approval (use `--permission-mode ask`), verify it appears in TUI and can be approved with `y`.

4. **Phase 4 test**: `curl http://localhost:3000/api/sessions` — verify JSON with live state. `curl -X POST http://localhost:3000/api/sessions/test-sdk/message -d '{"text":"list files"}'` — verify Claude processes the prompt.

---

## Risks & Mitigations

- **`--sdk-url` is undocumented** — Anthropic could change/remove it. Mitigation: tmux fallback always works; WS layer is additive.
- **Remote sessions** — `--sdk-url` only works for local sessions initially (Claude connects to localhost). Remote sessions keep file-watcher approach. Future: remote workers run their own API server.
- **Protocol deviations** — Reversed spec may not match exactly. Mitigation: comprehensive logging in handleMessage, flexible JSON parsing, test with actual Claude CLI early.
