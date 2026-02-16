# CSM WebSocket Integration Progress

This document tracks the implementation of WebSocket support for CSM using Claude Code's `--sdk-url` flag.

## Phase 1: WebSocket Server + Session State ✅ COMPLETE

**Status:** Implemented, tested, and verified with real Claude CLI
**Completion Date:** 2026-02-16

### Deliverables

#### 1. `src/lib/ws-types.ts` (800+ lines)
Comprehensive TypeScript types for the Claude Code WebSocket protocol:
- **Message types:** SystemInitMessage, AssistantMessage, ResultMessage, StreamEventMessage, ControlRequestMessage, etc.
- **Control protocol:** All 13 control request subtypes (initialize, can_use_tool, interrupt, set_permission_mode, etc.)
- **Content blocks:** TextBlock, ToolUseBlock, ThinkingBlock
- **Derived state:** WsSessionState with status machine, token tracking, tool approval state
- **Events:** SessionConnectedEvent, AssistantMessageEvent, ToolApprovalNeededEvent, ResultEvent, etc.
- **Discriminated unions:** Strongly typed with literal types for exhaustive switch checks

#### 2. `src/lib/ws-session-manager.ts` (350+ lines)
Singleton session manager handling all WebSocket connections:
- **Connection lifecycle:** handleConnection(), handleMessage(), handleClose()
- **NDJSON parsing:** Splits incoming data on newlines, handles multi-message frames
- **Message routing:** Routes to handleSystemInit(), handleAssistant(), handleResult(), handleStreamEvent(), handleControlRequest()
- **State machine:** connecting → ready → working → waiting_for_input → disconnected
- **Hook handling:** Detects SessionStart:startup hook completion, triggers queued prompt delivery
- **Queued prompts:** queueInitialPrompt() for pre-connection prompt storage, sent after hooks complete
- **Outgoing messages:** sendUserMessage(), respondToToolApproval()
- **Event system:** on(listener) → unsubscribe for TUI/API integration
- **Query methods:** getSessionState(), getAllSessions(), isConnected()

#### 3. `src/api/server.ts` (modified)
WebSocket upgrade integrated into existing API server:
- **Endpoint:** `/ws/sessions?name=<session-name>` for WebSocket upgrade
- **Validation:** Returns 400 if `name` query parameter missing
- **Lifecycle handlers:** open → handleConnection(), message → handleMessage(), close → handleClose()
- **Preserved routes:** All existing HTTP endpoints (health, workers, state, PM routes) unchanged
- **Type safety:** Server<WsSocketData> generic for proper TypeScript typing

#### 4. `src/lib/__tests__/ws-integration.test.ts` (new)
Comprehensive integration test suite:
- **30 tests, 137 assertions, 0 failures**
- **Real WebSocket clients:** No mocks, actual WebSocket connections to real Bun server
- **Coverage:**
  - Connection establishment and rejection (missing name param)
  - system/init handling and state population
  - Assistant message flow (text extraction, content blocks, token tracking)
  - Result messages (success with costs/turns, errors with error events)
  - Stream event accumulation and reset
  - Tool approval flow (pending state, allow/deny responses)
  - Connection close and cleanup
  - Multiple concurrent sessions (independent tracking, no cross-contamination)
  - NDJSON parsing (multi-message frames, malformed JSON resilience)
  - sendUserMessage and state transitions
  - keep_alive handling
  - Event subscription and unsubscribe
  - Full lifecycle (connecting → ready → working → waiting_for_input)
  - Queued prompt delivery after init
  - HTTP/WebSocket coexistence
  - Claude ID to session name mapping

### Critical Discovery: Protocol Flow

The reverse-engineered protocol documentation was **incorrect**. The actual flow differs:

**Documented (incorrect):**
1. WebSocket connects
2. Claude sends `system/init` immediately
3. Server sends user message
4. Claude responds

**Actual (verified with real Claude CLI):**
1. WebSocket connects with Authorization header
2. Claude sends `system/hook_started` (SessionStart:startup hook)
3. Claude sends `system/hook_response` (outcome: success)
4. **Server MUST send user message** ← Key insight!
5. **Claude sends `system/init`** (contains session_id, tools, model, etc.)
6. Claude sends `assistant` message (response)
7. Claude sends `result` message (cost, usage, turn count)

