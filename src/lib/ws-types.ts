/**
 * WebSocket protocol types for Claude Code's --sdk-url integration.
 *
 * Protocol: NDJSON (newline-delimited JSON) over WebSocket.
 * Reference: https://github.com/The-Vibe-Company/companion/blob/main/WEBSOCKET_PROTOCOL_REVERSED.md
 */

// ─── Common / Shared Types ──────────────────────────────────────────────────

export interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

export interface ModelUsageEntry {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests?: number;
  costUSD: number;
  contextWindow?: number;
  maxOutputTokens?: number;
}

export interface McpServerInfo {
  name: string;
  status: "connected" | "failed" | "disabled" | "connecting";
  serverInfo?: Record<string, unknown>;
  error?: string;
  config?: {
    type: "stdio" | "sse" | "http" | "sdk";
    url?: string;
    command?: string;
    args?: string[];
  };
  scope?: string;
  tools?: Array<{
    name: string;
    annotations?: { readOnly?: boolean; destructive?: boolean };
  }>;
}

/** Simple MCP server info included in system/init. */
export interface McpServerBasicInfo {
  name: string;
  status: string;
}

export type PermissionMode =
  | "default"
  | "acceptEdits"
  | "bypassPermissions"
  | "plan"
  | "delegate"
  | "dontAsk";

// ─── Content Block Types ────────────────────────────────────────────────────

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
}

export type ContentBlock = TextBlock | ToolUseBlock | ThinkingBlock;

// ─── Stream Event Delta Types ───────────────────────────────────────────────

export interface TextDelta {
  type: "text_delta";
  text: string;
}

export interface InputJsonDelta {
  type: "input_json_delta";
  partial_json: string;
}

export interface ThinkingDelta {
  type: "thinking_delta";
  thinking: string;
}

export type StreamDelta = TextDelta | InputJsonDelta | ThinkingDelta;

// ─── CLI → Server: System Messages ─────────────────────────────────────────

/** First message from CLI after WebSocket connection. */
export interface SystemInitMessage {
  type: "system";
  subtype: "init";
  cwd: string;
  session_id: string;
  tools: string[];
  mcp_servers: McpServerBasicInfo[];
  model: string;
  permissionMode: PermissionMode;
  apiKeySource?: string;
  claude_code_version?: string;
  slash_commands?: string[];
  agents?: string[];
  skills?: string[];
  plugins?: Array<{ name: string; path: string }>;
  output_style?: string;
  uuid: string;
}

/** Runtime status changes (e.g. compacting). */
export interface SystemStatusMessage {
  type: "system";
  subtype: "status";
  status: string | null;
  permissionMode?: PermissionMode;
  uuid: string;
  session_id: string;
}

/** Post-compaction context signal. */
export interface SystemCompactBoundaryMessage {
  type: "system";
  subtype: "compact_boundary";
  compact_metadata: {
    trigger: "manual" | "auto";
    pre_tokens: number;
  };
  uuid: string;
  session_id: string;
}

/** Sub-agent task completion. */
export interface SystemTaskNotificationMessage {
  type: "system";
  subtype: "task_notification";
  task_id: string;
  status: "completed" | "failed" | "stopped";
  output_file?: string;
  summary?: string;
  uuid: string;
  session_id: string;
}

/** File upload completion. */
export interface SystemFilesPersistedMessage {
  type: "system";
  subtype: "files_persisted";
  files: Array<{ filename: string; file_id: string }>;
  failed: Array<{ filename: string; error: string }>;
  processed_at: string;
  uuid: string;
  session_id: string;
}

/** Hook lifecycle: started. */
export interface SystemHookStartedMessage {
  type: "system";
  subtype: "hook_started";
  hook_id: string;
  hook_name: string;
  hook_event: "PreToolUse" | "PostToolUse" | "PermissionRequest";
  uuid: string;
  session_id: string;
}

/** Hook lifecycle: progress output. */
export interface SystemHookProgressMessage {
  type: "system";
  subtype: "hook_progress";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  stdout?: string;
  stderr?: string;
  output?: string;
  uuid: string;
  session_id: string;
}

/** Hook lifecycle: completed with result. */
export interface SystemHookResponseMessage {
  type: "system";
  subtype: "hook_response";
  hook_id: string;
  hook_name: string;
  hook_event: string;
  output?: string;
  stdout?: string;
  stderr?: string;
  exit_code: number;
  outcome: "success" | "error" | "cancelled";
  uuid: string;
  session_id: string;
}

/** Discriminated union of all system message subtypes. */
export type SystemMessage =
  | SystemInitMessage
  | SystemStatusMessage
  | SystemCompactBoundaryMessage
  | SystemTaskNotificationMessage
  | SystemFilesPersistedMessage
  | SystemHookStartedMessage
  | SystemHookProgressMessage
  | SystemHookResponseMessage;

