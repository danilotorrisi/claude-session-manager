import type { Server } from "bun";
import type { WorkerEvent, WorkerHostInfo } from "../worker/types";
import { wsSessionManager, type WsSocketData } from "../lib/ws-session-manager";
import { persistEvent, loadEvents } from "../lib/event-store";

// In-memory storage for demo (in production, use a DB)
interface WorkerInfo {
  lastHeartbeat: string;
  sessionCount: number;
  hostInfo?: WorkerHostInfo;
  registeredAt: string;
}

interface MasterState {
  workers: Map<string, WorkerInfo>;
  events: WorkerEvent[];
  sessions: Map<string, any>; // workerId:sessionName -> session data
}

const HEARTBEAT_ONLINE_THRESHOLD = 60_000;  // 60s
const HEARTBEAT_STALE_THRESHOLD = 120_000;  // 120s
const SESSION_EVENT_BUFFER_SIZE = 100;  // Keep last 100 events per session

const state: MasterState = {
  workers: new Map(),
  events: [],
  sessions: new Map(),
};

// Buffer recent WebSocket events per session for SSE replay on connect
const sessionEventBuffer = new Map<string, Array<{ event: Record<string, unknown>; timestamp: number }>>();

function bufferSessionEvent(sessionName: string, event: Record<string, unknown>) {
  let buffer = sessionEventBuffer.get(sessionName);
  if (!buffer) {
    buffer = [];
    sessionEventBuffer.set(sessionName, buffer);
  }
  buffer.push({ event, timestamp: Date.now() });
  // Keep only last N events
  if (buffer.length > SESSION_EVENT_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - SESSION_EVENT_BUFFER_SIZE);
  }
}

/** Reset in-memory state — for testing only. */
export function resetMasterState(): void {
  state.workers.clear();
  state.events.length = 0;
  state.sessions.clear();
}