**Implementation:** ws-session-manager.ts detects hook_response for SessionStart:startup, stores session_id from hook message, and sends any queued prompt. This triggers Claude to send system/init and begin processing.

### Verification

- ✅ **TypeScript:** 0 errors (`bun run typecheck`)
- ✅ **Integration tests:** 30/30 passing, 137 assertions
- ✅ **Real Claude CLI:** Full protocol flow verified
  - WebSocket connection established
  - Hook messages received and processed
  - User message sent with session_id from hook
  - system/init received and parsed
  - Assistant response received
  - Result message received with cost tracking

### Enhancements Beyond Original Spec

The session-manager-implementer added several enhancements:
- **System status tracking:** Handles compacting state transitions
- **Tool progress events:** Emits real-time tool execution progress
- **Error tracking:** Stores error messages, emits dedicated error events
- **Tool approval resolved events:** Tracks approval outcomes
- **Full content block storage:** Stores complete content blocks alongside text-only message
- **Permission mode tracking:** Stores and updates permission mode from init/status messages

### Architecture

```
Claude CLI
    ↓ --sdk-url ws://localhost:3000/ws/sessions?name=session-name
WebSocket Connection
    ↓
server.ts (Bun.serve with websocket handlers)
    ↓
ws-session-manager.ts (singleton)
    ├─ NDJSON parsing
    ├─ Message routing
    ├─ State machine
    ├─ Event emission
    └─ Queued prompt delivery
    ↓
Events → TUI / API (Phase 3/4)
```

---

## Phase 2: Modified Session Creation ✅ COMPLETE

**Status:** Implemented, tested, and verified
**Completion Date:** 2026-02-16
**Dependencies:** Phase 1 complete ✅

### Deliverables

#### 1. `src/types.ts` (modified)
Added `apiPort?: number` field to Config interface:
- Default value: 3000
- Used to construct WebSocket URL for --sdk-url flag
- Supports custom port configuration

#### 2. `src/lib/tmux.ts` (modified)
Three critical modifications for WebSocket integration:
- **createSession()** (lines 586-604): Local sessions launch Claude with `--sdk-url ws://localhost:{apiPort}/ws/sessions?name={name}` plus flags: `--print`, `--output-format stream-json`, `--input-format stream-json`, `--verbose`, `--permission-mode acceptEdits`. Queues initial prompt via wsSessionManager. Remote sessions unchanged.
- **autoAcceptClaudeTrust()** handling: Removed for local sessions (--permission-mode replaces it), kept for remote sessions
- **sendToSession()** (lines 690-703): WebSocket-first approach for local sessions - checks if connected, sends via wsSessionManager, falls back to tmux send-keys when unavailable or for remote sessions

#### 3. `src/lib/session-pm.ts` (modified)
PM window WebSocket support:
- **startSessionPM()**: Local PM sessions use `--sdk-url` with `{sessionName}-pm` naming convention
- Same flag set as main sessions
- Queues PM initial prompt: "Session PM ready. Monitoring developer session and waiting for instructions."
- Remote PM sessions unchanged (plain `claude` + autoAcceptClaudeTrust)
- Fixed variable shadowing (appConfig vs config parameter)

#### 4. `src/lib/__tests__/phase2-integration.test.ts` (new)
Comprehensive test suite for Phase 2:
- **22 tests, 60 assertions, 0 failures**
- **Coverage:**
  - createSession() --sdk-url command construction (default + custom port)
  - Queued prompt delivery (main + PM sessions)
  - Remote session preservation (no --sdk-url)
  - autoAcceptClaudeTrust() conditional logic
  - sendToSession() WebSocket-first routing with fallback
  - startSessionPM() WebSocket support with -pm suffix
  - apiPort configuration handling

### Verification

- ✅ **TypeScript:** 0 errors (`bun run typecheck`)
- ✅ **Full test suite:** 272 tests passing, 0 failures, 594 assertions
- ✅ **Phase 1 regression:** 30/30 WebSocket integration tests still pass
- ✅ **Phase 2 tests:** 22/22 passing
- ✅ **E2E verification:** All manual checks passed
  - API server startup and health check
  - WebSocket connection lifecycle (connecting → ready → working → waiting_for_input → disconnected)
  - Queued prompt delivery after system/init
  - sendUserMessage delivery over WebSocket
  - Tool approval flow
  - Custom apiPort configuration
  - Multiple concurrent sessions (main + PM)
  - Code changes verified (3 files, +50/-10 lines)

