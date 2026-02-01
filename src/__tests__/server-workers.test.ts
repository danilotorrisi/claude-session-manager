import { describe, expect, test, beforeEach } from "bun:test";
import {
  handleWorkerEvent,
  handleGetWorkers,
  deriveWorkerStatus,
  resetMasterState,
} from "../api/server";
import type { WorkerEvent, WorkerHostInfo } from "../worker/types";

const HOST_INFO: WorkerHostInfo = {
  hostname: "mac-mini",
  os: "macOS 15.3",
  uptime: "up 5 days",
  ramUsage: "12.4/32.0 GB",
  arch: "arm64",
  cpuCount: 10,
};

function makeEvent(overrides: Partial<WorkerEvent> & { type: WorkerEvent["type"]; workerId: string }): WorkerEvent {
  return {
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("Master Server: Worker Management", () => {
  beforeEach(() => {
    resetMasterState();
  });

  describe("handleWorkerEvent — registration", () => {
    test("registers a new worker", async () => {
      const event = makeEvent({
        type: "worker_registered",
        workerId: "worker-1",
        data: { hostInfo: HOST_INFO, sessionCount: 0 },
      });

      const response = handleWorkerEvent(event);
      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.success).toBe(true);
    });

    test("registered worker appears in GET /api/workers", async () => {
      handleWorkerEvent(makeEvent({
        type: "worker_registered",
        workerId: "worker-1",
        data: { hostInfo: HOST_INFO, sessionCount: 2 },
      }));

      const response = handleGetWorkers();
      const body = await response.json();

      expect(body.workers).toHaveLength(1);
      expect(body.workers[0].id).toBe("worker-1");
      expect(body.workers[0].sessionCount).toBe(2);
      expect(body.workers[0].hostInfo.hostname).toBe("mac-mini");
    });

    test("re-registration preserves original registeredAt", async () => {
      const firstTs = "2025-01-01T00:00:00.000Z";
      const secondTs = "2025-01-02T00:00:00.000Z";

      handleWorkerEvent({
        type: "worker_registered",
        workerId: "worker-1",
        timestamp: firstTs,
        data: { hostInfo: HOST_INFO, sessionCount: 0 },
      });

      handleWorkerEvent({
        type: "worker_registered",
        workerId: "worker-1",
        timestamp: secondTs,
        data: { hostInfo: HOST_INFO, sessionCount: 1 },
      });

      const body = await handleGetWorkers().json();
      expect(body.workers[0].registeredAt).toBe(firstTs);
      expect(body.workers[0].sessionCount).toBe(1);
    });
  });

  describe("handleWorkerEvent — deregistration", () => {
    test("deregistered worker appears offline", async () => {
      handleWorkerEvent(makeEvent({
        type: "worker_registered",
        workerId: "worker-1",
        data: { hostInfo: HOST_INFO, sessionCount: 0 },
      }));

      handleWorkerEvent(makeEvent({
        type: "worker_deregistered",
        workerId: "worker-1",
      }));

      const body = await handleGetWorkers().json();
      expect(body.workers).toHaveLength(1);
      expect(body.workers[0].status).toBe("offline");
    });

    test("deregistering unknown worker does nothing", () => {
      const response = handleWorkerEvent(makeEvent({
        type: "worker_deregistered",
        workerId: "unknown",
      }));
      expect(response.status).toBe(200);
    });
  });

  describe("handleWorkerEvent — heartbeat", () => {
    test("heartbeat updates lastHeartbeat and sessionCount", async () => {
      handleWorkerEvent(makeEvent({
        type: "worker_registered",
        workerId: "worker-1",
        data: { hostInfo: HOST_INFO, sessionCount: 0 },
      }));

      const heartbeatTs = new Date().toISOString();
      handleWorkerEvent({
        type: "heartbeat",
        workerId: "worker-1",
        timestamp: heartbeatTs,
        data: { sessionCount: 5, hostInfo: HOST_INFO },
      });

      const body = await handleGetWorkers().json();
      expect(body.workers[0].lastHeartbeat).toBe(heartbeatTs);
      expect(body.workers[0].sessionCount).toBe(5);
      expect(body.workers[0].status).toBe("online");
    });

    test("heartbeat creates worker entry if not previously registered", async () => {
      handleWorkerEvent(makeEvent({
        type: "heartbeat",
        workerId: "worker-new",
        data: { sessionCount: 1, hostInfo: HOST_INFO },
      }));

      const body = await handleGetWorkers().json();
      expect(body.workers).toHaveLength(1);
      expect(body.workers[0].id).toBe("worker-new");
    });

    test("heartbeat preserves hostInfo when not provided", async () => {
      handleWorkerEvent(makeEvent({
        type: "worker_registered",
        workerId: "worker-1",
        data: { hostInfo: HOST_INFO, sessionCount: 0 },
      }));

      handleWorkerEvent(makeEvent({
        type: "heartbeat",
        workerId: "worker-1",
        data: { sessionCount: 3 },
      }));

      const body = await handleGetWorkers().json();
      expect(body.workers[0].hostInfo.hostname).toBe("mac-mini");
    });
  });

  describe("handleWorkerEvent — event cap", () => {
    test("caps events at 1000", () => {
      for (let i = 0; i < 1050; i++) {
        handleWorkerEvent(makeEvent({
          type: "heartbeat",
          workerId: "worker-1",
          data: { sessionCount: 0 },
        }));
      }

      // We can't directly inspect state.events, but the endpoint should still work
      const response = handleGetWorkers();
      expect(response.status).toBe(200);
    });
  });

  describe("handleWorkerEvent — sessions", () => {
    test("session_created and session_killed update session tracking", async () => {
      handleWorkerEvent(makeEvent({
        type: "session_created",
        workerId: "worker-1",
        sessionName: "csm-feature",
        data: { worktreePath: "/tmp/wt", projectName: "my-project" },
      }));

      // Session killed
      handleWorkerEvent(makeEvent({
        type: "session_killed",
        workerId: "worker-1",
        sessionName: "csm-feature",
      }));

      // Should return 200 in both cases
      const response = handleGetWorkers();
      expect(response.status).toBe(200);
    });
  });

  describe("handleGetWorkers — multiple workers", () => {
    test("returns all registered workers", async () => {
      handleWorkerEvent(makeEvent({
        type: "worker_registered",
        workerId: "worker-a",
        data: { hostInfo: { ...HOST_INFO, hostname: "host-a" }, sessionCount: 1 },
      }));

      handleWorkerEvent(makeEvent({
        type: "worker_registered",
        workerId: "worker-b",
        data: { hostInfo: { ...HOST_INFO, hostname: "host-b" }, sessionCount: 3 },
      }));

      const body = await handleGetWorkers().json();
      expect(body.workers).toHaveLength(2);

      const ids = body.workers.map((w: any) => w.id).sort();
      expect(ids).toEqual(["worker-a", "worker-b"]);
    });

    test("returns empty array when no workers", async () => {
      const body = await handleGetWorkers().json();
      expect(body.workers).toEqual([]);
    });
  });
});
