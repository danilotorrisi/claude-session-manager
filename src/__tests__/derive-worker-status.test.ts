import { describe, expect, test } from "bun:test";
import { deriveWorkerStatus } from "../api/server";

describe("deriveWorkerStatus", () => {
  test("returns 'offline' for empty string", () => {
    expect(deriveWorkerStatus("")).toBe("offline");
  });

  test("returns 'online' for recent heartbeat (< 60s)", () => {
    const recent = new Date(Date.now() - 10_000).toISOString(); // 10s ago
    expect(deriveWorkerStatus(recent)).toBe("online");
  });

  test("returns 'online' for heartbeat just now", () => {
    expect(deriveWorkerStatus(new Date().toISOString())).toBe("online");
  });

  test("returns 'stale' for heartbeat between 60s and 120s", () => {
    const stale = new Date(Date.now() - 90_000).toISOString(); // 90s ago
    expect(deriveWorkerStatus(stale)).toBe("stale");
  });

  test("returns 'stale' at exactly 60s boundary", () => {
    const boundary = new Date(Date.now() - 60_000).toISOString();
    expect(deriveWorkerStatus(boundary)).toBe("stale");
  });

  test("returns 'offline' for heartbeat older than 120s", () => {
    const old = new Date(Date.now() - 180_000).toISOString(); // 3 min ago
    expect(deriveWorkerStatus(old)).toBe("offline");
  });

  test("returns 'offline' at exactly 120s boundary", () => {
    const boundary = new Date(Date.now() - 120_000).toISOString();
    expect(deriveWorkerStatus(boundary)).toBe("offline");
  });

  test("returns 'online' for future timestamp (clock skew)", () => {
    const future = new Date(Date.now() + 30_000).toISOString();
    expect(deriveWorkerStatus(future)).toBe("online");
  });
});