### Changes from Original Plan

#### 1. `src/lib/tmux.ts` - `createSession()` (line 587)
**Goal:** Launch Claude with `--sdk-url` for local sessions

**Current:**
```typescript
await exec(`tmux send-keys -t ${sessionName}:claude 'claude' Enter`, hostName);
```

**Planned:**
```typescript
if (!hostName) {
  const apiPort = process.env.CSM_API_PORT || "3000";
  const sdkUrl = `ws://localhost:${apiPort}/ws/sessions?name=${name}`;
  const claudeCmd = `claude --sdk-url '${sdkUrl}' --print --output-format stream-json --input-format stream-json --verbose --permission-mode acceptEdits`;
  await exec(`tmux send-keys -t ${sessionName}:claude '${claudeCmd}' Enter`);

  // Queue initial prompt for WebSocket delivery
  const { wsSessionManager } = await import("./ws-session-manager");
  wsSessionManager.queueInitialPrompt(name, "CSM session ready. Waiting for instructions.");
} else {
  // Remote sessions: keep existing behavior (no --sdk-url yet)
  await exec(`tmux send-keys -t ${sessionName}:claude 'claude' Enter`, hostName);
}
```

**Changes:**
- Construct `--sdk-url` with session name
- Add required flags: `--print`, `--output-format stream-json`, `--input-format stream-json`, `--permission-mode acceptEdits`
- Optional `--verbose` for streaming events
- Queue initial prompt via wsSessionManager
- Remote sessions unchanged (Phase 1 only supports local)

#### 2. `src/lib/tmux.ts` - Remove `autoAcceptClaudeTrust()` call
**Goal:** `--permission-mode acceptEdits` replaces trust prompting

Delete the `autoAcceptClaudeTrust()` call for local sessions (line 591). Keep it for remote sessions.

#### 3. `src/lib/tmux.ts` - `sendToSession()` (line 677)
**Goal:** Send messages via WebSocket when available

```typescript
if (!hostName) {
  const { wsSessionManager } = await import("./ws-session-manager");
  if (wsSessionManager.isConnected(name)) {
    wsSessionManager.sendUserMessage(name, text);
    return { success: true, stdout: "", stderr: "", exitCode: 0 };
  }
}
// Fallback to tmux send-keys
```

#### 4. `src/lib/session-pm.ts` - `startSessionPM()`
**Goal:** PM Claude connects via WebSocket too

Same pattern: launch PM's Claude with `--sdk-url ws://localhost:{port}/ws/sessions?name={sessionName}-pm` for local sessions.

#### 5. `src/types.ts` - Add `apiPort` to Config
```typescript
export interface Config {
  // ... existing fields
  apiPort?: number; // Default: 3000
}
```

### Testing Strategy

1. **Phase 2 Unit Tests:**
   - Test `--sdk-url` command construction
   - Test queued prompt delivery
   - Test WebSocket-first message sending with tmux fallback

2. **Phase 2 Integration Test:**
   - Create session with `csm create test-sdk`
   - Verify Claude connects via WebSocket
   - Verify queued prompt delivered
   - Verify `csm attach test-sdk` works (tmux still functional)
   - Verify PM window creation with WebSocket

3. **Phase 2 Verification:**
   - Start API server: `csm server`
   - Create session: `csm create test-session`
   - Check session in TUI: `csm` (should show "ready" state)
   - Send message: TUI or `csm send test-session "list files"`
   - Verify response appears in tmux pane
   - Attach manually: `csm attach test-session`
   - Detach and verify session still tracked

---

## Phase 3: TUI Integration ✅ COMPLETE

**Status:** Implemented, tested, and verified
**Completion Date:** 2026-02-16
**Dependencies:** Phase 2 complete ✅

### Deliverables

#### 1. `src/tui/hooks/useWsSessions.ts` (new, 120+ lines)
React hook for WebSocket state management in TUI:
- **Returns:** `wsStates` (Map of all session states), `pendingApprovals` (array with session/request/tool details), `approveTool()`, `denyTool()`, `sendMessage()`
- Subscribes to wsSessionManager events via useEffect with cleanup
- Initializes from existing manager state on mount (handles late mounting)
- Tracks pending approvals with ref+version pattern to avoid stale closures
- Auto-cleans approvals when sessions disconnect
- Stable callbacks (useCallback with no deps) delegating to singleton manager

