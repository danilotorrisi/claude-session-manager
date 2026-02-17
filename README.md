<div align="center">
  <img src="header.png" alt="Claude Session Manager" width="100%" />
</div>

# Claude Session Manager (CSM)

A CLI tool to manage Claude Code sessions across local and remote machines using tmux and git worktrees. Features a React web dashboard, an interactive TUI, and a full HTTP API.

## Features

- **React Web Dashboard**: Full-featured browser UI with real-time WebSocket updates, session streaming, and tool approval modals
- **Interactive TUI Dashboard**: Terminal UI with live session state and keybindings
- **Tool Approval Rules**: Configurable allow/deny rules per tool with glob pattern matching — auto-approve or block tool requests without manual intervention
- **Claude Usage Tracking**: Real-time session, weekly, and Sonnet usage bars with pace indicators in the dashboard footer
- **Event Persistence**: Session events stored as JSONL files for SSE replay across server restarts
- **Linear Integration**: Issue search, comments (fetch + create), and task detail views with markdown rendering
- **WebSocket Integration**: Direct connection to Claude Code sessions via `--sdk-url` flag
- **HTTP API**: REST endpoints for sessions, config, tool rules, and Claude usage
- **Session Reconnect**: Restart Claude Code with `--continue` on disconnected sessions
- **Git Worktree Isolation**: Each session gets its own git worktree, allowing parallel work on different branches
- **tmux Integration**: Sessions run in detached tmux sessions with Claude Code
- **Remote Support**: Manage sessions on remote machines via SSH
- **Favorites**: Star sessions for quick access

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
  "linearApiKey": "lin_api_...",
  "toolApprovalRules": [
    { "tool": "Read", "action": "allow" },
    { "tool": "Bash", "pattern": "git *", "action": "allow" },
    { "tool": "Bash", "pattern": "rm *", "action": "deny" }
  ],
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
| `linearApiKey` | Linear API key for issue integration |
| `toolApprovalRules` | Array of tool approval rules (see below) |
| `hosts` | Map of remote host configurations |
| `hosts.<name>.host` | SSH connection string (e.g., `user@hostname`) |
| `hosts.<name>.defaultRepo` | Default repo path on the remote host |

### Tool Approval Rules

Rules are evaluated in order — first match wins. If no rule matches, the user is prompted to approve/deny.

| Field | Description |
|-------|-------------|
| `tool` | Tool name to match: `Bash`, `Read`, `Write`, `Edit`, `Grep`, `Glob`, `WebFetch`, or `*` for any |
| `pattern` | Optional glob pattern matched against the tool's primary input (e.g., `git *` for Bash commands starting with `git`) |
| `action` | `allow` (auto-approve), `deny` (auto-reject), or `ask` (prompt user) |

You can also manage rules from the web dashboard under **Tool Rules**, or use the "Always Allow" / "Always Deny" buttons in the tool approval modal.

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

Server-Sent Events (SSE) endpoint providing real-time session events (assistant messages, tool approvals, status changes, etc.). Events are persisted to disk and replayed on reconnect.

#### Approve/Deny Tool Use
```bash
curl -X POST http://localhost:3000/api/sessions/my-session/approve-tool \
  -H "Content-Type: application/json" \
  -d '{"requestId":"req-123","action":"allow"}'
```

Remotely approve or deny tool use requests (`action`: "allow" or "deny").

#### Reconnect Session
```bash
curl -X POST http://localhost:3000/api/sessions/my-session/reconnect
```

Restart Claude Code with `--sdk-url` and `--continue` on a disconnected session.

#### Update Config
```bash
curl -X PATCH http://localhost:3000/api/config \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"linearApiKey":"lin_api_...", "toolApprovalRules":[...]}'
```

Update Linear API key and/or tool approval rules. Requires API token authentication.

#### Add Tool Approval Rule
```bash
curl -X POST http://localhost:3000/api/config/rules \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"rule":{"tool":"Bash","pattern":"git *","action":"allow"}}'
```

Append a single tool approval rule to the config.

#### Claude Usage
```bash
curl http://localhost:3000/api/claude-usage
```

Returns current Claude usage limits (session, weekly, Sonnet) with utilization percentages and reset times.

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

## Web Dashboard

CSM includes a React web dashboard accessible at `http://localhost:3000` when the API server is running.

**Pages:**
- **Dashboard** — Session list with real-time status, favorites, and quick actions
- **Session Detail** — Live streaming logs, message input, tool approval modal with "Always Allow/Deny", git changes
- **Create Session** — Create new sessions with project/Linear issue selection
- **Tasks** — Linear issue list with state management and detail view with comments
- **Tool Rules** — Manage tool approval rules (add/edit/delete/reorder)
- **Settings** — Linear API key configuration
- **Projects** / **Hosts** — Manage projects and remote hosts

**Tech stack:**
- [HeroUI](https://heroui.com/) (component library)
- [TanStack Query](https://tanstack.com/query) (data fetching)
- [React Router](https://reactrouter.com/) (routing)
- [Tailwind CSS](https://tailwindcss.com/) (styling)
- [Vite](https://vite.dev/) (build tool)

## Tech Stack

- **TypeScript** - Language
- **Bun** - Runtime
- **React** - UI components (web dashboard + TUI)
- **Ink** - Terminal rendering (TUI)
- **HeroUI** - Web component library
- **Vite** - Web build tool

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