export function handleWorkerEvent(event: WorkerEvent): Response {
  // Store event (cap at 1000 events)
  state.events.push(event);
  if (state.events.length > 1000) {
    state.events = state.events.slice(-1000);
  }

  // Handle worker registration/deregistration
  if (event.type === "worker_registered") {
    const existing = state.workers.get(event.workerId);
    state.workers.set(event.workerId, {
      lastHeartbeat: event.timestamp,
      sessionCount: event.data?.sessionCount || 0,
      hostInfo: event.data?.hostInfo,
      registeredAt: existing?.registeredAt || event.timestamp,
    });
  } else if (event.type === "worker_deregistered") {
    // Keep the worker entry but clear heartbeat so it appears offline
    const existing = state.workers.get(event.workerId);
    if (existing) {
      existing.lastHeartbeat = ""; // will appear offline
    }
  }

  // Update worker info on heartbeat
  if (event.type === "heartbeat") {
    const existing = state.workers.get(event.workerId);
    state.workers.set(event.workerId, {
      lastHeartbeat: event.timestamp,
      sessionCount: event.data?.sessionCount || 0,
      hostInfo: event.data?.hostInfo || existing?.hostInfo,
      registeredAt: existing?.registeredAt || event.timestamp,
    });
  }

  // Update session data
  if (event.sessionName) {
    const key = `${event.workerId}:${event.sessionName}`;

    switch (event.type) {
      case "session_discovered":
      case "session_created": {
        state.sessions.set(key, {
          workerId: event.workerId,
          sessionName: event.sessionName,
          created: event.timestamp,
          ...event.data,
        });
        const worker = state.workers.get(event.workerId);
        if (worker) {
          worker.sessionCount = Array.from(state.sessions.keys()).filter(k => k.startsWith(event.workerId + ":")).length;
        }
        break;
      }

      case "session_killed": {
        state.sessions.delete(key);
        const worker = state.workers.get(event.workerId);
        if (worker) {
          worker.sessionCount = Array.from(state.sessions.keys()).filter(k => k.startsWith(event.workerId + ":")).length;
        }
        break;
      }

      case "claude_state_changed":
      case "git_changes": {
        const existing = state.sessions.get(key);
        if (existing) {
          state.sessions.set(key, {
            ...existing,
            ...event.data,
            lastUpdate: event.timestamp,
          });
        }
        break;
      }
    }
  }

  console.log(`[Master] Event received: ${event.type} from ${event.workerId}`);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function handleWorkerSync(body: { sessions: any[] }): Response {
  console.log(`[Master] Full state sync received: ${body.sessions.length} sessions`);

  // In a real implementation, this would update the database
  // For now, just acknowledge
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function handleHealth(): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      workers: state.workers.size,
      sessions: state.sessions.size,
      events: state.events.length,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export function deriveWorkerStatus(lastHeartbeat: string): "online" | "stale" | "offline" {
  if (!lastHeartbeat) return "offline";
  const age = Date.now() - new Date(lastHeartbeat).getTime();
  if (age < HEARTBEAT_ONLINE_THRESHOLD) return "online";
  if (age < HEARTBEAT_STALE_THRESHOLD) return "stale";
  return "offline";
}

export function handleGetWorkers(): Response {
  const workers = Array.from(state.workers.entries()).map(([id, info]) => ({
    id,
    status: deriveWorkerStatus(info.lastHeartbeat),
    lastHeartbeat: info.lastHeartbeat,
    registeredAt: info.registeredAt,
    sessionCount: info.sessionCount,
    hostInfo: info.hostInfo,
  }));

  return new Response(
    JSON.stringify({ workers }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

function handleGetState(): Response {
  return new Response(
    JSON.stringify({
      workers: Array.from(state.workers.entries()).map(([id, data]) => ({
        id,
        ...data,
      })),
      sessions: Array.from(state.sessions.values()),
      recentEvents: state.events.slice(-20), // Last 20 events
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

export async function startApiServer(port: number = 3000): Promise<Server<WsSocketData>> {
  // Buffer all session events for SSE replay + persist to disk
  wsSessionManager.on((event) => {
    if ("sessionName" in event && typeof event.sessionName === "string") {
      bufferSessionEvent(event.sessionName, event as Record<string, unknown>);
      persistEvent(event.sessionName, event as Record<string, unknown>);
    }
  });

  const server = Bun.serve<WsSocketData>({
    port,
    idleTimeout: 0, // Disable idle timeout for SSE long-lived connections
    async fetch(req, server) {
      const url = new URL(req.url);

      // CORS headers for development
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
      }

      // WebSocket upgrade for Claude Code --sdk-url connections
      if (url.pathname === "/ws/sessions") {
        const sessionName = url.searchParams.get("name");
        if (!sessionName) {
          return new Response(
            JSON.stringify({ error: "Missing 'name' query parameter" }),
            { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
        const upgraded = server.upgrade(req, {
          data: { sessionName },
        });
        if (!upgraded) {
          return new Response("WebSocket upgrade failed", { status: 400, headers });
        }
        return;
      }

      // Health check
      if (url.pathname === "/api/health") {
        const response = handleHealth();
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      }

      // Worker event endpoint
      if (url.pathname === "/api/worker-events" && req.method === "POST") {
        try {
          const event: WorkerEvent = await req.json();
          const response = handleWorkerEvent(event);
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
          return response;
        } catch (error) {
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
          });
        }
      }

      // Worker sync endpoint
      if (url.pathname === "/api/worker-sync" && req.method === "POST") {
        try {
          const body = await req.json();
          const response = handleWorkerSync(body);
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });
          return response;
        } catch (error) {
          return new Response(JSON.stringify({ error: "Invalid request" }), {
            status: 400,
            headers: { ...headers, "Content-Type": "application/json" },
          });
        }
      }

      // List registered workers
      if (url.pathname === "/api/workers" && req.method === "GET") {
        const response = handleGetWorkers();
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      }

      // Get current state (for debugging)
      if (url.pathname === "/api/state" && req.method === "GET") {
        const response = handleGetState();
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
        return response;
      }

      // GET /api/config — return CSM config (projects, hosts)
      if (url.pathname === "/api/config" && req.method === "GET") {
        try {
          const { loadConfig } = await import("../lib/config");
          const config = await loadConfig();
          // Strip sensitive data (tokens) before sending
          const safeConfig = {
            projects: config.projects ?? [],
            hosts: config.hosts ?? {},
            projectsBase: config.projectsBase,
            hasLinear: !!config.linearApiKey,
            linearApiKey: config.linearApiKey, // Include for settings view
            toolApprovalRules: config.toolApprovalRules ?? [],
          };
          return new Response(
            JSON.stringify({ config: safeConfig }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to load config" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // PATCH /api/config — update CSM config (Linear API key)
      if (url.pathname === "/api/config" && req.method === "PATCH") {
        try {
          // Auth check for config updates
          const authToken = req.headers.get("Authorization")?.replace("Bearer ", "");
          if (!authToken) {
            return new Response(
              JSON.stringify({ error: "Unauthorized - missing token" }),
              { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const { validateApiToken } = await import("../lib/config");
          const valid = await validateApiToken(authToken);
          if (!valid) {
            return new Response(
              JSON.stringify({ error: "Unauthorized - invalid token" }),
              { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const body = await req.json();

          // Update Linear API key if provided
          if ("linearApiKey" in body) {
            const { setLinearApiKey } = await import("../lib/config");
            await setLinearApiKey(body.linearApiKey);
          }

          // Update tool approval rules if provided
          if ("toolApprovalRules" in body) {
            const { setToolApprovalRules } = await import("../lib/config");
            await setToolApprovalRules(body.toolApprovalRules);
            wsSessionManager.invalidateRulesCache();
          }

          return new Response(
            JSON.stringify({ success: true }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to update config" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // POST /api/config/rules — append a single tool approval rule
      if (url.pathname === "/api/config/rules" && req.method === "POST") {
        try {
          const authToken = req.headers.get("Authorization")?.replace("Bearer ", "");
          if (!authToken) {
            return new Response(
              JSON.stringify({ error: "Unauthorized - missing token" }),
              { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const { validateApiToken, getToolApprovalRules, setToolApprovalRules } = await import("../lib/config");
          const valid = await validateApiToken(authToken);
          if (!valid) {
            return new Response(
              JSON.stringify({ error: "Unauthorized - invalid token" }),
              { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const body = await req.json();
          if (!body.rule || !body.rule.tool || !body.rule.action) {
            return new Response(
              JSON.stringify({ error: "Missing rule with tool and action" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const rules = await getToolApprovalRules();
          rules.push(body.rule);
          await setToolApprovalRules(rules);
          wsSessionManager.invalidateRulesCache();

          return new Response(
            JSON.stringify({ success: true, rules }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to add rule" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // GET /api/claude-usage — fetch Claude usage limits (session/weekly/sonnet)
      if (url.pathname === "/api/claude-usage" && req.method === "GET") {
        try {
          const { fetchClaudeUsage } = await import("../lib/claude-usage");
          const usage = await fetchClaudeUsage();
          return new Response(
            JSON.stringify(usage),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Failed to fetch usage";
          return new Response(
            JSON.stringify({ error: message }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // ─── Session API endpoints ──────────────────────────
      // Auth middleware: validate token for session endpoints
      const isSessionEndpoint = url.pathname.startsWith("/api/sessions");
      if (isSessionEndpoint) {
        // Support token via query param for SSE (EventSource can't send headers)
        const authToken = req.headers.get("Authorization")?.replace("Bearer ", "") || url.searchParams.get("token");
        if (!authToken) {
          return new Response(
            JSON.stringify({ error: "Unauthorized - missing token" }),
            { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }

        const { validateApiToken } = await import("../lib/config");
        const valid = await validateApiToken(authToken);
        if (!valid) {
          return new Response(
            JSON.stringify({ error: "Unauthorized - invalid token" }),
            { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // GET /api/sessions — list all sessions with merged WS state
      if (url.pathname === "/api/sessions" && req.method === "GET") {
        try {
          const { listSessions } = await import("../lib/tmux");
          const sessions = await listSessions();

          // Merge WS state into each session
          for (const session of sessions) {
            const wsState = wsSessionManager.getSessionState(session.name);
            if (wsState && wsState.status !== "disconnected") {
              (session as any).wsConnected = true;
              (session as any).wsStatus = wsState.status;
              (session as any).wsModel = wsState.model;
              (session as any).wsTurnCount = wsState.turnCount;
              (session as any).wsCost = wsState.totalCostUsd;
              (session as any).pendingApproval = wsState.pendingToolApproval ?? null;
            }
          }

          return new Response(JSON.stringify({ sessions }), {
            headers: { ...headers, "Content-Type": "application/json" },
          });
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to list sessions" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // POST /api/sessions — create a new session
      if (url.pathname === "/api/sessions" && req.method === "POST") {
        try {
          const body = await req.json();
          const { name, repo, host, project, effort } = body;

          if (!name || typeof name !== "string") {
            return new Response(
              JSON.stringify({ error: "Missing or invalid 'name' field" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const { createSession } = await import("../lib/tmux");
          const { createWorktree, getWorktreePath } = await import("../lib/worktree");
          const { loadConfig } = await import("../lib/config");

          const config = await loadConfig();
          const projectObj = project ? config.projects?.find((p: any) => p.name === project) : undefined;
          const repoPath = repo || projectObj?.repoPath || undefined;
          const hostName = host === "local" ? undefined : host;

          // Validate effort if provided
          const validEfforts = ['low', 'medium', 'high'];
          if (effort && !validEfforts.includes(effort)) {
            return new Response(
              JSON.stringify({ error: "Invalid effort level. Must be 'low', 'medium', or 'high'" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          let workingDir = repoPath || process.cwd();
          if (repoPath) {
            try {
              const wtResult = await createWorktree(name, repoPath, hostName, undefined, project, effort);
              if (wtResult.success) {
                workingDir = await getWorktreePath(name, project);
              }
            } catch (e) {
              console.warn(`[Master] Worktree creation failed: ${e}`);
            }
          }

          const result = await createSession(name, workingDir, hostName, undefined, projectObj, effort);

          return new Response(
            JSON.stringify({ success: result.success, name: `csm-${name}` }),
            {
              status: result.success ? 201 : 500,
              headers: { ...headers, "Content-Type": "application/json" },
            }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to create session" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // POST /api/sessions/:name/message — send a message to a session
      const messageMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/message$/);
      if (messageMatch && req.method === "POST") {
        try {
          const sessionName = decodeURIComponent(messageMatch[1]);
          const body = await req.json();

          if (!body.text || typeof body.text !== "string") {
            return new Response(
              JSON.stringify({ error: "Missing or invalid 'text' field" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          // Persist user message for SSE replay
          const userEvent = { type: "user_message", sessionName, text: body.text };
          bufferSessionEvent(sessionName, userEvent);
          persistEvent(sessionName, userEvent);

          // Try WebSocket first, fall back to tmux
          if (wsSessionManager.isConnected(sessionName)) {
            const sent = wsSessionManager.sendUserMessage(sessionName, body.text);
            return new Response(
              JSON.stringify({ success: sent, method: "websocket" }),
              { headers: { ...headers, "Content-Type": "application/json" } }
            );
          } else {
            const { sendToSession } = await import("../lib/tmux");
            const result = await sendToSession(sessionName, body.text);
            return new Response(
              JSON.stringify({ success: result.success, method: "tmux" }),
              {
                status: result.success ? 200 : 500,
                headers: { ...headers, "Content-Type": "application/json" },
              }
            );
          }
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Invalid request" }),
            { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // GET /api/sessions/:name/stream — SSE stream of session events
      const streamMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/stream$/);
      if (streamMatch && req.method === "GET") {
        const sessionName = decodeURIComponent(streamMatch[1]);
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            // Send initial connection event
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "connected", sessionName })}\n\n`)
            );

            // Send current state snapshot if available
            const currentState = wsSessionManager.getSessionState(sessionName);
            if (currentState) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "state_snapshot", sessionName, state: currentState })}\n\n`
                )
              );
            }

            // Replay persisted events from disk (falls back to in-memory buffer)
            const persisted = await loadEvents(sessionName);
            const replayEvents = persisted.length > 0
              ? persisted.map((e) => e.event)
              : (sessionEventBuffer.get(sessionName) ?? []).map((e) => e.event);

            for (const event of replayEvents) {
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
              } catch {
                break;
              }
            }

            // Subscribe to wsSessionManager events for this session
            console.log(`[SSE] Client subscribed to session: ${sessionName}`);
            const unsubscribe = wsSessionManager.on((event) => {
              if ("sessionName" in event && event.sessionName === sessionName) {
                console.log(`[SSE] Forwarding event to client: ${event.type} for ${sessionName}`);
                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
                } catch {
                  // Stream already closed
                  unsubscribe();
                }
              }
            });

            // Cleanup on client disconnect
            req.signal.addEventListener("abort", () => {
              unsubscribe();
              try {
                controller.close();
              } catch {
                // Already closed
              }
            });
          },
        });

        return new Response(stream, {
          headers: {
            ...headers,
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      }

      // POST /api/sessions/:name/approve-tool — approve or deny a tool use request
      const approveMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/approve-tool$/);
      if (approveMatch && req.method === "POST") {
        try {
          const sessionName = decodeURIComponent(approveMatch[1]);
          const body = await req.json();

          if (!body.requestId || !body.action) {
            return new Response(
              JSON.stringify({ error: "Missing requestId or action" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          if (body.action !== "allow" && body.action !== "deny") {
            return new Response(
              JSON.stringify({ error: "action must be 'allow' or 'deny'" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          if (!wsSessionManager.isConnected(sessionName)) {
            return new Response(
              JSON.stringify({ error: "Session not connected via WebSocket" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const success = wsSessionManager.respondToToolApproval(
            sessionName,
            body.requestId,
            body.action,
            body.message
          );

          return new Response(
            JSON.stringify({ success }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Invalid request" }),
            { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // GET /api/sessions/:name/diff?file=<path> — get git diff for a file
      const diffMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/diff$/);
      if (diffMatch && req.method === "GET") {
        try {
          const sessionName = decodeURIComponent(diffMatch[1]);
          const filePath = url.searchParams.get("file");

          const { listSessions } = await import("../lib/tmux");
          const { exec } = await import("../lib/ssh");
          const sessions = await listSessions();
          const session = sessions.find((s) => s.name === sessionName);

          if (!session?.worktreePath) {
            return new Response(
              JSON.stringify({ error: "Session not found or no worktree" }),
              { status: 404, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const wt = session.worktreePath;
          let diff: string;

          if (filePath) {
            // Diff for a specific file
            const result = await exec(
              `cd "${wt}" && git diff HEAD -- "${filePath}" 2>/dev/null || git diff -- "${filePath}" 2>/dev/null`,
              session.host
            );
            diff = result.stdout || '';

            // If no diff (e.g. untracked/new file), show full file content as additions
            if (!diff.trim()) {
              const catResult = await exec(
                `cd "${wt}" && cat "${filePath}" 2>/dev/null`,
                session.host
              );
              if (catResult.stdout) {
                const lines = catResult.stdout.split('\n');
                const hunkHeader = `@@ -0,0 +1,${lines.length} @@`;
                diff = `--- /dev/null\n+++ b/${filePath}\n${hunkHeader}\n${lines.map(l => '+' + l).join('\n')}`;
              }
            }
          } else {
            // Full diff
            const result = await exec(
              `cd "${wt}" && git diff HEAD 2>/dev/null || git diff 2>/dev/null`,
              session.host
            );
            diff = result.stdout || '';
          }

          return new Response(
            JSON.stringify({ diff }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to get diff" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // POST /api/sessions/:name/reconnect — restart Claude Code with --sdk-url and --continue
      const reconnectMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/reconnect$/);
      if (reconnectMatch && req.method === "POST") {
        try {
          const sessionName = decodeURIComponent(reconnectMatch[1]);
          const { reconnectSession } = await import("../lib/tmux");
          const result = await reconnectSession(sessionName);
          return new Response(
            JSON.stringify({ success: result.success }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to reconnect session" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // POST /api/sessions/:name/kill — kill a session and clean up
      const killMatch = url.pathname.match(/^\/api\/sessions\/([^/]+)\/kill$/);
      if (killMatch && req.method === "POST") {
        try {
          const sessionName = decodeURIComponent(killMatch[1]);
          const { killSession } = await import("../lib/tmux");
          const { removeWorktree, loadSessionMetadata, worktreeExists } = await import("../lib/worktree");
          const { cleanupStateFile } = await import("../lib/claude-state");

          // Kill the tmux session
          const result = await killSession(sessionName);

          // Clean up worktree if it exists
          const metadata = await loadSessionMetadata(sessionName);
          if (metadata?.repoPath && await worktreeExists(sessionName)) {
            await removeWorktree(sessionName, metadata.repoPath);
          }

          // Clean up Claude state file
          cleanupStateFile(sessionName);

          return new Response(
            JSON.stringify({ success: result.success }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to kill session" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // ─── Linear API endpoints ──────────────────────────────────

      // GET /api/linear/search?q=<query> — search Linear issues
      if (url.pathname === "/api/linear/search" && req.method === "GET") {
        try {
          const query = url.searchParams.get("q") || "";
          if (query.length < 2) {
            return new Response(
              JSON.stringify({ issues: [] }),
              { headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const { searchIssues } = await import("../lib/linear");
          const { loadConfig } = await import("../lib/config");
          const config = await loadConfig();
          const apiKey = config.linearApiKey;
          if (!apiKey) {
            return new Response(
              JSON.stringify({ issues: [], error: "Linear API key not configured" }),
              { headers: { ...headers, "Content-Type": "application/json" } }
            );
          }
          const issues = await searchIssues(query, apiKey);
          return new Response(
            JSON.stringify({ issues }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ issues: [], error: "Linear search failed" }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // GET /api/linear/my-issues — list my assigned Linear issues
      if (url.pathname === "/api/linear/my-issues" && req.method === "GET") {
        try {
          const { listMyIssues } = await import("../lib/linear");
          const { loadConfig } = await import("../lib/config");
          const config = await loadConfig();
          const apiKey = config.linearApiKey;
          if (!apiKey) {
            return new Response(
              JSON.stringify({ issues: [], error: "Linear API key not configured" }),
              { headers: { ...headers, "Content-Type": "application/json" } }
            );
          }
          const issues = await listMyIssues(apiKey);
          return new Response(
            JSON.stringify({ issues }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ issues: [], error: "Failed to fetch issues" }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // GET /api/linear/issues/:issueId/comments — fetch comments for an issue
      const commentsMatch = url.pathname.match(/^\/api\/linear\/issues\/([^/]+)\/comments$/);
      if (commentsMatch && req.method === "GET") {
        try {
          const issueId = decodeURIComponent(commentsMatch[1]);
          const { fetchIssueComments } = await import("../lib/linear");
          const { loadConfig } = await import("../lib/config");
          const config = await loadConfig();
          const apiKey = config.linearApiKey;
          if (!apiKey) {
            return new Response(
              JSON.stringify({ comments: [], error: "Linear API key not configured" }),
              { headers: { ...headers, "Content-Type": "application/json" } }
            );
          }
          const comments = await fetchIssueComments(apiKey, issueId);
          return new Response(
            JSON.stringify({ comments }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ comments: [], error: "Failed to fetch comments" }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // POST /api/linear/issues/:issueId/comments — create a comment on an issue
      const createCommentMatch = url.pathname.match(/^\/api\/linear\/issues\/([^/]+)\/comments$/);
      if (createCommentMatch && req.method === "POST") {
        try {
          const issueId = decodeURIComponent(createCommentMatch[1]);
          const body = await req.json();

          if (!body.body || typeof body.body !== "string") {
            return new Response(
              JSON.stringify({ error: "Missing or invalid 'body' field" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const { createIssueComment } = await import("../lib/linear");
          const { loadConfig } = await import("../lib/config");
          const config = await loadConfig();
          const apiKey = config.linearApiKey;
          if (!apiKey) {
            return new Response(
              JSON.stringify({ error: "Linear API key not configured" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }
          const comment = await createIssueComment(apiKey, issueId, body.body);
          return new Response(
            JSON.stringify({ comment }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to create comment" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // ─── Auth endpoints ────────────────────────────────────────

      // GET /api/auth/setup — get or create default API token (first-time setup)
      if (url.pathname === "/api/auth/setup" && req.method === "GET") {
        try {
          const { getOrCreateDefaultToken } = await import("../lib/config");
          const token = await getOrCreateDefaultToken();
          return new Response(
            JSON.stringify({ token }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to setup token" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // POST /api/auth/validate — validate an API token
      if (url.pathname === "/api/auth/validate" && req.method === "POST") {
        try {
          const { token } = await req.json();
          if (!token) {
            return new Response(
              JSON.stringify({ valid: false, error: "Missing token" }),
              { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const { validateApiToken } = await import("../lib/config");
          const valid = await validateApiToken(token);

          return new Response(
            JSON.stringify({ valid }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ valid: false, error: "Invalid request" }),
            { status: 400, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      // GET /api/auth/tokens — list all API tokens
      if (url.pathname === "/api/auth/tokens" && req.method === "GET") {
        try {
          // Check auth
          const authToken = req.headers.get("Authorization")?.replace("Bearer ", "");
          if (!authToken) {
            return new Response(
              JSON.stringify({ error: "Unauthorized" }),
              { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const { validateApiToken, listApiTokens } = await import("../lib/config");
          const valid = await validateApiToken(authToken);
          if (!valid) {
            return new Response(
              JSON.stringify({ error: "Invalid token" }),
              { status: 401, headers: { ...headers, "Content-Type": "application/json" } }
            );
          }

          const tokens = await listApiTokens();
          return new Response(
            JSON.stringify({ tokens }),
            { headers: { ...headers, "Content-Type": "application/json" } }
          );
        } catch (error) {
          return new Response(
            JSON.stringify({ error: "Failed to list tokens" }),
            { status: 500, headers: { ...headers, "Content-Type": "application/json" } }
          );
        }
      }

      return new Response("Not Found", { status: 404, headers });
    },
    websocket: {
      open(ws) {
        wsSessionManager.handleConnection(ws);
      },
      message(ws, data) {
        wsSessionManager.handleMessage(ws, data);
      },
      close(ws) {
        wsSessionManager.handleClose(ws);
      },
    },
  });

  console.log(`[Master] API server listening on http://localhost:${port}`);
  console.log(`[Master] Health: http://localhost:${port}/api/health`);
  console.log(`[Master] Workers: http://localhost:${port}/api/workers`);
  console.log(`[Master] State: http://localhost:${port}/api/state`);
  console.log(`[Master] WebSocket: ws://localhost:${port}/ws/sessions?name=<session>`);

  return server;
}