// ─── CLI → Server: Assistant Message ────────────────────────────────────────

/** Complete LLM response with content blocks. */
export interface AssistantMessage {
  type: "assistant";
  message: {
    id: string;
    type: "message";
    role: "assistant";
    model: string;
    content: ContentBlock[];
    stop_reason: "end_turn" | "tool_use" | null;
    usage: TokenUsage;
  };
  parent_tool_use_id: string | null;
  error?: string;
  uuid: string;
  session_id: string;
}

// ─── CLI → Server: Stream Event ─────────────────────────────────────────────

/** Token-by-token streaming event (requires --verbose). */
export interface StreamEventMessage {
  type: "stream_event";
  event: {
    type:
      | "content_block_start"
      | "content_block_delta"
      | "content_block_stop"
      | "message_start"
      | "message_delta"
      | "message_stop";
    index?: number;
    delta?: StreamDelta;
    content_block?: ContentBlock;
    [key: string]: unknown;
  };
  parent_tool_use_id: string | null;
  uuid: string;
  session_id: string;
}

// ─── CLI → Server: Result Messages ──────────────────────────────────────────

/** Successful query completion. */
export interface ResultSuccessMessage {
  type: "result";
  subtype: "success";
  is_error: false;
  result: string;
  duration_ms: number;
  duration_api_ms: number;
  num_turns: number;
  total_cost_usd: number;
  stop_reason: string | null;
  usage: TokenUsage;
  modelUsage?: Record<string, ModelUsageEntry>;
  permission_denials?: Array<{
    tool_name: string;
    tool_use_id: string;
    tool_input: Record<string, unknown>;
  }>;
  structured_output?: unknown;
  uuid: string;
  session_id: string;
}

/** Error query completion. */
export interface ResultErrorMessage {
  type: "result";
  subtype:
    | "error_during_execution"
    | "error_max_turns"
    | "error_max_budget_usd"
    | "error_max_structured_output_retries";
  is_error: true;
  errors: string[];
  duration_ms: number;
  num_turns: number;
  total_cost_usd: number;
  uuid: string;
  session_id: string;
}

/** Discriminated union of result subtypes. */
export type ResultMessage = ResultSuccessMessage | ResultErrorMessage;

// ─── CLI → Server: Tool Messages ────────────────────────────────────────────

/** Heartbeat during tool execution. */
export interface ToolProgressMessage {
  type: "tool_progress";
  tool_use_id: string;
  tool_name: string;
  parent_tool_use_id: string | null;
  elapsed_time_seconds: number;
  uuid: string;
  session_id: string;
}

/** Summary after tool completes. */
export interface ToolUseSummaryMessage {
  type: "tool_use_summary";
  summary: string;
  preceding_tool_use_ids: string[];
  uuid: string;
  session_id: string;
}

// ─── CLI → Server: Auth Status ──────────────────────────────────────────────

/** Authentication flow status. */
export interface AuthStatusMessage {
  type: "auth_status";
  isAuthenticating: boolean;
  output?: string[];
  error?: string;
  uuid: string;
  session_id: string;
}

// ─── CLI → Server: Streamlined Messages (internal) ──────────────────────────

export interface StreamlinedTextMessage {
  type: "streamlined_text";
  text: string;
  session_id: string;
  uuid: string;
}

export interface StreamlinedToolUseSummaryMessage {
  type: "streamlined_tool_use_summary";
  tool_summary: string;
  session_id: string;
  uuid: string;
}

// ─── Server → CLI: User Message ─────────────────────────────────────────────

/** User prompt or follow-up sent to CLI. */
export interface UserMessage {
  type: "user";
  message: {
    role: "user";
    content: string | ContentBlock[];
  };
  parent_tool_use_id: string | null;
  session_id: string;
  uuid?: string;
  isSynthetic?: boolean;
}

// ─── Server → CLI: Environment Variables ────────────────────────────────────

export interface UpdateEnvironmentVariablesMessage {
  type: "update_environment_variables";
  variables: Record<string, string>;
}

// ─── Bidirectional: Keep-Alive ──────────────────────────────────────────────

export interface KeepAliveMessage {
  type: "keep_alive";
}

// ─── Control Protocol ───────────────────────────────────────────────────────

/** Wrapper for all control requests. */
export interface ControlRequestMessage {
  type: "control_request";
  request_id: string;
  request: ControlRequestPayload;
}

/** Wrapper for all control responses. */
export interface ControlResponseMessage {
  type: "control_response";
  response: ControlResponsePayload;
}

