import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { readPMState, writePMState, updatePMState, PM_STATE_FILE } from "../lib/pm-state";
import { unlinkSync, existsSync } from "fs";
import type { PMRuntimeState } from "../types";

describe("pm-state", () => {
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

  describe("readPMState", () => {
    test("returns default state when file does not exist", () => {
      const state = readPMState();

      expect(state.status).toBe("stopped");
      expect(state.activeSessions).toEqual([]);
      expect(state.escalations).toEqual([]);
      expect(state.startedAt).toBe("");
      expect(state.currentPlan).toBeUndefined();
    });

    test("reads persisted state", async () => {
      const written: PMRuntimeState = {
        status: "running",
        activeSessions: ["dev-1", "dev-2"],
        escalations: [],
        startedAt: "2025-01-15T10:00:00.000Z",
      };
      await Bun.write(PM_STATE_FILE, JSON.stringify(written));

      const state = readPMState();

      expect(state.status).toBe("running");
      expect(state.activeSessions).toEqual(["dev-1", "dev-2"]);
      expect(state.startedAt).toBe("2025-01-15T10:00:00.000Z");
    });

    test("returns default state for corrupted file", async () => {
      await Bun.write(PM_STATE_FILE, "not valid json{{{");

      const state = readPMState();
      expect(state.status).toBe("stopped");
    });

    test("reads state with plan", async () => {
      const written: PMRuntimeState = {
        status: "running",
        currentPlan: {
          id: "plan-1",
          goal: "Build login page",
          steps: [
            { id: "s1", title: "Create component", description: "...", status: "completed" },
            { id: "s2", title: "Add API", description: "...", status: "in_progress", sessionName: "dev-api" },
          ],
          createdAt: "2025-01-15T10:00:00.000Z",
        },
        activeSessions: ["dev-api"],
        escalations: [],
        startedAt: "2025-01-15T10:00:00.000Z",
      };
      await Bun.write(PM_STATE_FILE, JSON.stringify(written));

      const state = readPMState();

      expect(state.currentPlan).toBeDefined();
      expect(state.currentPlan!.goal).toBe("Build login page");
      expect(state.currentPlan!.steps).toHaveLength(2);
      expect(state.currentPlan!.steps[0].status).toBe("completed");
      expect(state.currentPlan!.steps[1].sessionName).toBe("dev-api");
    });

    test("reads state with escalations", async () => {
      const written: PMRuntimeState = {
        status: "running",
        activeSessions: [],
        escalations: [
          {
            id: "esc-1",
            timestamp: "2025-01-15T10:30:00.000Z",
            severity: "warning",
            message: "Auth config unclear",
            context: "Developer asked about OAuth setup",
            awaitingResponse: true,
          },
          {
            id: "esc-2",
            timestamp: "2025-01-15T10:35:00.000Z",
            severity: "info",
            message: "Task completed",
            awaitingResponse: false,
            response: "Acknowledged",
          },
        ],
        startedAt: "2025-01-15T10:00:00.000Z",
      };
      await Bun.write(PM_STATE_FILE, JSON.stringify(written));

      const state = readPMState();

      expect(state.escalations).toHaveLength(2);
      expect(state.escalations[0].awaitingResponse).toBe(true);
      expect(state.escalations[1].response).toBe("Acknowledged");
    });
  });

  describe("writePMState", () => {
    test("writes state to file", async () => {
      const state: PMRuntimeState = {
        status: "running",
        activeSessions: ["dev-1"],
        escalations: [],
        startedAt: "2025-01-15T10:00:00.000Z",
      };

      await writePMState(state);

      expect(existsSync(PM_STATE_FILE)).toBe(true);

      const raw = await Bun.file(PM_STATE_FILE).text();
      const parsed = JSON.parse(raw);
      expect(parsed.status).toBe("running");
      expect(parsed.activeSessions).toEqual(["dev-1"]);
    });

    test("overwrites existing state", async () => {
      await writePMState({
        status: "running",
        activeSessions: ["old"],
        escalations: [],
        startedAt: "2025-01-15T10:00:00.000Z",
      });

      await writePMState({
        status: "stopped",
        activeSessions: [],
        escalations: [],
        startedAt: "",
      });

      const state = readPMState();
      expect(state.status).toBe("stopped");
      expect(state.activeSessions).toEqual([]);
    });
  });

  describe("updatePMState", () => {
    test("partially updates state", async () => {
      await writePMState({
        status: "running",
        activeSessions: ["dev-1"],
        escalations: [],
        startedAt: "2025-01-15T10:00:00.000Z",
      });

      const updated = await updatePMState({
        activeSessions: ["dev-1", "dev-2"],
      });

      expect(updated.status).toBe("running"); // preserved
      expect(updated.activeSessions).toEqual(["dev-1", "dev-2"]); // updated
      expect(updated.startedAt).toBe("2025-01-15T10:00:00.000Z"); // preserved
    });

    test("partial update persists to file", async () => {
      await writePMState({
        status: "running",
        activeSessions: [],
        escalations: [],
        startedAt: "2025-01-15T10:00:00.000Z",
      });

      await updatePMState({ status: "error" });

      const reloaded = readPMState();
      expect(reloaded.status).toBe("error");
    });

    test("updates from default state when no file exists", async () => {
      const updated = await updatePMState({
        status: "running",
        startedAt: "2025-01-15T10:00:00.000Z",
      });

      expect(updated.status).toBe("running");
      expect(updated.activeSessions).toEqual([]); // from default
    });
  });
});
