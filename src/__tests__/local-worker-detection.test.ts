import { describe, expect, test } from "bun:test";
import { normalizeHostname, isLocalWorker } from "../tui/hooks/useWorkers";

describe("normalizeHostname", () => {
  test("strips .local suffix", () => {
    expect(normalizeHostname("Mac-Mini.local")).toBe("mac-mini");
  });

  test("lowercases the hostname", () => {
    expect(normalizeHostname("MacBook-Pro")).toBe("macbook-pro");
  });

  test("strips .local and lowercases", () => {
    expect(normalizeHostname("MyHost.local")).toBe("myhost");
  });

  test("handles already-normalized hostname", () => {
    expect(normalizeHostname("ubuntu-server")).toBe("ubuntu-server");
  });

  test("handles empty string", () => {
    expect(normalizeHostname("")).toBe("");
  });

  test("does not strip .local from middle of hostname", () => {
    expect(normalizeHostname("my.local.host")).toBe("my.local.host");
  });

  test("only strips trailing .local", () => {
    expect(normalizeHostname("local")).toBe("local");
  });
});

describe("isLocalWorker", () => {
  test("returns true for matching hostnames", () => {
    expect(isLocalWorker("MacBook-Pro", "MacBook-Pro")).toBe(true);
  });

  test("returns true when worker has .local suffix and TUI does not", () => {
    expect(isLocalWorker("MacBook-Pro.local", "MacBook-Pro")).toBe(true);
  });

  test("returns true when TUI has .local suffix and worker does not", () => {
    expect(isLocalWorker("MacBook-Pro", "MacBook-Pro.local")).toBe(true);
  });

  test("returns true with case differences", () => {
    expect(isLocalWorker("macbook-pro", "MacBook-Pro")).toBe(true);
  });

  test("returns false for different hostnames", () => {
    expect(isLocalWorker("Mac-Mini", "MacBook-Pro")).toBe(false);
  });

  test("returns false when workerHostname is undefined", () => {
    expect(isLocalWorker(undefined, "MacBook-Pro")).toBe(false);
  });

  test("returns false when workerHostname is empty string", () => {
    expect(isLocalWorker("", "MacBook-Pro")).toBe(false);
  });

  test("handles both having .local suffix", () => {
    expect(isLocalWorker("Mac-Mini.local", "Mac-Mini.local")).toBe(true);
  });
});
