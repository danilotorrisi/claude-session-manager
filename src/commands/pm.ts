/**
 * CLI commands for the PM system: start, stop, status.
 *
 * ## Usage
 *
 *   csm pm start [--project <name>] [--repo <path>]
 *     Starts the PM session + session monitor daemon. The process stays alive
 *     (like `csm worker start`) and handles SIGINT/SIGTERM for graceful shutdown.
 *
 *   csm pm stop
 *     Sends /exit to PM Claude, kills the tmux session, updates state.
 *     Safe to call even if PM is not running (prints "PM session is not running.").
 *
 *   csm pm status
 *     Shows PM state: running/stopped, plan progress (if any), active sessions,
 *     and pending escalations. Reads from /tmp/csm-pm-state.json + tmux.
 *
 * ## Manual testing
 *
 *   # Basic lifecycle
 *   csm pm start --project test --repo ~/my-repo
 *   csm pm status          # should show "running"
 *   csm pm stop
 *   csm pm status          # should show "stopped"
 *
 *   # Status with plan progress (write a test state first):
 *   bun -e 'import{writePMState}from"./src/lib/pm-state";await writePMState({status:"running",currentPlan:{id:"p1",goal:"Build login",steps:[{id:"s1",title:"UI component",description:"...",status:"completed"},{id:"s2",title:"API endpoint",description:"...",status:"in_progress",sessionName:"login-api"},{id:"s3",title:"Tests",description:"...",status:"pending"}],createdAt:new Date().toISOString()},activeSessions:["login-api"],escalations:[{id:"e1",timestamp:new Date().toISOString(),severity:"warning",message:"Auth config unclear",awaitingResponse:true}],startedAt:new Date().toISOString()})'
 *   csm pm status
 *   # Expected:
 *   #   === PM Status ===
 *   #   Session: stopped           (tmux not running in this test)
 *   #   State: running
 *   #   Plan: Build login
 *   #   Progress: 1/3 steps completed, 1 in progress
 *   #     [x] UI component
 *   #     [~] API endpoint (login-api)
 *   #     [ ] Tests
 *   #   Active sessions: login-api
 *   #   Pending escalations: 1
 *   #     [warning] Auth config unclear
 *   rm -f /tmp/csm-pm-state.json
 */

import { loadPMConfig } from "../lib/config";
import { startPMSession, stopPMSession, PM_SESSION_NAME } from "../lib/pm-session";
import { readPMState } from "../lib/pm-state";
import { sessionExists } from "../lib/tmux";
import { startSessionMonitor } from "../lib/session-monitor";
import { startSessionPM, sessionPMExists } from "../lib/session-pm";
import { getWorktreePath, loadSessionMetadata } from "../lib/worktree";
import { exec } from "../lib/ssh";