/** Cancel an in-flight control request. */
export interface ControlCancelRequestMessage {
  type: "control_cancel_request";
  request_id: string;
}

// ─── Control Request Payloads (discriminated on subtype) ────────────────────

export interface InitializeRequest {
  subtype: "initialize";
  hooks?: {
    PreToolUse?: Array<{
      matcher: string;
      hookCallbackIds: string[];
      timeout?: number;
    }>;
    PostToolUse?: Array<{
      matcher: string;
      hookCallbackIds: string[];
      timeout?: number;
    }>;
    PermissionRequest?: Array<{
      matcher: string;
      hookCallbackIds: string[];
      timeout?: number;
    }>;
  };
  sdkMcpServers?: string[];
  jsonSchema?: Record<string, unknown>;
  systemPrompt?: string;
  appendSystemPrompt?: string;
  agents?: Record<string, Record<string, unknown>>;
}

/** CLI requests tool execution permission. Most critical control message. */
export interface CanUseToolRequest {
  subtype: "can_use_tool";
  tool_name: string;
  input: Record<string, unknown>;
  permission_suggestions?: unknown[];
  blocked_path?: string;
  decision_reason?:
    | "hook"
    | "asyncAgent"
    | "sandboxOverride"
    | "classifier"
    | "workingDir"
    | "other";
  tool_use_id: string;
  agent_id?: string;
  description?: string;
}

export interface InterruptRequest {
  subtype: "interrupt";
}

export interface SetPermissionModeRequest {
  subtype: "set_permission_mode";
  mode: PermissionMode;
}

export interface SetModelRequest {
  subtype: "set_model";
  model: string;
}

export interface SetMaxThinkingTokensRequest {
  subtype: "set_max_thinking_tokens";
  max_thinking_tokens: number;
}

export interface McpStatusRequest {
  subtype: "mcp_status";
}

export interface McpMessageRequest {
  subtype: "mcp_message";
  server_name: string;
  message: Record<string, unknown>;
}

export interface McpReconnectRequest {
  subtype: "mcp_reconnect";
  serverName: string;
}

export interface McpToggleRequest {
  subtype: "mcp_toggle";
  serverName: string;
  enabled: boolean;
}

export interface McpSetServersRequest {
  subtype: "mcp_set_servers";
  servers: Record<
    string,
    {
      type: "stdio" | "sse" | "http" | "sdk";
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
    }
  >;
}

export interface RewindFilesRequest {
  subtype: "rewind_files";
  user_message_id: string;
  dry_run?: boolean;
}

export interface HookCallbackRequest {
  subtype: "hook_callback";
  callback_id: string;
  input: Record<string, unknown>;
  tool_use_id: string;
}

/** Discriminated union of all control request subtypes. */
export type ControlRequestPayload =
  | InitializeRequest
  | CanUseToolRequest
  | InterruptRequest
  | SetPermissionModeRequest
  | SetModelRequest
  | SetMaxThinkingTokensRequest
  | McpStatusRequest
  | McpMessageRequest
  | McpReconnectRequest
  | McpToggleRequest
  | McpSetServersRequest
  | RewindFilesRequest
  | HookCallbackRequest;

// ─── Control Response Payloads ──────────────────────────────────────────────

export interface ControlSuccessResponse {
  subtype: "success";
  request_id: string;
  response: Record<string, unknown>;
}

export interface ControlErrorResponse {
  subtype: "error";
  request_id: string;
  error: string;
  pending_permission_requests?: unknown[];
}

export type ControlResponsePayload =
  | ControlSuccessResponse
  | ControlErrorResponse;

// ─── Tool Approval (can_use_tool response shapes) ───────────────────────────

export interface PermissionRule {
  type:
    | "addRules"
    | "replaceRules"
    | "removeRules"
    | "setMode"
    | "addDirectories"
    | "removeDirectories";
  rules?: Array<{ toolName: string; ruleContent: string }>;
  behavior?: "allow" | "deny" | "ask";
  destination?:
    | "userSettings"
    | "projectSettings"
    | "localSettings"
    | "session"
    | "cliArg";
}

export interface ToolApprovalAllow {
  behavior: "allow";
  updatedInput: Record<string, unknown>;
  updatedPermissions?: PermissionRule[];
  toolUseID?: string;
}

export interface ToolApprovalDeny {
  behavior: "deny";
  message?: string;
  interrupt?: boolean;
  toolUseID?: string;
}

export type ToolApprovalResponse = ToolApprovalAllow | ToolApprovalDeny;

// ─── Hook Callback Response ─────────────────────────────────────────────────

export interface HookCallbackSyncResponse {
  continue: boolean;
  suppressOutput?: boolean;
  stopReason?: string;
  decision?: "approve" | "block";
  reason?: string;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: "PreToolUse" | "PostToolUse" | "PermissionRequest";
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
  };
}

