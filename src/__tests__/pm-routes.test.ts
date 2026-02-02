import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { handlePMStatus } from "../api/pm-routes";
import { writePMState, PM_STATE_FILE } from "../lib/pm-state";
import { unlinkSync, existsSync } from "fs";

describe("pm-routes", () => {
  beforeEach(() => {
    if (existsSync(PM_STATE_FILE)) {
      unlinkSync(PM_STATE_FILE);
    }
  });

  afterEach(() => {
    if (existsSync(PM_STATE_FILE)) {
      unlinkSync(PM_STATE_FILE);
    }
  });

  describe("handlePMStatus", () => {
    test("returns default state when PM not running", async () => {
      const response = handlePMStatus();

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.pm).toBeDefined();
      expect(body.pm.status).toBe("stopped");
      expect(body.sessions).toBeDefined();
    });

    test("returns running state with sessions", async () => {
      await writePMState({
        status: "running",
        activeSessions: ["feature-1", "bugfix-2"],
        escalations: [],
        startedAt: "2025-01-15T10:00:00.000Z",
      });

      const response = handlePMStatus();
      const body = await response.json();

      expect(body.pm.status).toBe("running");
      expect(body.pm.activeSessions).toEqual(["feature-1", "bugfix-2"]);
      expect(body.pm.startedAt).toBe("2025-01-15T10:00:00.000Z");
    });

    test("returns state with plan progress", async () => {
      await writePMState({
        status: "running",
        currentPlan: {
          id: "plan-1",
          goal: "Build feature X",
          steps: [
            { id: "s1", title: "Step 1", description: "...", status: "completed" },
            { id: "s2", title: "Step 2", description: "...", status: "in_progress" },
          ],
          createdAt: "2025-01-15T10:00:00.000Z",
        },
        activeSessions: [],
        escalations: [],
        startedAt: "2025-01-15T10:00:00.000Z",
      });

      const response = handlePMStatus();
      const body = await response.json();

      expect(body.pm.currentPlan).toBeDefined();
      expect(body.pm.currentPlan.goal).toBe("Build feature X");
      expect(body.pm.currentPlan.steps).toHaveLength(2);
    });

    test("returns state with pending escalations", async () => {
      await writePMState({
        status: "running",
        activeSessions: [],
        escalations: [
          {
            id: "esc-1",
            timestamp: "2025-01-15T10:30:00.000Z",
            severity: "critical",
            message: "Production access needed",
            awaitingResponse: true,
          },
        ],
        startedAt: "2025-01-15T10:00:00.000Z",
      });

      const response = handlePMStatus();
      const body = await response.json();

      expect(body.pm.escalations).toHaveLength(1);
      expect(body.pm.escalations[0].severity).toBe("critical");
      expect(body.pm.escalations[0].awaitingResponse).toBe(true);
    });

    test("response has correct Content-Type header", () => {
      const response = handlePMStatus();
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    test("sessions object is present even when empty", async () => {
      const response = handlePMStatus();
      const body = await response.json();

      expect(body.sessions).toBeDefined();
      expect(typeof body.sessions).toBe("object");
    });
  });
});
