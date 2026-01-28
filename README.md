# Claude Session Manager (CSM)

A minimal CLI tool to manage Claude Code sessions across local and remote machines using tmux and git worktrees.

## Features

- **Git Worktree Isolation**: Each session gets its own git worktree, allowing parallel work on different branches
- **tmux Integration**: Sessions run in detached tmux sessions with Claude Code
- **Remote Support**: Manage sessions on remote machines via SSH
- **Simple Configuration**: JSON-based config file for hosts and defaults

## Installation

```bash
cd ~/claude-session-manager
bun install
bun link
```

## Usage

### Create a Session

```bash
# Create a local session
csm create my-feature --repo ~/my-project

# Create a session on a remote host
csm create my-feature --host dev-server
```

### List Sessions

```bash
# List local sessions
csm list

# List sessions on a remote host
csm list --host dev-server
```

### Attach to a Session

```bash
# Attach to a local session
csm attach my-feature

# Attach to a remote session (via SSH)
csm attach my-feature --host dev-server
```

### Kill a Session

```bash
# Kill session and remove worktree
csm kill my-feature

# Kill session, remove worktree, and delete the branch
csm kill my-feature --delete-branch

# Kill a remote session
csm kill my-feature --host dev-server
```

### List Configured Hosts

```bash
csm hosts
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

## Shortcuts

| Command | Alias |
|---------|-------|
| `list` | `ls` |
| `attach` | `a` |
| `kill` | `k` |
