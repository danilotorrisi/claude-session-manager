import { describe, expect, test } from "bun:test";
import type {
  PMConfig,
  PMRuntimeState,
  PlanStep,
  PMPlan,
  EscalationMessage,
} from "../types";

describe("PM types", () => {
  test("PMConfig has required fields", () => {
    const config: PMConfig = {
      projectName: "test",
      repoPath: "/tmp/repo",
      developerIdleThresholdS: 120,
      maxDeveloperSessions: 5,
    };

    expect(config.projectName).toBe("test");
    expect(config.repoPath).toBe("/tmp/repo");
    expect(config.developerIdleThresholdS).toBe(120);
    expect(config.maxDeveloperSessions).toBe(5);
    expect(config.escalationUrl).toBeUndefined();
  });

  test("PMConfig accepts optional escalationUrl", () => {
    const config: PMConfig = {
      projectName: "test",
      repoPath: "/tmp/repo",
      developerIdleThresholdS: 120,
      maxDeveloperSessions: 5,
      escalationUrl: "https://example.com/hook",
    };

    expect(config.escalationUrl).toBe("https://example.com/hook");
  });

  test("PMRuntimeState with minimal fields", () => {
    const state: PMRuntimeState = {
      status: "running",
      activeSessions: [],
      escalations: [],
      startedAt: "2025-01-15T10:00:00.000Z",
    };

    expect(state.status).toBe("running");
    expect(state.currentPlan).toBeUndefined();
    expect(state.planningSession).toBeUndefined();
  });

  test("PMRuntimeState status values", () => {
    const running: PMRuntimeState = { status: "running", activeSessions: [], escalations: [], startedAt: "" };
    const stopped: PMRuntimeState = { status: "stopped", activeSessions: [], escalations: [], startedAt: "" };
    const error: PMRuntimeState = { status: "error", activeSessions: [], escalations: [], startedAt: "" };

    expect(running.status).toBe("running");
    expect(stopped.status).toBe("stopped");
    expect(error.status).toBe("error");
  });

  test("PlanStep status values", () => {
    const steps: PlanStep[] = [
      { id: "1", title: "Pending step", description: "...", status: "pending" },
      { id: "2", title: "In progress step", description: "...", status: "in_progress", sessionName: "dev-1" },
      { id: "3", title: "Completed step", description: "...", status: "completed", result: "Done" },
      { id: "4", title: "Failed step", description: "...", status: "failed", result: "Error: timeout" },
    ];

    expect(steps[0].status).toBe("pending");
    expect(steps[1].sessionName).toBe("dev-1");
    expect(steps[2].result).toBe("Done");
    expect(steps[3].status).toBe("failed");
  });

  test("PMPlan structure", () => {
    const plan: PMPlan = {
      id: "plan-1",
      goal: "Implement auth",
      steps: [
        { id: "s1", title: "Create login page", description: "...", status: "completed" },
        { id: "s2", title: "Add JWT", description: "...", status: "pending" },
      ],
      createdAt: "2025-01-15T10:00:00.000Z",
    };

    expect(plan.id).toBe("plan-1");
    expect(plan.steps).toHaveLength(2);
    expect(plan.completedAt).toBeUndefined();

    const completedPlan: PMPlan = {
      ...plan,
      completedAt: "2025-01-15T12:00:00.000Z",
    };
    expect(completedPlan.completedAt).toBe("2025-01-15T12:00:00.000Z");
  });

  test("EscalationMessage structure", () => {
    const escalation: EscalationMessage = {
      id: "esc-1",
      timestamp: "2025-01-15T10:30:00.000Z",
      severity: "warning",
      message: "Developer stuck",
      context: "Failed 3 attempts",
      awaitingResponse: true,
    };

    expect(escalation.severity).toBe("warning");
    expect(escalation.awaitingResponse).toBe(true);
    expect(escalation.response).toBeUndefined();
  });

  test("EscalationMessage severity values", () => {
    const info: EscalationMessage = {
      id: "1", timestamp: "", severity: "info", message: "", awaitingResponse: false,
    };
    const warning: EscalationMessage = {
      id: "2", timestamp: "", severity: "warning", message: "", awaitingResponse: false,
    };
    const critical: EscalationMessage = {
      id: "3", timestamp: "", severity: "critical", message: "", awaitingResponse: false,
    };

    expect(info.severity).toBe("info");
    expect(warning.severity).toBe("warning");
    expect(critical.severity).toBe("critical");
  });

  test("EscalationMessage with response", () => {
    const escalation: EscalationMessage = {
      id: "esc-1",
      timestamp: "2025-01-15T10:30:00.000Z",
      severity: "warning",
      message: "Need auth guidance",
      awaitingResponse: false,
      response: "Use OAuth with Google",
    };

    expect(escalation.awaitingResponse).toBe(false);
    expect(escalation.response).toBe("Use OAuth with Google");
  });
});