export async function pmStart(options: { project?: string; repo?: string }): Promise<void> {
  const config = await loadPMConfig({
    projectName: options.project,
    repoPath: options.repo,
  });

  console.log("Starting PM session...");
  console.log(`Project: ${config.projectName}`);
  console.log(`Repo: ${config.repoPath}`);
  console.log();

  await startPMSession(config);

  // Start the session monitor daemon in the same process
  console.log("Starting session monitor daemon...");
  const monitor = startSessionMonitor(config);

  // Graceful shutdown
  let running = true;

  const shutdown = async (signal: string) => {
    if (!running) return;
    running = false;
    console.log(`\nReceived ${signal}, shutting down PM...`);
    monitor.stop();
    await stopPMSession();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Keep process alive
  await new Promise<void>((resolve) => {
    const check = setInterval(() => {
      if (!running) {
        clearInterval(check);
        resolve();
      }
    }, 1000);
  });
}

export async function pmStop(): Promise<void> {
  await stopPMSession();
}

export async function pmStatus(): Promise<void> {
  const isRunning = await sessionExists(PM_SESSION_NAME);
  const state = readPMState();

  console.log("=== PM Status ===");
  console.log(`Session: ${isRunning ? "running" : "stopped"}`);
  console.log(`State: ${state.status}`);

  if (state.startedAt) {
    console.log(`Started: ${state.startedAt}`);
  }

  if (state.currentPlan) {
    console.log();
    console.log(`Plan: ${state.currentPlan.goal}`);
    const total = state.currentPlan.steps.length;
    const completed = state.currentPlan.steps.filter((s) => s.status === "completed").length;
    const inProgress = state.currentPlan.steps.filter((s) => s.status === "in_progress").length;
    console.log(`Progress: ${completed}/${total} steps completed, ${inProgress} in progress`);
    for (const step of state.currentPlan.steps) {
      const icon =
        step.status === "completed"
          ? "[x]"
          : step.status === "in_progress"
            ? "[~]"
            : step.status === "failed"
              ? "[!]"
              : "[ ]";
      const session = step.sessionName ? ` (${step.sessionName})` : "";
      console.log(`  ${icon} ${step.title}${session}`);
    }
  }

  if (state.activeSessions.length > 0) {
    console.log();
    console.log(`Active sessions: ${state.activeSessions.join(", ")}`);
  }

  if (state.escalations.length > 0) {
    const pending = state.escalations.filter((e) => e.awaitingResponse);
    if (pending.length > 0) {
      console.log();
      console.log(`Pending escalations: ${pending.length}`);
      for (const esc of pending) {
        console.log(`  [${esc.severity}] ${esc.message}`);
      }
    }
  }
}

export async function pmAddToSession(sessionName: string | undefined): Promise<void> {
  if (!sessionName) {
    console.error("Error: Session name required");
    console.error("Usage: csm pm add-to-session <name>");
    process.exit(1);
  }

  // Check session exists
  if (!(await sessionExists(sessionName))) {
    console.error(`Error: Session '${sessionName}' does not exist`);
    process.exit(1);
  }

  // Check PM window doesn't already exist
  if (await sessionPMExists(sessionName)) {
    console.error(`Error: Session '${sessionName}' already has a PM window`);
    process.exit(1);
  }

  // Load session metadata for context
  const worktreePath = await getWorktreePath(sessionName);
  const metadata = await loadSessionMetadata(sessionName);

  // Get git branch
  const branchResult = await exec(`git -C "${worktreePath}" branch --show-current 2>/dev/null`);
  const gitBranch = branchResult.success ? branchResult.stdout.trim() : undefined;

  console.log(`Adding PM to session '${sessionName}'...`);

  await startSessionPM(sessionName, worktreePath, {
    projectName: metadata?.projectName,
    repoPath: metadata?.repoPath,
    linearIssue: metadata?.linearIssue?.identifier,
    gitBranch,
  });

  console.log(`PM added to session '${sessionName}' (window :pm)`);
}

export async function pmAttach(sessionName: string | undefined): Promise<void> {
  if (!sessionName) {
    console.error("Error: Session name required");
    console.error("Usage: csm pm attach <name>");
    process.exit(1);
  }

  // Check session exists
  if (!(await sessionExists(sessionName))) {
    console.error(`Error: Session '${sessionName}' does not exist`);
    process.exit(1);
  }

  // Check PM window exists
  if (!(await sessionPMExists(sessionName))) {
    console.error(`Error: Session '${sessionName}' does not have a PM window`);
    console.error("Add one with: csm pm add-to-session " + sessionName);
    process.exit(1);
  }

  // Attach to the PM window using execSync with stdio inheritance
  const fullSessionName = `csm-${sessionName}`;
  const { execSync } = await import("child_process");
  
  try {
    execSync(`tmux attach-session -t ${fullSessionName}:pm`, {
      stdio: "inherit",
    });
  } catch (error) {
    console.error(`Error: Failed to attach to PM window`);
    process.exit(1);
  }
}
