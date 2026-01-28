# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claude Session Manager (CSM) is a CLI tool for managing Claude Code sessions across local and remote machines using tmux and git worktrees. It provides both a command-line interface and an interactive TUI dashboard built with React + Ink.

## Commands

```bash
bun install              # Install dependencies
bun link                 # Link globally as 'csm' command
bun run dev              # Run CLI locally
bun test                 # Run all tests
bun test:unit            # Unit tests only
bun test:integration     # Integration tests only
bun run typecheck        # TypeScript type checking (tsc --noEmit)
```

Run a single test file: `bun test src/path/to/file.test.ts`

## Architecture

**Runtime:** Bun with native TypeScript support (no build step). ES modules throughout.

**Three layers:**

1. **CLI layer** (`src/index.ts`, `src/commands/`) — Argument parsing and command dispatch. Commands: `create`, `attach`, `kill`, `list`/`ls`, `hosts`, `tui`, `help`. No command launches the TUI dashboard.

2. **Core library** (`src/lib/`) — Business logic abstractions:
   - `tmux.ts` — tmux session operations (create, attach, kill, list, state reading)
   - `worktree.ts` — Git worktree lifecycle (create branch `csm/<name>-<timestamp>`, metadata via `.csm-metadata.json`)
   - `config.ts` — Config management at `~/.config/csm/config.json`
   - `ssh.ts` — Abstracts local vs remote command execution over SSH
   - `claude-state.ts` — Reads Claude Code session state from `/tmp/csm-claude-state/`
   - `linear.ts` — Linear issue search API integration

3. **TUI layer** (`src/tui/`) — Interactive dashboard using React + Ink:
   - `App.tsx` — Root component with `useReducer` state management
   - Views: `Dashboard`, `CreateSession`, `SessionDetail`
   - Components: `Header`, `Footer`, `SessionList`, `StatusBar`
   - `hooks/useSessions.ts` — Session fetching with 5-second auto-refresh
   - `theme.ts` — Centralized color/styling constants

**State management:** TUI uses `useReducer` with actions (`SET_VIEW`, `SET_SESSIONS`, `SET_LOADING`, `SET_ERROR`, `SET_MESSAGE`). Views: `"dashboard"` | `"create"` | `"detail"`.

**Path alias:** `@/*` maps to `src/*` (configured in tsconfig.json).

## Conventions

- Session names are prefixed with `csm-` (e.g., tmux session `csm-my-feature`)
- Worktree branches follow pattern `csm/<session-name>-<timestamp>`
- Worktree metadata stored in `.csm-metadata.json` at worktree root
- `tmux.ts` dynamically generates a `CLAUDE.md` in worktrees via `writeClaudeContext()` with Linear issue context
- Commands return `{ success, stdout, stderr, exitCode }` result objects
- TUI attaches to tmux by exiting the Ink app, running tmux attach, then relaunching TUI on detach (`exitTuiAndAttach()`)
