import { describe, expect, test } from "bun:test";
import { generateWorkerId } from "../commands/worker";

describe("generateWorkerId", () => {
  test("returns a non-empty string", () => {
    const id = generateWorkerId();
    expect(id.length).toBeGreaterThan(0);
  });

  test("returns lowercase", () => {
    const id = generateWorkerId();
    expect(id).toBe(id.toLowerCase());
  });

  test("contains only valid characters (a-z, 0-9, dash)", () => {
    const id = generateWorkerId();
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  test("does not end with .local suffix", () => {
    const id = generateWorkerId();
    expect(id).not.toContain(".local");
  });
});