export interface HookCallbackAsyncResponse {
  async: true;
  asyncTimeout: number;
}

export type HookCallbackResponse =
  | HookCallbackSyncResponse
  | HookCallbackAsyncResponse;

// ─── Top-Level Message Unions ───────────────────────────────────────────────

/** All messages the CLI can send to the server. */
export type CliToServerMessage =
  | SystemMessage
  | AssistantMessage
  | StreamEventMessage
  | ResultMessage
  | ToolProgressMessage
  | ToolUseSummaryMessage
  | AuthStatusMessage
  | StreamlinedTextMessage
  | StreamlinedToolUseSummaryMessage
  | ControlRequestMessage
  | KeepAliveMessage;

/** All messages the server can send to the CLI. */
export type ServerToCliMessage =
  | UserMessage
  | ControlResponseMessage
  | ControlCancelRequestMessage
  | UpdateEnvironmentVariablesMessage
  | KeepAliveMessage;

/** Any message that can appear on the wire. */
export type WsMessage = CliToServerMessage | ServerToCliMessage;

/**
 * Alias for backward compatibility.
 * Represents messages coming from the CLI to our server.
 */
export type IncomingWsMessage = CliToServerMessage;

// ─── Derived Session State ──────────────────────────────────────────────────

export type WsSessionStatus =
  | "connecting"
  | "initializing"
  | "ready"
  | "working"
  | "waiting_for_input"
  | "compacting"
  | "error"
  | "disconnected";

export interface PendingToolApproval {
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: string;
  description?: string;
  receivedAt: number;
}

export interface WsSessionState {
  sessionName: string;
  claudeSessionId?: string;
  status: WsSessionStatus;
  model?: string;
  tools: string[];
  mcpServers: McpServerBasicInfo[];
  permissionMode?: PermissionMode;
  cwd?: string;
  lastAssistantMessage?: string;
  lastAssistantContent?: ContentBlock[];
  pendingToolApproval?: PendingToolApproval;
  turnCount: number;
  totalCostUsd: number;
  totalUsage: TokenUsage;
  streamingText: string;
  connectedAt?: number;
  lastMessageAt?: number;
  error?: string;
}

// ─── Session Events (for TUI/API consumers) ────────────────────────────────

export interface SessionConnectedEvent {
  type: "session_connected";
  sessionName: string;
  claudeSessionId: string;
  model: string;
  tools: string[];
}

export interface SessionDisconnectedEvent {
  type: "session_disconnected";
  sessionName: string;
}

export interface StatusChangedEvent {
  type: "status_changed";
  sessionName: string;
  previousStatus: WsSessionStatus;
  newStatus: WsSessionStatus;
}

export interface AssistantMessageEvent {
  type: "assistant_message";
  sessionName: string;
  text: string;
  contentBlocks: ContentBlock[];
  stopReason: "end_turn" | "tool_use" | null;
}

export interface StreamDeltaEvent {
  type: "stream_delta";
  sessionName: string;
  text: string;
  accumulatedText: string;
}

export interface ToolApprovalNeededEvent {
  type: "tool_approval_needed";
  sessionName: string;
  approval: PendingToolApproval;
}

export interface ToolApprovalResolvedEvent {
  type: "tool_approval_resolved";
  sessionName: string;
  requestId: string;
}

export interface ResultEvent {
  type: "result";
  sessionName: string;
  success: boolean;
  result?: string;
  errors?: string[];
  numTurns: number;
  totalCostUsd: number;
  durationMs: number;
}

export interface ErrorEvent {
  type: "error";
  sessionName: string;
  error: string;
}

export interface ToolProgressEvent {
  type: "tool_progress";
  sessionName: string;
  toolName: string;
  toolUseId: string;
  elapsedSeconds: number;
}

export type WsSessionEvent =
  | SessionConnectedEvent
  | SessionDisconnectedEvent
  | StatusChangedEvent
  | AssistantMessageEvent
  | StreamDeltaEvent
  | ToolApprovalNeededEvent
  | ToolApprovalResolvedEvent
  | ResultEvent
  | ErrorEvent
  | ToolProgressEvent;

// ─── Event Listener ─────────────────────────────────────────────────────────

export type WsEventListener = (event: WsSessionEvent) => void;

// ─── Helper: Create empty session state ─────────────────────────────────────

export function createInitialSessionState(
  sessionName: string,
): WsSessionState {
  return {
    sessionName,
    status: "connecting",
    tools: [],
    mcpServers: [],
    turnCount: 0,
    totalCostUsd: 0,
    totalUsage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
    streamingText: "",
    connectedAt: Date.now(),
  };
}
