# Claude Session Manager (CSM)

A CLI tool to manage Claude Code sessions across local and remote machines using tmux and git worktrees. Features both an interactive TUI dashboard and traditional CLI commands.

## Features

- **Interactive TUI Dashboard**: Full-featured terminal UI for session management
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