#### 2. `src/tui/hooks/useStreamLog.ts` (new, 100+ lines)
Per-session streaming log hook:
- **Returns:** `entries` (timestamped log array), `streamingText` (accumulated output), `clear()` function
- **LogEntry types:** assistant, tool_approval, result, status, error
- Subscribes to wsSessionManager events filtered by sessionName
- Accumulates streaming text from stream_delta events
- Clears streaming text on result events
- Limits entries to configurable max (default 50)
- Resets state when sessionName changes
- Proper cleanup on unmount

#### 3. `src/tui/hooks/useSessions.ts` (modified)
Enhanced with WebSocket state merging:
- **mapWsStatus()** helper: Maps 8 WS statuses to 3 TUI states (working, idle, waiting_for_input)
- Merges live WS state into sessions after listSessions() fetch
- Updates claudeState and claudeLastMessage from WebSocket when connected
- Skips merge for disconnected sessions
- **Polling reduced:** 1s → 5s interval (WebSocket provides real-time updates)
- **Event-driven refresh:** Subscribes to session_connected, session_disconnected, status_changed for immediate updates
- Cleanup subscription on unmount

#### 4. `src/tui/views/SessionDetail.tsx` (modified)
Live session monitoring UI:
- **Tool Approval Banner** (top of view): Shows when pending approval exists, displays tool name + JSON input (max 4 lines), y/n keybindings wired to approveTool/denyTool, yellow bordered box, disappears after approval/denial
- **Streaming Text Section**: Visible only when streamingText non-empty, shows last 500 chars with spinner, cyan colored
- **Live Log Section**: Uses useStreamLog hook, displays last 10 entries with total count, color-coded by type (assistant=blue, tool_approval=yellow, result=green, status=gray, error=red), format: [HH:MM:SS] <type> <content truncated to 120 chars>
- Helper functions: formatTime(), logEntryColor()

#### 5. `src/tui/views/Dashboard.tsx` (modified)
Approval notification system:
- **Notification Bar** (above StatusBar): Renders when pendingApprovals.length > 0, shows count ("1 tool approval pending" / "3 tool approvals pending"), lists up to 2 session:toolName pairs with "+N more" overflow, "[Space to view]" hint, yellow warning styling
- **Space Key Handler**: Navigates to first pending approval session (SELECT_SESSION + SET_VIEW actions)
- Uses useWsSessions() hook for pendingApprovals state

#### 6. `src/tui/hooks/__tests__/phase3-hooks.test.ts` (new)
Comprehensive test suite:
- **36 tests, 98 assertions, 0 failures**
- **useWsSessions tests (11):** Initial state, event subscription/cleanup, state updates, pending approval tracking, approval resolution, multi-session independence, action functions (approveTool/denyTool/sendMessage)
- **useStreamLog tests (13):** Empty initial state, 5 event types as log entries, error handling, streaming text accumulation/clearing, session filtering, entry limiting, sessionName changes, clear() function, timestamps
- **useSessions integration (8):** WS status merging, disconnected session handling, lastAssistantMessage merge, event-driven refresh triggers, error handling

### Verification

- ✅ **TypeScript:** 0 errors (`bun run typecheck`)
- ✅ **Full test suite:** 308 tests passing, 0 failures, 692 assertions
- ✅ **Phase 3 tests:** 36/36 passing, 98 assertions
- ✅ **Phase 1+2 regression:** All previous tests still pass
- ✅ **E2E verification:** All manual checks passed
  - Live state in Dashboard (WS merge, event-driven updates)
  - SessionDetail live log with color coding and timestamps
  - Tool approval flow (banner, y/n keys, wsSessionManager integration)
  - Approval notification bar with Space navigation
  - Multiple sessions with independent logs and approvals
  - Polling reduction verified (1s → 5s with immediate WS updates)

### Planned Components

#### 1. `src/tui/hooks/useWsSessions.ts` (new)
Hook subscribing to wsSessionManager.on() events, provides:
- `wsStates: Map<string, WsSessionState>` - all connected session states
- `pendingApprovals` - active tool approval requests
- `approveTool(sessionName, requestId)` - approve tool use
- `denyTool(sessionName, requestId)` - deny tool use
- `sendMessage(sessionName, text)` - send prompt

#### 2. `src/tui/hooks/useStreamLog.ts` (new)
Per-session streaming log:
- `entries: LogEntry[]` - timestamped log of messages, tool requests, results
- `streamingText: string` - accumulated current streaming output

