// WebSocket Session Manager — singleton that manages all Claude Code WebSocket connections
// Handles NDJSON parsing, message routing, state transitions, and event emission

import type { ServerWebSocket } from "bun";
import type {
  IncomingWsMessage,
  SystemInitMessage,
  SystemStatusMessage,
  AssistantMessage,
  ResultMessage,
  StreamEventMessage,
  ControlRequestMessage,
  ToolProgressMessage,
  WsSessionState,
  WsSessionEvent,
  WsEventListener,
  UserMessage,
  ControlResponseMessage,
  ContentBlock,
  TextBlock,
} from "./ws-types";
import { createInitialSessionState } from "./ws-types";

export interface WsSocketData {
  sessionName: string;
}

function createInitialState(sessionName: string): WsSessionState {
  return createInitialSessionState(sessionName);
}

function extractTextFromBlocks(blocks: ContentBlock[]): string {
  return blocks
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

class WsSessionManager {
  private sessions = new Map<string, WsSessionState>();
  private connections = new Map<string, ServerWebSocket<WsSocketData>>();
  private claudeIdToSession = new Map<string, string>();
  private listeners: WsEventListener[] = [];
  private queuedPrompts = new Map<string, string>();

  // ─── Connection lifecycle ────────────────────────────────────────

  handleConnection(ws: ServerWebSocket<WsSocketData>): void {
    const { sessionName } = ws.data;
    console.log(`[WsSessionManager] Connection opened: ${sessionName}`);

    this.connections.set(sessionName, ws);
    this.sessions.set(sessionName, createInitialState(sessionName));
  }

  handleMessage(ws: ServerWebSocket<WsSocketData>, data: string | Buffer): void {
    const { sessionName } = ws.data;
    const raw = typeof data === "string" ? data : data.toString("utf-8");

    // NDJSON: split on newlines, each line is a JSON message
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);

    for (const line of lines) {
      let parsed: IncomingWsMessage;
      try {
        parsed = JSON.parse(line);
      } catch (err) {
        console.error(
          `[WsSessionManager] Failed to parse NDJSON line for ${sessionName}:`,
          line.slice(0, 200),
          err
        );
        continue;
      }

      try {
        this.processMessage(sessionName, parsed);
      } catch (err) {
        console.error(
          `[WsSessionManager] Error processing message for ${sessionName}:`,
          err
        );
      }
    }
  }

  handleClose(ws: ServerWebSocket<WsSocketData>): void {
    const { sessionName } = ws.data;
    console.log(`[WsSessionManager] Connection closed: ${sessionName}`);

    this.connections.delete(sessionName);

    const state = this.sessions.get(sessionName);
    if (state) {
      const previousStatus = state.status;
      state.status = "disconnected";

      if (state.claudeSessionId) {
        this.claudeIdToSession.delete(state.claudeSessionId);
      }

      this.emit({ type: "session_disconnected", sessionName });

      if (previousStatus !== "disconnected") {
        this.emit({
          type: "status_changed",
          sessionName,
          previousStatus,
          newStatus: "disconnected",
        });
      }
    }
  }

  // ─── Message routing ─────────────────────────────────────────────

  private processMessage(sessionName: string, msg: IncomingWsMessage): void {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") {
          this.handleSystemInit(sessionName, msg);
        } else if (msg.subtype === "status") {
          this.handleSystemStatus(sessionName, msg);
        } else if (msg.subtype === "hook_response") {
          // Handle SessionStart hook - Claude CLI waits for a user message before sending system/init
          const hookMsg = msg as any;
          if (hookMsg.outcome === "success" && hookMsg.hook_name === "SessionStart:startup" && hookMsg.session_id) {
            console.log(`[WsSessionManager] SessionStart hook completed for ${sessionName}`);

            const state = this.sessions.get(sessionName);
            if (state) {
              // Store the claude session_id from the hook message
              state.claudeSessionId = hookMsg.session_id;

              // Check for queued prompt and send it
              const queuedPrompt = this.queuedPrompts.get(sessionName);
              if (queuedPrompt) {
                console.log(`[WsSessionManager] Found queued prompt, sending: "${queuedPrompt.substring(0, 50)}..."`);
                this.queuedPrompts.delete(sessionName);
                // Small delay to ensure hook is fully processed
                setTimeout(() => {
                  try {
                    this.sendUserMessage(sessionName, queuedPrompt);
                    console.log(`[WsSessionManager] Queued prompt sent successfully`);
                  } catch (err) {
                    console.error(`[WsSessionManager] Failed to send queued prompt:`, err);
                  }
                }, 50);
              } else {
                // No queued prompt - connection will remain idle until first user message
                console.log(`[WsSessionManager] No queued prompt for ${sessionName}, waiting for user message`);
              }
            }
          }
        }
        break;
      case "assistant":
        this.handleAssistant(sessionName, msg);
        break;
      case "result":
        this.handleResult(sessionName, msg);
        break;
      case "stream_event":
        this.handleStreamEvent(sessionName, msg);
        break;
      case "control_request":
        this.handleControlRequest(sessionName, msg);
        break;
      case "keep_alive":
        // Ignore keep-alive messages
        break;
      case "tool_progress":
        this.handleToolProgress(sessionName, msg);
        break;
      case "tool_use_summary":
      case "auth_status":
      case "streamlined_text":
      case "streamlined_tool_use_summary":
        // Informational messages — no further processing needed
        break;
      default:
        console.log(
          `[WsSessionManager] Unknown message type for ${sessionName}:`,
          (msg as Record<string, unknown>).type
        );
    }
  }

  // ─── Message handlers ────────────────────────────────────────────

  private handleSystemInit(sessionName: string, msg: SystemInitMessage): void {
    const state = this.sessions.get(sessionName);
    if (!state) return;

    const previousStatus = state.status;

    state.claudeSessionId = msg.session_id;
    state.model = msg.model;
    state.tools = msg.tools || [];
    state.mcpServers = msg.mcp_servers || [];
    state.permissionMode = msg.permissionMode;
    state.cwd = msg.cwd;
    state.status = "ready";
    state.lastMessageAt = Date.now();

    this.claudeIdToSession.set(msg.session_id, sessionName);

    console.log(
      `[WsSessionManager] Session initialized: ${sessionName} (claude_id=${msg.session_id}, model=${msg.model})`
    );

    this.emit({
      type: "session_connected",
      sessionName,
      claudeSessionId: msg.session_id,
      model: msg.model,
      tools: state.tools,
    });

    if (previousStatus !== "ready") {
      this.emit({
        type: "status_changed",
        sessionName,
        previousStatus,
        newStatus: "ready",
      });
    }

    // Send any queued initial prompt
    const queuedPrompt = this.queuedPrompts.get(sessionName);
    if (queuedPrompt) {
      this.queuedPrompts.delete(sessionName);
      this.sendUserMessage(sessionName, queuedPrompt);
    }
  }

  private handleSystemStatus(sessionName: string, msg: SystemStatusMessage): void {
    const state = this.sessions.get(sessionName);
    if (!state) return;

    if (msg.permissionMode) {
      state.permissionMode = msg.permissionMode;
    }

    // Handle compacting status
    if (msg.status === "compacting" && state.status !== "compacting") {
      const previousStatus = state.status;
      state.status = "compacting";
      state.lastMessageAt = Date.now();
      this.emit({
        type: "status_changed",
        sessionName,
        previousStatus,
        newStatus: "compacting",
      });
    }
  }

  private handleAssistant(sessionName: string, msg: AssistantMessage): void {
    const state = this.sessions.get(sessionName);
    if (!state) return;

    const previousStatus = state.status;

    const text = extractTextFromBlocks(msg.message.content);

    state.lastAssistantMessage = text || state.lastAssistantMessage;
    state.lastAssistantContent = msg.message.content;
    state.status = "working";
    state.streamingText = "";
    state.lastMessageAt = Date.now();

    // Accumulate usage
    if (msg.message.usage) {
      state.totalUsage.input_tokens += msg.message.usage.input_tokens || 0;
      state.totalUsage.output_tokens += msg.message.usage.output_tokens || 0;
      state.totalUsage.cache_creation_input_tokens += msg.message.usage.cache_creation_input_tokens || 0;
      state.totalUsage.cache_read_input_tokens += msg.message.usage.cache_read_input_tokens || 0;
    }

    if (previousStatus !== "working") {
      this.emit({
        type: "status_changed",
        sessionName,
        previousStatus,
        newStatus: "working",
      });
    }

    this.emit({
      type: "assistant_message",
      sessionName,
      text,
      contentBlocks: msg.message.content,
      stopReason: msg.message.stop_reason,
    });
  }

  private handleResult(sessionName: string, msg: ResultMessage): void {
    const state = this.sessions.get(sessionName);
    if (!state) return;

    const previousStatus = state.status;

    state.turnCount += msg.num_turns || 1;
    state.totalCostUsd = msg.total_cost_usd ?? state.totalCostUsd;
    state.status = "waiting_for_input";
    state.streamingText = "";
    state.lastMessageAt = Date.now();

    if (!msg.is_error && "usage" in msg && msg.usage) {
      state.totalUsage.input_tokens += msg.usage.input_tokens || 0;
      state.totalUsage.output_tokens += msg.usage.output_tokens || 0;
      state.totalUsage.cache_creation_input_tokens += msg.usage.cache_creation_input_tokens || 0;
      state.totalUsage.cache_read_input_tokens += msg.usage.cache_read_input_tokens || 0;
    }

    if (msg.is_error && "errors" in msg) {
      state.error = msg.errors.join("; ");
    } else {
      state.error = undefined;
    }

    if (previousStatus !== "waiting_for_input") {
      this.emit({
        type: "status_changed",
        sessionName,
        previousStatus,
        newStatus: "waiting_for_input",
      });
    }

    this.emit({
      type: "result",
      sessionName,
      success: !msg.is_error,
      result: !msg.is_error && "result" in msg ? msg.result : undefined,
      errors: msg.is_error && "errors" in msg ? msg.errors : undefined,
      durationMs: msg.duration_ms,
      numTurns: msg.num_turns,
      totalCostUsd: msg.total_cost_usd,
    });

    if (msg.is_error && "errors" in msg) {
      this.emit({
        type: "error",
        sessionName,
        error: msg.errors.join("; "),
      });
    }
  }

  private handleStreamEvent(sessionName: string, msg: StreamEventMessage): void {
    const state = this.sessions.get(sessionName);
    if (!state) return;

    // Only process content_block_delta with text
    if (
      msg.event.type === "content_block_delta" &&
      msg.event.delta?.type === "text_delta"
    ) {
      const deltaText = msg.event.delta.text;
      state.streamingText += deltaText;
      state.lastMessageAt = Date.now();

      this.emit({
        type: "stream_delta",
        sessionName,
        text: deltaText,
        accumulatedText: state.streamingText,
      });
    }
  }

  private handleControlRequest(
    sessionName: string,
    msg: ControlRequestMessage
  ): void {
    const state = this.sessions.get(sessionName);
    if (!state) return;

    if (msg.request.subtype === "can_use_tool") {
      state.pendingToolApproval = {
        requestId: msg.request_id,
        toolName: msg.request.tool_name,
        toolInput: msg.request.input,
        toolUseId: msg.request.tool_use_id,
        receivedAt: Date.now(),
      };
      state.lastMessageAt = Date.now();

      console.log(
        `[WsSessionManager] Tool approval requested: ${sessionName} — ${msg.request.tool_name}`
      );

      this.emit({
        type: "tool_approval_needed",
        sessionName,
        approval: {
          requestId: msg.request_id,
          toolName: msg.request.tool_name,
          toolInput: msg.request.input,
          toolUseId: msg.request.tool_use_id,
          receivedAt: Date.now(),
        },
      });
    }
  }

  private handleToolProgress(
    sessionName: string,
    msg: ToolProgressMessage
  ): void {
    const state = this.sessions.get(sessionName);
    if (!state) return;

    state.lastMessageAt = Date.now();

    this.emit({
      type: "tool_progress",
      sessionName,
      toolName: msg.tool_name,
      toolUseId: msg.tool_use_id,
      elapsedSeconds: msg.elapsed_time_seconds,
    });
  }

  // ─── Outgoing messages (Server → CLI) ────────────────────────────

  sendUserMessage(sessionName: string, text: string): boolean {
    const ws = this.connections.get(sessionName);
    const state = this.sessions.get(sessionName);

    if (!ws || !state) {
      console.error(
        `[WsSessionManager] Cannot send message — no connection for ${sessionName}`
      );
      return false;
    }

    const msg: UserMessage = {
      type: "user",
      message: {
        role: "user",
        content: text,
      },
      parent_tool_use_id: null,
      session_id: state.claudeSessionId || "",
    };

    try {
      ws.send(JSON.stringify(msg) + "\n");
      const previousStatus = state.status;
      state.status = "working";
      state.streamingText = "";
      state.lastMessageAt = Date.now();

      if (previousStatus !== "working") {
        this.emit({
          type: "status_changed",
          sessionName,
          previousStatus,
          newStatus: "working",
        });
      }
      return true;
    } catch (err) {
      console.error(
        `[WsSessionManager] Failed to send user message to ${sessionName}:`,
        err
      );
      return false;
    }
  }

  respondToToolApproval(
    sessionName: string,
    requestId: string,
    decision: "allow" | "deny",
    message?: string
  ): boolean {
    const ws = this.connections.get(sessionName);
    const state = this.sessions.get(sessionName);

    if (!ws || !state) {
      console.error(
        `[WsSessionManager] Cannot respond to tool approval — no connection for ${sessionName}`
      );
      return false;
    }

    const responseBody: Record<string, unknown> =
      decision === "allow"
        ? {
            behavior: "allow",
            updatedInput: state.pendingToolApproval?.toolInput ?? {},
          }
        : {
            behavior: "deny",
            message: message || "Denied by user",
          };

    const msg: ControlResponseMessage = {
      type: "control_response",
      response: {
        subtype: "success",
        request_id: requestId,
        response: responseBody,
      },
    };

    try {
      ws.send(JSON.stringify(msg) + "\n");

      // Clear pending approval and emit resolved event
      state.pendingToolApproval = undefined;

      this.emit({
        type: "tool_approval_resolved",
        sessionName,
        requestId,
      });

      console.log(
        `[WsSessionManager] Tool approval ${decision}: ${sessionName} (request=${requestId})`
      );
      return true;
    } catch (err) {
      console.error(
        `[WsSessionManager] Failed to send tool approval response to ${sessionName}:`,
        err
      );
      return false;
    }
  }

  queueInitialPrompt(sessionName: string, text: string): void {
    this.queuedPrompts.set(sessionName, text);
  }

  // ─── Event subscription ──────────────────────────────────────────

  on(listener: WsEventListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) {
        this.listeners.splice(idx, 1);
      }
    };
  }

  private emit(event: WsSessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[WsSessionManager] Error in event listener:", err);
      }
    }
  }

  // ─── Query methods ───────────────────────────────────────────────

  getSessionState(name: string): WsSessionState | undefined {
    return this.sessions.get(name);
  }

  getAllSessions(): Map<string, WsSessionState> {
    return this.sessions;
  }

  isConnected(name: string): boolean {
    return this.connections.has(name);
  }

  getSessionNameByClaudeId(claudeSessionId: string): string | undefined {
    return this.claudeIdToSession.get(claudeSessionId);
  }

  removeSession(name: string): void {
    const state = this.sessions.get(name);
    if (state?.claudeSessionId) {
      this.claudeIdToSession.delete(state.claudeSessionId);
    }
    this.sessions.delete(name);
    this.connections.delete(name);
    this.queuedPrompts.delete(name);
  }
}

// Singleton export
export const wsSessionManager = new WsSessionManager();
