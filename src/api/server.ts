import type { Server } from "bun";
import type { WorkerEvent } from "../worker/types";

// In-memory storage for demo (in production, use a DB)
interface MasterState {
  workers: Map<string, {
    lastHeartbeat: string;
    sessionCount: number;
  }>;
  events: WorkerEvent[];
  sessions: Map<string, any>; // workerId:sessionName -> session data
}

const state: MasterState = {
  workers: new Map(),
  events: [],
  sessions: new Map(),
};

function handleWorkerEvent(event: WorkerEvent): Response {
  // Store event
  state.events.push(event);

  // Update worker info
  if (event.type === "heartbeat") {
    state.workers.set(event.workerId, {
      lastHeartbeat: event.timestamp,
      sessionCount: event.data?.sessionCount || 0,
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

      case "claude_state_changed":
      case "git_changes":
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
  console.log(`[Master] State: http://localhost:${port}/api/state`);

  return server;
}
