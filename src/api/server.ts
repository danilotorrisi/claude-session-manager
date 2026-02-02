import type { Server } from "bun";
import type { WorkerEvent, WorkerHostInfo } from "../worker/types";

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

const state: MasterState = {
  workers: new Map(),
  events: [],
  sessions: new Map(),
};

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
      case "session_created":
        state.sessions.set(key, {
          workerId: event.workerId,
          sessionName: event.sessionName,
          created: event.timestamp,
          ...event.data,
        });
        break;

      case "session_killed":
        state.sessions.delete(key);
        break;

      case "session_attached":
      case "session_detached":
      case "claude_state_changed":
      case "git_changes": {
        const existing = state.sessions.get(key) || {
          workerId: event.workerId,
          sessionName: event.sessionName,
          created: event.timestamp,
        };
        state.sessions.set(key, {
          ...existing,
          ...event.data,
          lastUpdate: event.timestamp,
        });
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

function handleWorkerSync(body: { sessions: any[], workerId?: string }): Response {
  console.log(`[Master] Full state sync received: ${body.sessions.length} sessions`);

  for (const session of body.sessions) {
    const wId = session.workerId || body.workerId || "unknown";
    const sName = session.sessionName || session.name;
    if (!sName) continue;
    const key = `${wId}:${sName}`;
    const existing = state.sessions.get(key);
    state.sessions.set(key, {
      ...existing,
      ...session,
      workerId: wId,
      sessionName: sName,
      lastUpdate: new Date().toISOString(),
    });
  }

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

function handleGetEvents(url: URL): Response {
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const before = url.searchParams.get("before");

  let events = state.events;
  if (before) {
    const beforeTime = new Date(before).getTime();
    events = events.filter((e) => new Date(e.timestamp).getTime() < beforeTime);
  }

  // Return most recent events first, up to limit
  const page = events.slice(-limit).reverse();

  return new Response(
    JSON.stringify({
      events: page,
      hasMore: events.length > limit,
      total: events.length,
    }),
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

export async function startApiServer(port: number = 3000): Promise<Server> {
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);

      // CORS headers for development
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers });
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

      // Paginated events
      if (url.pathname === "/api/events" && req.method === "GET") {
        const response = handleGetEvents(url);
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

      return new Response("Not Found", { status: 404, headers });
    },
  });

  console.log(`[Master] API server listening on http://localhost:${port}`);
  console.log(`[Master] Health: http://localhost:${port}/api/health`);
  console.log(`[Master] Workers: http://localhost:${port}/api/workers`);
  console.log(`[Master] Events: http://localhost:${port}/api/events`);
  console.log(`[Master] State: http://localhost:${port}/api/state`);

  return server;
}
