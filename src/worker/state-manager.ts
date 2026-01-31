import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname } from "path";
import type { WorkerState, WorkerEvent } from "./types";
import type { Session } from "../types";

export class StateManager {
  private stateFile: string;
  private state: WorkerState;

  constructor(stateFile: string, workerId: string) {
    this.stateFile = stateFile;
    this.state = this.loadState(workerId);
  }

  private loadState(workerId: string): WorkerState {
    if (existsSync(this.stateFile)) {
      try {
        const data = JSON.parse(readFileSync(this.stateFile, "utf-8"));
        return {
          ...data,
          sessions: new Map(Object.entries(data.sessions || {})),
          eventQueue: data.eventQueue || [],
        };
      } catch (error) {
        console.error("Failed to load state, starting fresh:", error);
      }
    }

    return {
      workerId,
      sessions: new Map(),
      lastHeartbeat: new Date().toISOString(),
      eventQueue: [],
    };
  }

  private saveState(): void {
    const dir = dirname(this.stateFile);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = {
      ...this.state,
      sessions: Object.fromEntries(this.state.sessions),
    };

    writeFileSync(this.stateFile, JSON.stringify(data, null, 2), "utf-8");
  }

  getState(): WorkerState {
    return this.state;
  }

  getSessions(): Session[] {
    return Array.from(this.state.sessions.values());
  }

  getSession(name: string): Session | undefined {
    return this.state.sessions.get(name);
  }

  updateSession(session: Session): void {
    this.state.sessions.set(session.name, session);
    this.saveState();
  }

  removeSession(name: string): void {
    this.state.sessions.delete(name);
    this.saveState();
  }

  queueEvent(event: WorkerEvent): void {
    this.state.eventQueue.push(event);
    this.saveState();
  }

  dequeueEvent(): WorkerEvent | undefined {
    const event = this.state.eventQueue.shift();
    if (event) {
      this.saveState();
    }
    return event;
  }

  getEventQueue(): WorkerEvent[] {
    return this.state.eventQueue;
  }

  clearEventQueue(): void {
    this.state.eventQueue = [];
    this.saveState();
  }

  updateHeartbeat(): void {
    this.state.lastHeartbeat = new Date().toISOString();
    this.saveState();
  }
}