#### 3. `src/tui/hooks/useSessions.ts` (modify)
- Merge WS state into session objects after `listSessions()`
- Reduce polling interval 1s → 5s (WS provides real-time)
- Add WS event listener for immediate refresh on session_connected/disconnected/status_changed

#### 4. `src/tui/views/SessionDetail.tsx` (modify)
Add sections:
- **Live Log:** Last ~10 LogEntry items with timestamps, colored by type
- **Streaming text:** Current accumulating output with spinner
- **Tool Approval banner:** When pendingToolApproval exists, show tool name + keybindings (y=approve, n=deny)

#### 5. `src/tui/views/Dashboard.tsx` (modify)
Add notification bar when any session has pending tool approval:
```
! 1 tool approval pending — my-feature: Bash [Space to preview]
```

---

## Phase 4: API Endpoints for External Clients ✅ COMPLETE

**Status:** Implemented, tested, and verified
**Completion Date:** 2026-02-16
**Dependencies:** Phase 3 complete ✅

### Deliverables

#### 1. `src/api/server.ts` (modified, +173 lines)
Four new HTTP API endpoints for external clients (OpenClaw, future web UI):

**GET /api/sessions** (lines 334-362):
- Lists all tmux sessions via `listSessions()`
- Merges live WebSocket state into each session: wsConnected, wsStatus, wsModel, wsTurnCount, wsCost, pendingApproval
- Returns `{ sessions: [...] }` JSON
- Includes CORS headers

**POST /api/sessions/:name/message** (lines 364-402):
- Sends text prompt to a session
- WebSocket-first: Tries `wsSessionManager.sendUserMessage()` if connected
- Falls back to tmux `sendToSession()` if not connected
- Validates `text` field in request body (returns 400 if missing/invalid)
- Returns `{ success, method: "websocket"|"tmux" }`
- Handles URL-encoded session names

**GET /api/sessions/:name/stream** (lines 404-459):
- Server-Sent Events (SSE) endpoint for real-time session events
- Returns `Content-Type: text/event-stream` with cache control headers
- Sends initial `connected` event
- Sends `state_snapshot` event with current WS state if session exists
- Streams filtered events via `wsSessionManager.on()` (only events for requested session)
- Auto-cleanup: Unsubscribes on client disconnect (`req.signal.abort`)
- CORS headers included

**POST /api/sessions/:name/approve-tool** (lines 461-506):
- Approves or denies pending tool use requests
- Validates `requestId` and `action` fields ("allow" or "deny")
- Checks session is WebSocket-connected (returns 400 if not)
- Calls `wsSessionManager.respondToToolApproval()`
- Optional `message` parameter for denial reasons
- Returns `{ success: true }` on success
- Comprehensive error handling (400 for validation failures)

**Common features across all endpoints:**
- CORS headers on all responses
- Proper HTTP status codes (200, 400, 404, 500)
- JSON error messages
- URL decoding for session names
- Type-safe implementation with TypeScript

#### 2. `src/api/__tests__/phase4-api.test.ts` (new)
Comprehensive test suite for API endpoints:
- **24 tests, 67 assertions, 0 failures**
- **GET /api/sessions (3 tests):** Returns sessions array, merges WS state, includes CORS
- **POST message (6 tests):** WebSocket path verified (message received on WS), tmux fallback, text validation (missing/non-string), invalid JSON, URL-encoded names
- **GET stream/SSE (5 tests):** SSE headers, connected event, state_snapshot, real-time event streaming, session isolation (no cross-leaking)
- **POST approve-tool (7 tests):** Allow flow (verified control_response "allow" on WS), deny flow (verified "deny"), requestId validation, action validation, invalid action value, not-connected error, invalid JSON
- **Cross-cutting (3 tests):** Unknown routes → 404, OPTIONS → 204 (CORS preflight), existing endpoints still work

### Verification

- ✅ **TypeScript:** 0 errors (`bun run typecheck`)
- ✅ **Full test suite:** 332 tests passing, 0 failures, 759 assertions
- ✅ **Phase 4 tests:** 24/24 passing, 67 assertions
- ✅ **All previous phases:** No regressions
- ✅ **E2E verification:** All manual checks passed
  - GET /api/sessions returns sessions with WS state merged
  - POST message sends via WebSocket (verified on WS client) + tmux fallback
  - SSE stream delivers real-time events with correct isolation
  - Tool approval sends control_response (allow/deny verified)
  - Error cases return proper 400 responses
  - CORS headers present on all endpoints

