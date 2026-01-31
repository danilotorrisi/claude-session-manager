import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { WorkerAgent } from "../worker/worker-agent";
import { unlinkSync, existsSync } from "fs";
import type { WorkerConfig } from "../worker/types";

const TEST_STATE_FILE = "/tmp/csm-test-worker-agent-state.json";

describe("WorkerAgent", () => {
  let agent: WorkerAgent;

  beforeEach(() => {
    if (existsSync(TEST_STATE_FILE)) {
      unlinkSync(TEST_STATE_FILE);
    }

    const config: WorkerConfig = {
      workerId: "test-worker",
      stateFile: TEST_STATE_FILE,
      pollInterval: 100, // Fast for testing
      heartbeatInterval: 200,
    };

    agent = new WorkerAgent(config);
  });

  afterEach(async () => {
    await agent.stop();

    if (existsSync(TEST_STATE_FILE)) {
      unlinkSync(TEST_STATE_FILE);
    }
  });

  test("initializes with correct config", () => {
    expect(agent).toBeTruthy();
    expect(agent.getSessions()).toEqual([]);
  });

  test("getSessions returns empty array initially", () => {
    const sessions = agent.getSessions();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBe(0);
  });

  test("getSession returns undefined for non-existent session", () => {
    const session = agent.getSession("non-existent");
    expect(session).toBeUndefined();
  });

  test("checkMasterAvailability returns false when no master configured", async () => {
    const available = await agent.checkMasterAvailability();
    expect(available).toBe(false);
  });

  test("forceSync returns false when no master configured", async () => {
    const result = await agent.forceSync();
    expect(result).toBe(false);
  });

  test("start and stop without errors", async () => {
    await expect(agent.start()).resolves.toBeUndefined();
    await expect(agent.stop()).resolves.toBeUndefined();
  });

  test("calling start twice logs warning", async () => {
    await agent.start();

    // Capture console output
    const originalLog = console.log;
    let loggedMessage = "";
    console.log = (msg: string) => {
      loggedMessage = msg;
    };

    await agent.start();

    console.log = originalLog;
    expect(loggedMessage).toContain("already running");

    await agent.stop();
  });
});
