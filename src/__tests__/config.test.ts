import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadConfig, getWorktreeBase } from "../lib/config";
import { homedir } from "os";
import { join } from "path";
import { mkdir, rm, writeFile } from "fs/promises";

const TEST_CONFIG_DIR = join(homedir(), ".config", "csm-test");
const TEST_CONFIG_FILE = join(TEST_CONFIG_DIR, "config.json");

describe("config utilities", () => {
  describe("loadConfig", () => {
    test("returns default config when no config file exists", async () => {
      const config = await loadConfig();

      expect(config.worktreeBase).toBe("/tmp/csm-worktrees");
      expect(config.hosts).toBeDefined();
    });

    test("config has expected structure", async () => {
      const config = await loadConfig();

      expect(typeof config.worktreeBase).toBe("string");
      expect(typeof config.hosts).toBe("object");
    });
  });

  describe("getWorktreeBase", () => {
    test("returns worktree base path", async () => {
      const base = await getWorktreeBase();
      expect(typeof base).toBe("string");
      expect(base.length).toBeGreaterThan(0);
    });
  });
});
