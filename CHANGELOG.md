# Changelog

All notable changes to Claude Session Manager (CSM) are documented here.

## Unreleased

### Added
- **Project setup scripts** — inline shell script per project, written to `.csm-setup.sh` and executed in the terminal window on session create
- **Project environment variables** — key-value pairs injected into both tmux windows (claude and terminal) before claude launches
- **Project run scripts** — named commands stored per project, triggerable via `x` on the dashboard
- **Session edit modal** — press `e` on a session to rename, change project, or reassign Linear task
- **Quick-add task modal** — create Linear issues directly from the TUI
- **Project editing** — edit existing projects in the Projects tab
- **Task-to-session prefill** — start a session from a task with name and project pre-filled
- **R2 feedback report uploads** — upload feedback reports to Cloudflare R2
- **Config TUI tab** — manage CSM configuration from within the TUI
- **Claude settings management** — auto-generate `.claude/settings.json` with tool permissions and safety hooks
- **Remote auto-detach** — automatically return to TUI when Claude starts working on remote sessions

## 0.9.0

### Added
- **SSH ControlMaster multiplexing** — persistent SSH connections for faster remote operations
- **Host renaming** — rename configured SSH hosts from the TUI
- **Session list persistence** — preserve session list across tmux attach/detach cycles
- **Remote host hook installation** — auto-install CSM hooks on remote hosts

### Fixed
- Remote session SSH quoting, reply, and git stats
- TUI layout pinning header/tabs at top and footer at bottom
- Remote session attach targeting correct tmux window

## 0.8.0

### Added
- **Enhanced Hosts tab** — status indicators, latency, RAM usage, and local host display
- **Squash merge with AI commit messages** — Claude-generated commit messages for merge-to-main
- **Git changes preview panel** — interactive per-file diff view in the dashboard
- **Feedback loop system** — automatic task completion reports

## 0.7.0

### Added
- **Merge-to-main and archive** — squash merge session branches and archive completed sessions
- **Git stats column** — show files changed, insertions, and deletions per session
- **Terminal window attach** — press `t` to attach directly to the terminal window
- **Hosts tab** — manage SSH remote hosts from the TUI
- **Tasks tab** — Linear issue state management with browser open support

### Fixed
- Clean check ignoring untracked files during merge
- Session status reporting with staleness checks and transcript fallback

## 0.6.0

### Added
- **Projects feature** — organize sessions by project with tabbed TUI navigation
- **Project setup scripts** — run setup commands when creating a session
- **Auto-return to TUI** — automatically return from tmux when Claude starts working

## 0.5.0

### Added
- **Claude Code session title** — display session titles from tmux pane titles
- **Full-screen TUI** — improved layout using full terminal height
- **Return to TUI** — automatically relaunch TUI after detaching from tmux
- **Worktree conflict recovery** — detect stale worktrees and offer cleanup

### Fixed
- Terminal handling when attaching from TUI

## 0.4.0

### Added
- **Interactive TUI dashboard** — React + Ink based terminal UI
- **TUI component tests** — test coverage for dashboard components

## 0.1.0

### Added
- Initial release of Claude Session Manager
- CLI commands: `create`, `attach`, `kill`, `list`/`ls`, `hosts`, `tui`, `help`
- tmux session management with `csm-` prefix
- Git worktree lifecycle management
- Linear issue integration
- Local and remote (SSH) session support
