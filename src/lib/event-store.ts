/**
 * Persistent event store for session logs.
 * Stores events as JSONL files: ~/.config/csm/events/<session-name>.jsonl
 * Append-only for fast writes; read on SSE connect for replay.
 */

import { join } from "path";
import { appendFile, mkdir, readFile, unlink } from "fs/promises";
import { existsSync } from "fs";
import { CONFIG_DIR } from "./config";

const EVENTS_DIR = join(CONFIG_DIR, "events");
const MAX_EVENTS_PER_SESSION = 500;

let dirReady = false;

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(EVENTS_DIR, { recursive: true });
  dirReady = true;
}

function eventFile(sessionName: string): string {
  // Sanitize session name for filesystem
  const safe = sessionName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(EVENTS_DIR, `${safe}.jsonl`);
}

export interface StoredEvent {
  timestamp: number;
  event: Record<string, unknown>;
}

/** Append an event to the session's JSONL file. */
export async function persistEvent(
  sessionName: string,
  event: Record<string, unknown>
): Promise<void> {
  try {
    await ensureDir();
    const entry: StoredEvent = { timestamp: Date.now(), event };
    await appendFile(eventFile(sessionName), JSON.stringify(entry) + "\n");
  } catch {
    // Non-fatal — don't break the server if disk write fails
  }
}

/** Load all persisted events for a session. Returns newest last. */
export async function loadEvents(sessionName: string): Promise<StoredEvent[]> {
  try {
    const path = eventFile(sessionName);
    if (!existsSync(path)) return [];
    const raw = await readFile(path, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    const events: StoredEvent[] = [];
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        // Skip malformed lines
      }
    }
    // If file has grown too large, truncate to last MAX_EVENTS
    if (events.length > MAX_EVENTS_PER_SESSION * 1.5) {
      const trimmed = events.slice(-MAX_EVENTS_PER_SESSION);
      await truncateEvents(sessionName, trimmed);
      return trimmed;
    }
    return events;
  } catch {
    return [];
  }
}

/** Rewrite the event file with only the given events (compaction). */
async function truncateEvents(
  sessionName: string,
  events: StoredEvent[]
): Promise<void> {
  try {
    await ensureDir();
    const content = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await Bun.write(eventFile(sessionName), content);
  } catch {
    // Non-fatal
  }
}

/** Delete all persisted events for a session. */
export async function clearEvents(sessionName: string): Promise<void> {
  try {
    const path = eventFile(sessionName);
    if (existsSync(path)) {
      await unlink(path);
    }
  } catch {
    // Non-fatal
  }
}
