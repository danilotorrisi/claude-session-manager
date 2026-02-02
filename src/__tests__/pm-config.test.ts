import { describe, expect, test } from "bun:test";
import { loadPMConfig } from "../lib/config";

describe("loadPMConfig", () => {
  test("returns defaults when no config or overrides", async () => {
    const config = await loadPMConfig();

    expect(config.projectName).toBe("default");
    expect(config.developerIdleThresholdS).toBe(120);
    expect(config.maxDeveloperSessions).toBe(5);
    expect(config.escalationUrl).toBeUndefined();
  });

  test("overrides take precedence", async () => {
    const config = await loadPMConfig({
      projectName: "my-project",
      repoPath: "/tmp/test-repo",
      developerIdleThresholdS: 60,
      maxDeveloperSessions: 10,
      escalationUrl: "https://example.com/hook",
    });

    expect(config.projectName).toBe("my-project");
    expect(config.repoPath).toBe("/tmp/test-repo");
    expect(config.developerIdleThresholdS).toBe(60);
    expect(config.maxDeveloperSessions).toBe(10);
    expect(config.escalationUrl).toBe("https://example.com/hook");
  });

  test("partial overrides merge with defaults", async () => {
    const config = await loadPMConfig({
      projectName: "custom",
    });

    expect(config.projectName).toBe("custom");
    expect(config.developerIdleThresholdS).toBe(120); // default
    expect(config.maxDeveloperSessions).toBe(5); // default
  });

  test("repoPath falls back to empty string when no default", async () => {
    const config = await loadPMConfig({});

    // repoPath defaults to config.defaultRepo or ""
    expect(typeof config.repoPath).toBe("string");
  });
});
