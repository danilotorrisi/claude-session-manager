import { describe, expect, test } from "bun:test";
import { execLocal } from "../lib/ssh";

describe("ssh utilities", () => {
  describe("execLocal", () => {
    test("executes simple command", async () => {
      const result = await execLocal("echo hello");
      expect(result.success).toBe(true);
      expect(result.stdout).toBe("hello");
      expect(result.exitCode).toBe(0);
    });

    test("captures stderr", async () => {
      const result = await execLocal("echo error >&2");
      expect(result.stderr).toBe("error");
    });

    test("reports failure for invalid command", async () => {
      const result = await execLocal("nonexistent_command_xyz 2>/dev/null");
      expect(result.success).toBe(false);
      expect(result.exitCode).not.toBe(0);
    });

    test("handles commands with special characters", async () => {
      const result = await execLocal('echo "hello world"');
      expect(result.success).toBe(true);
      expect(result.stdout).toBe("hello world");
    });

    test("handles multiline output", async () => {
      const result = await execLocal('echo -e "line1\\nline2"');
      expect(result.success).toBe(true);
      expect(result.stdout).toContain("line1");
      expect(result.stdout).toContain("line2");
    });

    test("handles empty output", async () => {
      const result = await execLocal("true");
      expect(result.success).toBe(true);
      expect(result.stdout).toBe("");
    });
  });
});
