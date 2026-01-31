import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { StateManager } from "../worker/state-manager";
import { unlinkSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { Session } from "../types";
import type { WorkerEvent } from "../worker/types";

const TEST_STATE_FILE = "/tmp/csm-test-worker-state.json";

describe("StateManager", () => {
  beforeEach(() => {
    // Clean up any existing state file
    if (existsSync(TEST_STATE_FILE)) {
      unlinkSync(TEST_STATE_FILE);
    }
  });

  afterEach(() => {
    if (existsSync(TEST_STATE_FILE)) {
      unlinkSync(TEST_STATE_FILE);
    }
  });

  test("initializes with empty state when file does not exist", () => {
    const manager = new StateManager(TEST_STATE_FILE, "test-worker");
    const state = manager.getState();

    expect(state.workerId).toBe("test-worker");
    expect(state.sessions.size).toBe(0);
    expect(state.eventQueue.length).toBe(0);
    expect(state.lastHeartbeat).toBeTruthy();
  });

  test("persists and loads state", () => {
    const manager1 = new StateManager(TEST_STATE_FILE, "test-worker");

    const session: Session = {
      name: "test-session",
      fullName: "csm-test-session",
      attached: false,
      windows: 1,
      created: new Date().toISOString(),
    };

    manager1.updateSession(session);

    // Create new manager instance to test loading
    const manager2 = new StateManager(TEST_STATE_FILE, "test-worker");
    const loadedSession = manager2.getSession("test-session");

    expect(loadedSession).toBeTruthy();
    expect(loadedSession?.name).toBe("test-session");
  });

  test("updates and retrieves sessions", () => {
    const manager = new StateManager(TEST_STATE_FILE, "test-worker");

    const session: Session = {
      name: "my-feature",
      fullName: "csm-my-feature",
      attached: true,
      windows: 2,
      created: new Date().toISOString(),
      worktreePath: "/tmp/worktree",
    };

    manager.updateSession(session);

    expect(manager.getSessions().length).toBe(1);
    expect(manager.getSession("my-feature")?.attached).toBe(true);

    // Update session
    session.attached = false;
    manager.updateSession(session);

    expect(manager.getSession("my-feature")?.attached).toBe(false);
  });

  test("removes sessions", () => {
    const manager = new StateManager(TEST_STATE_FILE, "test-worker");

    const session: Session = {
      name: "to-remove",
      fullName: "csm-to-remove",
      attached: false,
      windows: 1,
      created: new Date().toISOString(),
    };

    manager.updateSession(session);
    expect(manager.getSessions().length).toBe(1);

    manager.removeSession("to-remove");
    expect(manager.getSessions().length).toBe(0);
    expect(manager.getSession("to-remove")).toBeUndefined();
  });

  test("queues and dequeues events", () => {
    const manager = new StateManager(TEST_STATE_FILE, "test-worker");

    const event1: WorkerEvent = {
      type: "session_created",
      timestamp: new Date().toISOString(),
      workerId: "test-worker",
      sessionName: "test-1",
    };

    const event2: WorkerEvent = {
      type: "session_attached",
      timestamp: new Date().toISOString(),
      workerId: "test-worker",
      sessionName: "test-2",
    };

    manager.queueEvent(event1);
    manager.queueEvent(event2);

    expect(manager.getEventQueue().length).toBe(2);

    const dequeued1 = manager.dequeueEvent();
    expect(dequeued1?.type).toBe("session_created");
    expect(manager.getEventQueue().length).toBe(1);

    const dequeued2 = manager.dequeueEvent();
    expect(dequeued2?.type).toBe("session_attached");
    expect(manager.getEventQueue().length).toBe(0);
  });

  test("clears event queue", () => {
    const manager = new StateManager(TEST_STATE_FILE, "test-worker");

    const event: WorkerEvent = {
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      workerId: "test-worker",
    };

    manager.queueEvent(event);
    manager.queueEvent(event);
    expect(manager.getEventQueue().length).toBe(2);

    manager.clearEventQueue();
    expect(manager.getEventQueue().length).toBe(0);
  });

  test("updates heartbeat timestamp", () => {
    const manager = new StateManager(TEST_STATE_FILE, "test-worker");

    const before = manager.getState().lastHeartbeat;

    // Wait a bit to ensure timestamp difference
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    wait(10).then(() => {
      manager.updateHeartbeat();
      const after = manager.getState().lastHeartbeat;

      expect(after).not.toBe(before);
      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    });
  });

  test("handles corrupted state file gracefully", () => {
    // Write invalid JSON
    mkdirSync(join(TEST_STATE_FILE, ".."), { recursive: true });
    require("fs").writeFileSync(TEST_STATE_FILE, "invalid json{", "utf-8");

    // Should fall back to fresh state
    const manager = new StateManager(TEST_STATE_FILE, "test-worker");
    const state = manager.getState();

    expect(state.workerId).toBe("test-worker");
    expect(state.sessions.size).toBe(0);
  });
});
