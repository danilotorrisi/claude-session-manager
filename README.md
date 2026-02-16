<div align="center">
  <img src="header.png" alt="Claude Session Manager" width="100%" />
</div>

# Claude Session Manager (CSM)

A CLI tool to manage Claude Code sessions across local and remote machines using tmux and git worktrees. Features both an interactive TUI dashboard and traditional CLI commands.

## Features

- **Interactive TUI Dashboard**: Full-featured terminal UI with real-time WebSocket updates
- **Live Session State**: Real-time status updates, streaming logs, and tool approval UI
- **WebSocket Integration**: Direct connection to Claude Code sessions via `--sdk-url` flag
- **HTTP API**: REST endpoints for external clients (OpenClaw, web UIs)
- **Tool Approval Interface**: Interactive y/n keybindings for approving/denying tool use
- **Git Worktree Isolation**: Each session gets its own git worktree, allowing parallel work on different branches
- **tmux Integration**: Sessions run in detached tmux sessions with Claude Code
- **Remote Support**: Manage sessions on remote machines via SSH
- **Simple Configuration**: JSON-based config file for hosts and defaults

## Installation

```bash
git clone https://github.com/danilotorrisi/claude-session-manager.git
cd claude-session-manager
bun install
bun link
```

## Usage

### Interactive TUI (Recommended)

Launch the interactive dashboard:

```bash
csm
```

```
╭──────────────────────────────────────────────────────────────────────────────╮
│                            Claude Session Manager                            │
╰──────────────────────────────────────────────────────────────────────────────╯

 3 sessions active

    SESSION                  STATUS       WINDOWS    CREATED
 ›  my-feature               ● attached   1          2h ago
    bugfix-123               ○ detached   1          1d ago
    refactor-api             ○ detached   1          3d ago

 [↑↓] navigate  [enter] manage  [a] attach  [c] create  [k] kill  [r] refresh  [q] quit
```

**TUI Keybindings:**

| Key | Action |
|-----|--------|
| `↑` `↓` | Navigate sessions |
| `Enter` | View session details |
| `a` | Attach to selected session |
| `c` | Create new session |
| `k` | Kill selected session |
| `r` | Refresh session list |
| `q` | Quit |

### CLI Commands

For scripting or quick operations:

```bash
csm create my-feature --repo ~/my-project   # Create session
csm list                                     # List sessions
csm attach my-feature                        # Attach to session
csm kill my-feature --delete-branch          # Kill and cleanup
csm hosts                                    # List remote hosts
csm help                                     # Show help
```

### Remote Operations

```bash
csm create my-feature --host dev-server
csm list --host dev-server
csm attach my-feature --host dev-server
csm kill my-feature --host dev-server
```

## Configuration

Create `~/.config/csm/config.json`:

```json
{
  "defaultRepo": "/path/to/your/repo",
  "worktreeBase": "/tmp/csm-worktrees",
  "apiPort": 3000,
  "hosts": {
    "dev-server": {
      "host": "user@192.168.1.100",
      "defaultRepo": "/home/user/project"
    }
  }
}
```

### Configuration Options

| Option | Description |
|--------|-------------|
| `defaultRepo` | Default repository path when `--repo` is not specified |
| `worktreeBase` | Directory where worktrees are created (default: `/tmp/csm-worktrees`) |
| `apiPort` | API server port for WebSocket connections (default: `3000`) |
| `hosts` | Map of remote host configurations |
| `hosts.<name>.host` | SSH connection string (e.g., `user@hostname`) |
| `hosts.<name>.defaultRepo` | Default repo path on the remote host |

## How It Works

1. **Create Session**:
   - Creates a new git worktree with branch `csm/<name>-<timestamp>`
   - Starts a detached tmux session named `csm-<name>`
   - Launches `claude` CLI inside the worktree directory

2. **Attach Session**:
   - For local: Runs `tmux attach -t csm-<name>`
   - For remote: Runs `ssh -t <host> "tmux attach -t csm-<name>"`

3. **Kill Session**:
   - Kills the tmux session
   - Removes the git worktree
   - Optionally deletes the worktree branch

## WebSocket Integration

CSM now features real-time WebSocket integration with Claude Code sessions, providing live updates and interactive control.

### For TUI Users

**Live Updates:**
- Real-time session status (no polling delays)
- Streaming output display with color-coded event types
- Instant notifications for session state changes
- 80% reduction in background polling (1s → 5s)

**Tool Approval:**
- Interactive banner appears when Claude requests tool use
- Press `y` to approve, `n` to deny
- Dashboard shows notification bar for pending approvals
- Press `Space` to navigate to session with pending approval

**Session Detail View:**
- Live log showing last 10 events (timestamped, color-coded)
- Streaming text display during active responses
- Tool approval banner with y/n keybindings

### For External Clients

CSM exposes HTTP API endpoints for integration with external tools like OpenClaw or custom web UIs:

#### List Sessions with Live State
```bash
curl http://localhost:3000/api/sessions
```

Returns all sessions with merged WebSocket state including status, model, turn count, cost, and pending approvals.

#### Send Messages
```bash
curl -X POST http://localhost:3000/api/sessions/my-session/message \
  -H "Content-Type: application/json" \
  -d '{"text":"list files"}'
```

Sends a prompt to the session. Uses WebSocket when available, falls back to tmux.

#### Stream Real-Time Events
```bash
curl -N http://localhost:3000/api/sessions/my-session/stream
```

Server-Sent Events (SSE) endpoint providing real-time session events (assistant messages, tool approvals, status changes, etc.).

#### Approve/Deny Tool Use
```bash
curl -X POST http://localhost:3000/api/sessions/my-session/approve-tool \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-123","action":"allow"}'
```

Remotely approve or deny tool use requests (`action`: "allow" or "deny").

### API Server

Start the API server (required for WebSocket features):

```bash
csm server
```

The server runs on port 3000 by default (configurable via `apiPort` in config.json).

## Requirements

- [Bun](https://bun.sh/) runtime
- tmux
- Git
- Claude CLI (`claude` command)
- SSH access for remote operations

## Tech Stack

- **TypeScript** - Language
- **Bun** - Runtime
- **React** - UI components
- **Ink** - Terminal rendering (same as Claude Code)

## CLI Shortcuts

| Command | Alias |
|---------|-------|
| `list` | `ls` |
| `attach` | `a` |
| `kill` | `k` |

## Development

```bash
# Run tests
bun test

# Run with coverage
bun test --coverage

# Type check
bun run typecheck
```
