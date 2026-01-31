import { describe, expect, test, beforeEach } from "bun:test";
import { MasterClient } from "../worker/master-client";
import type { WorkerEvent } from "../worker/types";

// Mock server for testing
class MockServer {
  private responses: Map<string, { status: number; body?: any }> = new Map();

  setResponse(endpoint: string, status: number, body?: any) {
    this.responses.set(endpoint, { status, body });
  }

  async handle(endpoint: string): Promise<Response> {
    const response = this.responses.get(endpoint);
    if (!response) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }

    return new Response(JSON.stringify(response.body || {}), {
      status: response.status,
    });
  }
}

describe("MasterClient", () => {
  test("isEnabled returns true when masterUrl is provided", () => {
    const client = new MasterClient("http://localhost:3000");
    expect(client.isEnabled()).toBe(true);
  });

  test("isEnabled returns false when masterUrl is not provided", () => {
    const client = new MasterClient();
    expect(client.isEnabled()).toBe(false);
  });

  test("pushEvent returns false when disabled", async () => {
    const client = new MasterClient();

    const event: WorkerEvent = {
      type: "heartbeat",
      timestamp: new Date().toISOString(),
      workerId: "test",
    };

    const result = await client.pushEvent(event);
    expect(result).toBe(false);
  });

  test("checkAvailability returns false when disabled", async () => {
    const client = new MasterClient();
    const result = await client.checkAvailability();
    expect(result).toBe(false);
  });

  test("syncState returns false when disabled", async () => {
    const client = new MasterClient();
    const result = await client.syncState([]);
    expect(result).toBe(false);
  });

  // Note: Real HTTP tests would require a mock server or integration test
  // These tests verify the client handles disabled state correctly
});