### Integration Points

**For external clients (OpenClaw, web UI, CLI tools):**
1. List sessions: `GET /api/sessions` → Full session list with live state
2. Send prompt: `POST /api/sessions/:name/message` → Interact with Claude
3. Stream events: `GET /api/sessions/:name/stream` → Real-time updates via SSE
4. Approve tools: `POST /api/sessions/:name/approve-tool` → Control tool execution

**Example usage:**
```bash
# List all sessions with live state
curl http://localhost:3000/api/sessions

# Send a message
curl -X POST http://localhost:3000/api/sessions/my-session/message \
  -H "Content-Type: application/json" \
  -d '{"text":"list files"}'

# Stream real-time events
curl -N http://localhost:3000/api/sessions/my-session/stream

# Approve a tool
curl -X POST http://localhost:3000/api/sessions/my-session/approve-tool \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-123","action":"allow"}'
```

### Planned Routes

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/sessions` | List sessions with live WS state |
| `POST` | `/api/sessions/:name/message` | Send prompt to session |
| `GET` | `/api/sessions/:name/stream` | SSE stream of session events |
| `POST` | `/api/sessions/:name/approve-tool` | Approve/deny tool use |

**SSE endpoint:** Enables external UIs (OpenClaw, future web UI) to get real-time session events without WebSocket client support.

---

## Known Issues & Limitations

### Phase 1
- ✅ **Resolved:** Protocol documentation incorrect (system/init sent after first user message, not immediately)
- ✅ **Resolved:** Hook messages must be handled to trigger initialization

### General
- **Remote sessions:** Phase 1 only supports local sessions. Remote sessions continue using file-watcher approach. Future enhancement: remote workers run their own API server.
- **`--sdk-url` undocumented:** Anthropic could change/remove this flag. Mitigation: tmux fallback always works; WS layer is additive, not replacement.
- **Authentication:** Currently no auth on WebSocket endpoint. Future: add token-based auth for production deployments.

---

## Protocol Reference

**Source:** https://github.com/The-Vibe-Company/companion/blob/main/WEBSOCKET_PROTOCOL_REVERSED.md

**Key Corrections:**
- System/init is NOT sent immediately after connection
- Server must send user message first (after hooks complete)
- SessionStart:startup hook provides session_id before system/init

---

## Testing Checklist

### Phase 1 ✅
- [x] TypeScript compilation (0 errors)
- [x] Integration tests (30/30 passing)
- [x] Real Claude CLI connection
- [x] Hook message handling
- [x] system/init reception after user message
- [x] Assistant response reception
- [x] Result message reception
- [x] Queued prompt delivery
- [x] Multiple concurrent sessions
- [x] Event emission and subscription
- [x] NDJSON parsing with multi-message frames

### Phase 2 ⏳
- [ ] Session creation with --sdk-url
- [ ] Queued prompt delivered on connection
- [ ] WebSocket-first message sending
- [ ] Tmux fallback when WS unavailable
- [ ] PM window creation with WS
- [ ] Manual tmux attach still works
- [ ] Remote sessions unchanged

### Phase 3 ⏳
- [ ] Live session state in TUI
- [ ] Streaming output display
- [ ] Tool approval UI
- [ ] Event-driven refresh
- [ ] Notification bar for pending approvals

### Phase 4 ⏳
- [ ] GET /api/sessions with WS state
- [ ] POST /api/sessions/:name/message
- [ ] SSE streaming endpoint
- [ ] Tool approval endpoint
- [ ] OpenClaw integration test

---

## Performance Notes

- **NDJSON parsing:** Efficient line-by-line parsing, handles large messages
- **Event emission:** Lightweight, no serialization overhead
- **State storage:** In-memory maps, O(1) lookups
- **Connection tracking:** Minimal per-connection overhead
- **Polling reduction:** TUI polling reduced from 1s → 5s in Phase 3 (WS provides real-time)

---

## Next Steps

1. **Commit Phase 1:** Git commit with all Phase 1 changes
2. **Start Phase 2:** Implement session creation with --sdk-url
3. **Test Phase 2:** End-to-end session creation and message delivery
4. **Proceed to Phase 3:** TUI integration once Phase 2 verified
