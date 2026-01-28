import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { $ } from "bun";
import {
  loadConfig,
  saveConfig,
  ensureConfigDir,
  getHost,
  getDefaultRepo,
  getWorktreeBase,
  CONFIG_DIR,
} from "../lib/config";

describe("config full coverage", () => {
  const BACKUP_CONFIG = "/tmp/csm-config-backup.json";

  beforeEach(async () => {
    // Backup existing config
    try {
      await $`cp ~/.config/csm/config.json ${BACKUP_CONFIG} 2>/dev/null`.quiet();
    } catch {}
  });

  afterEach(async () => {
    // Restore config
    try {
      await $`cp ${BACKUP_CONFIG} ~/.config/csm/config.json 2>/dev/null`.quiet();
    } catch {
      // If backup doesn't exist, remove test config
      try {
        await $`rm ~/.config/csm/config.json 2>/dev/null`.quiet();
      } catch {}
    }
  });

  describe("ensureConfigDir", () => {
    test("creates config directory if not exists", async () => {
      await ensureConfigDir();
      const exists = await $`test -d ${CONFIG_DIR} && echo yes || echo no`.text();
      expect(exists.trim()).toBe("yes");
    });
  });

  describe("saveConfig", () => {
    test("saves config to file", async () => {
      await ensureConfigDir();

      const config = {
        defaultRepo: "/test/repo",
        worktreeBase: "/test/worktrees",
        hosts: {
          testhost: {
            host: "user@test.com",
            defaultRepo: "/remote/repo",
          },
        },
      };

      await saveConfig(config);

      const loaded = await loadConfig();
      expect(loaded.defaultRepo).toBe("/test/repo");
      expect(loaded.worktreeBase).toBe("/test/worktrees");
      expect(loaded.hosts.testhost.host).toBe("user@test.com");
    });
  });

  describe("getHost", () => {
    test("returns null for non-existent host", async () => {
      const host = await getHost("nonexistent-host-xyz");
      expect(host).toBeNull();
    });

    test("returns host config for existing host", async () => {
      await ensureConfigDir();
      await saveConfig({
        worktreeBase: "/tmp/csm-worktrees",
        hosts: {
          myhost: {
            host: "user@server.com",
            defaultRepo: "/home/user/project",
          },
        },
      });

      const host = await getHost("myhost");
      expect(host).not.toBeNull();
      expect(host!.host).toBe("user@server.com");
      expect(host!.defaultRepo).toBe("/home/user/project");
    });
  });

  describe("getDefaultRepo", () => {
    test("returns undefined when no default configured", async () => {
      await ensureConfigDir();
      await saveConfig({
        worktreeBase: "/tmp/csm-worktrees",
        hosts: {},
      });

      const repo = await getDefaultRepo();
      expect(repo).toBeUndefined();
    });

    test("returns global default repo", async () => {
      await ensureConfigDir();
      await saveConfig({
        defaultRepo: "/global/repo",
        worktreeBase: "/tmp/csm-worktrees",
        hosts: {},
      });

      const repo = await getDefaultRepo();
      expect(repo).toBe("/global/repo");
    });

    test("returns host-specific default repo when host specified", async () => {
      await ensureConfigDir();
      await saveConfig({
        defaultRepo: "/global/repo",
        worktreeBase: "/tmp/csm-worktrees",
        hosts: {
          myhost: {
            host: "user@server.com",
            defaultRepo: "/host/specific/repo",
          },
        },
      });

      const repo = await getDefaultRepo("myhost");
      expect(repo).toBe("/host/specific/repo");
    });

    test("falls back to global default when host has no default", async () => {
      await ensureConfigDir();
      await saveConfig({
        defaultRepo: "/global/repo",
        worktreeBase: "/tmp/csm-worktrees",
        hosts: {
          myhost: {
            host: "user@server.com",
          },
        },
      });

      const repo = await getDefaultRepo("myhost");
      expect(repo).toBe("/global/repo");
    });
  });

  describe("getWorktreeBase", () => {
    test("returns configured worktree base", async () => {
      await ensureConfigDir();
      await saveConfig({
        worktreeBase: "/custom/worktrees",
        hosts: {},
      });

      const base = await getWorktreeBase();
      expect(base).toBe("/custom/worktrees");
    });
  });
});
