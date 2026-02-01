#!/usr/bin/env bun

import { create } from "./commands/create";
import { list } from "./commands/list";
import { attach } from "./commands/attach";
import { kill } from "./commands/kill";
import { hosts } from "./commands/hosts";
import { rename } from "./commands/rename";
import { startWorker, statusWorker, syncWorker, pollWorker } from "./commands/worker";
import { startServer } from "./commands/server";
import { ensureConfigDir } from "./lib/config";
import { startTui } from "./tui";

const HELP = `
Claude Session Manager (csm)
Manage Claude Code sessions with tmux and git worktrees

USAGE:
  csm                  Launch interactive TUI dashboard
  csm <command>        Run CLI command

COMMANDS:
  (none)           Launch interactive TUI dashboard
  create <name>    Create a new session with git worktree
  list             List active sessions
  attach <name>    Attach to an existing session
  kill <name>      Kill a session and cleanup worktree
  rename <old> <new>  Rename a session
  hosts            List configured remote hosts
  worker [cmd]     Worker agent commands (start|status|sync)
  server           Start Master API server + co-located worker
  help             Show this help message

OPTIONS:
  --repo <path>    Repository path (for create)
  --host <name>    Remote host name (from config)
  --delete-branch  Delete the worktree branch (for kill)
  --no-worker      Don't auto-start co-located worker (for server)

EXAMPLES:
  csm                                    # Launch TUI
  csm create my-feature --repo ~/proj    # CLI: create session
  csm list                               # CLI: list sessions
  csm attach my-feature                  # CLI: attach to session
  csm kill my-feature --delete-branch    # CLI: kill session

  # Remote operations
  csm create my-feature --host dev-server
  csm list --host dev-server

CONFIGURATION:
  Config file: ~/.config/csm/config.json

  Example config:
  {
    "defaultRepo": "/path/to/your/repo",
    "worktreeBase": "/tmp/csm-worktrees",
    "hosts": {
      "dev-server": {
        "host": "user@192.168.1.100",
        "defaultRepo": "/home/user/project"
      }
    }
  }
`;

function parseArgs(args: string[]): {
  command: string | null;
  name?: string;
  positionalArgs: string[];
  options: Record<string, string | boolean>;
} {
  const command = args[0] || null;
  const options: Record<string, string | boolean> = {};
  let name: string | undefined;
  const positionalArgs: string[] = [];

  let i = 1;
  while (i < args.length) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      // Check if it's a flag (no value) or has a value
      if (!nextArg || nextArg.startsWith("--")) {
        options[key] = true;
        i++;
      } else {
        options[key] = nextArg;
        i += 2;
      }
    } else if (!name) {
      name = arg;
      positionalArgs.push(arg);
      i++;
    } else {
      positionalArgs.push(arg);
      i++;
    }
  }

  return { command, name, positionalArgs, options };
}

async function main(): Promise<void> {
  // Ensure config directory exists
  await ensureConfigDir();

  const args = process.argv.slice(2);
  const { command, name, positionalArgs, options } = parseArgs(args);

  // No command = launch TUI
  if (!command) {
    startTui();
    return;
  }

  try {
    switch (command) {
      case "tui":
        startTui();
        break;

      case "create":
        if (!name) {
          console.error("Error: Session name required");
          console.error("Usage: csm create <name> [--repo <path>] [--host <remote>]");
          process.exit(1);
        }
        await create(name, {
          repo: options.repo as string | undefined,
          host: options.host as string | undefined,
        });
        break;

      case "list":
      case "ls":
        await list({
          host: options.host as string | undefined,
        });
        break;

      case "attach":
      case "a":
        if (!name) {
          console.error("Error: Session name required");
          console.error("Usage: csm attach <name> [--host <remote>]");
          process.exit(1);
        }
        await attach(name, {
          host: options.host as string | undefined,
        });
        break;

      case "kill":
      case "k":
        if (!name) {
          console.error("Error: Session name required");
          console.error("Usage: csm kill <name> [--host <remote>] [--delete-branch]");
          process.exit(1);
        }
        await kill(name, {
          host: options.host as string | undefined,
          deleteBranch: options["delete-branch"] === true,
        });
        break;

      case "rename":
        if (!name || !positionalArgs[1]) {
          console.error("Error: Both old and new session names required");
          console.error("Usage: csm rename <old> <new> [--host <remote>]");
          process.exit(1);
        }
        await rename(name, positionalArgs[1], {
          host: options.host as string | undefined,
        });
        break;

      case "hosts":
        await hosts();
        break;

      case "worker":
        const workerCmd = name || "status";
        switch (workerCmd) {
          case "start":
            await startWorker();
            break;
          case "status":
            await statusWorker();
            break;
          case "sync":
            await syncWorker();
            break;
          case "poll":
            await pollWorker();
            break;
          default:
            console.error(`Unknown worker command: ${workerCmd}`);
            console.error("Available: start, status, sync, poll");
            process.exit(1);
        }
        break;

      case "server":
        const serverPort = options.port ? parseInt(options.port as string, 10) : undefined;
        await startServer(serverPort, {
          noWorker: options["no-worker"] === true,
        });
        break;

      case "help":
      case "--help":
      case "-h":
        console.log(HELP);
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP);
        process.exit(1);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
