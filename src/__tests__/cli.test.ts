import { describe, expect, test } from "bun:test";

// Test the argument parsing logic (extracted for testing)
function parseArgs(args: string[]): {
  command: string;
  name?: string;
  options: Record<string, string | boolean>;
} {
  const command = args[0] || "help";
  const options: Record<string, string | boolean> = {};
  let name: string | undefined;

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (!nextArg || nextArg.startsWith("--")) {
        options[key] = true;
        i++;
      } else {
        options[key] = nextArg;
        i += 2;
      }
    } else if (!name) {
      name = arg;
      i++;
    } else {
      i++;
    }
  }

  return { command, name, options };
}

describe("CLI argument parsing", () => {
  describe("parseArgs", () => {
    test("parses command only", () => {
      const result = parseArgs(["list"]);
      expect(result.command).toBe("list");
      expect(result.name).toBeUndefined();
      expect(result.options).toEqual({});
    });

    test("parses command with name", () => {
      const result = parseArgs(["create", "my-session"]);
      expect(result.command).toBe("create");
      expect(result.name).toBe("my-session");
    });

    test("parses --repo option with value", () => {
      const result = parseArgs(["create", "my-session", "--repo", "/path/to/repo"]);
      expect(result.command).toBe("create");
      expect(result.name).toBe("my-session");
      expect(result.options.repo).toBe("/path/to/repo");
    });

    test("parses --host option with value", () => {
      const result = parseArgs(["list", "--host", "dev-server"]);
      expect(result.command).toBe("list");
      expect(result.options.host).toBe("dev-server");
    });

    test("parses boolean flag --delete-branch", () => {
      const result = parseArgs(["kill", "my-session", "--delete-branch"]);
      expect(result.command).toBe("kill");
      expect(result.name).toBe("my-session");
      expect(result.options["delete-branch"]).toBe(true);
    });

    test("parses multiple options", () => {
      const result = parseArgs([
        "create",
        "my-session",
        "--repo",
        "/path/to/repo",
        "--host",
        "dev-server",
      ]);
      expect(result.command).toBe("create");
      expect(result.name).toBe("my-session");
      expect(result.options.repo).toBe("/path/to/repo");
      expect(result.options.host).toBe("dev-server");
    });

    test("defaults to help command when no args", () => {
      const result = parseArgs([]);
      expect(result.command).toBe("help");
    });

    test("handles options before name", () => {
      const result = parseArgs(["create", "--repo", "/path", "my-session"]);
      expect(result.command).toBe("create");
      expect(result.options.repo).toBe("/path");
      expect(result.name).toBe("my-session");
    });
  });
});
