import { StateManager } from "./state-manager";
import { MasterClient } from "./master-client";
import { listSessions } from "../lib/tmux";
import type { WorkerConfig, WorkerEvent } from "./types";
import type { Session } from "../types";

export class WorkerAgent {
  private config: WorkerConfig;
  private stateManager: StateManager;
  private masterClient: MasterClient;
  private pollTimer: Timer | null = null;
  private heartbeatTimer: Timer | null = null;
  private running = false;

  constructor(config: WorkerConfig) {
    this.config = config;
    this.stateManager = new StateManager(config.stateFile, config.workerId);
    this.masterClient = new MasterClient(config.masterUrl);
  }

  async start(): Promise<void> {
    if (this.running) {
      console.log("Worker agent already running");
      return;
    }

    this.running = true;
    console.log(`Worker agent started (ID: ${this.config.workerId})`);

    // Initial sync
    await this.pollSessions();

    // Start polling
    this.pollTimer = setInterval(
      () => this.pollSessions(),
      this.config.pollInterval
    );

    // Start heartbeat
    this.heartbeatTimer = setInterval(
      () => this.sendHeartbeat(),
      this.config.heartbeatInterval
    );

    // Process event queue
    await this.processEventQueue();
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    console.log("Worker agent stopped");
  }

  private async pollSessions(): Promise<void> {
    try {
      const sessions = await listSessions();
      const previousSessions = new Map(this.stateManager.getState().sessions);

      // Update state
      for (const session of sessions) {
        const previous = previousSessions.get(session.name);

        // New session
        if (!previous) {
          this.stateManager.updateSession(session);
          await this.pushEvent({
            type: "session_created",
            timestamp: new Date().toISOString(),
            workerId: this.config.workerId,
            sessionName: session.name,
            data: {
              worktreePath: session.worktreePath,
              projectName: session.projectName,
              linearIssue: session.linearIssue,
            },
          });
          continue;
        }

        // Check for changes
        if (previous.attached !== session.attached) {
          await this.pushEvent({
            type: session.attached ? "session_attached" : "session_detached",
            timestamp: new Date().toISOString(),
            workerId: this.config.workerId,
            sessionName: session.name,
          });
        }

        if (previous.claudeState !== session.claudeState) {
          await this.pushEvent({
            type: "claude_state_changed",
            timestamp: new Date().toISOString(),
            workerId: this.config.workerId,
            sessionName: session.name,
            data: {
              claudeState: session.claudeState,
              claudeLastMessage: session.claudeLastMessage,
            },
          });
        }

        if (
          JSON.stringify(previous.gitStats) !== JSON.stringify(session.gitStats)
        ) {
          await this.pushEvent({
            type: "git_changes",
            timestamp: new Date().toISOString(),
            workerId: this.config.workerId,
            sessionName: session.name,
            data: {
              gitStats: session.gitStats,
            },
          });
        }

        this.stateManager.updateSession(session);
        previousSessions.delete(session.name);
      }

      // Removed sessions
      for (const [name] of previousSessions) {
        this.stateManager.removeSession(name);
        await this.pushEvent({
          type: "session_killed",
          timestamp: new Date().toISOString(),
          workerId: this.config.workerId,
          sessionName: name,
        });
      }
    } catch (error) {
      console.error("Failed to poll sessions:", error);
    }
  }

  private async sendHeartbeat(): Promise<void> {
    this.stateManager.updateHeartbeat();

    await this.pushEvent({
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      workerId: this.config.workerId,
      data: {
        sessionCount: this.stateManager.getSessions().length,
      },
    });
  }

  private async pushEvent(event: WorkerEvent): Promise<void> {
    const success = await this.masterClient.pushEvent(event);

    if (!success) {
      // Queue for retry
      this.stateManager.queueEvent(event);
    }
  }

  private async processEventQueue(): Promise<void> {
    const queue = this.stateManager.getEventQueue();

    if (queue.length === 0) {
      return;
    }

    console.log(`Processing ${queue.length} queued events...`);

    for (const event of queue) {
      const success = await this.masterClient.pushEvent(event);
      if (success) {
        this.stateManager.dequeueEvent();
      } else {
        // Master still unavailable, stop processing
        break;
      }
    }
  }

  // Public API
  getSessions(): Session[] {
    return this.stateManager.getSessions();
  }

  getSession(name: string): Session | undefined {
    return this.stateManager.getSession(name);
  }

  async checkMasterAvailability(): Promise<boolean> {
    return this.masterClient.checkAvailability();
  }

  async forceSync(): Promise<boolean> {
    const sessions = this.getSessions();
    return this.masterClient.syncState(sessions);
  }
}
