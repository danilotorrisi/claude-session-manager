# Changelog

All notable changes to Claude Session Manager (CSM) are documented here.

## 1.4.0

### Added
- **React web dashboard** — Full browser-based UI with session management, streaming logs, and tool approval modals (HeroUI + TanStack Query + React Router + Tailwind CSS)
- **WebSocket integration** — Real-time session state via Claude Code's `--sdk-url` flag (4-phase implementation)
- **Live TUI updates** — Real-time session status, streaming logs, and tool approval UI without polling delays
- **Tool approval rules engine** — Configurable allow/deny/ask rules per tool with glob pattern matching (`tool-rules.ts`). Rules evaluated in order, first match wins
- **"Always Allow/Deny" in tool modal** — One-click rule creation from the tool approval dialog, auto-deriving patterns from the current request
- **Tool Rules management view** — Dedicated page to add, edit, delete, and reorder tool approval rules
- **Claude usage tracking** — Real-time session/weekly/Sonnet usage bars with pace indicators in the dashboard footer. Reads OAuth credentials from file, macOS Keychain (CodexBar + Claude Code)
- **Event persistence** — Session events stored as JSONL files (`~/.config/csm/events/`) for SSE replay across server restarts, with automatic compaction at 500 events
- **Linear comments** — Fetch and create comments on Linear issues from the task detail view with markdown rendering
- **Task detail view** — Full Linear issue view with description, metadata, and threaded comments
- **Session reconnect** — Restart Claude Code with `--sdk-url` and `--continue` on disconnected sessions via API and UI
- **Tool approval interface** — Interactive y/n keybindings for approving/denying tool use in SessionDetail view
- **Dashboard notifications** — Alert bar for pending tool approvals with Space key navigation
- **HTTP API for external clients** — Endpoints for OpenClaw and web UIs:
  - `GET /api/sessions` — List sessions with merged WebSocket state
  - `POST /api/sessions/:name/message` — Send prompts to sessions
  - `GET /api/sessions/:name/stream` — Server-Sent Events for real-time updates
  - `POST /api/sessions/:name/approve-tool` — Approve/deny tool use requests
  - `PATCH /api/config` — Update Linear API key and tool rules
  - `POST /api/config/rules` — Append a tool approval rule
  - `GET /api/claude-usage` — Claude usage limits and utilization
- **Streaming output display** — Per-session streaming logs with color-coded event types
- **WebSocket-first message routing** — Automatic WebSocket delivery with tmux fallback
- **Reduced polling** — TUI polling reduced from 1s to 5s (80% reduction in background requests)
- **Event-driven refresh** — Immediate TUI updates on session connect/disconnect/status changes
- **Favorites** — Star/unstar sessions for quick access with persistent state (Zustand store)
- **Settings view** — Manage Linear API key from the web dashboard
- **WebSearch formatting** — Stream viewer now formats `WebSearch` tool events

### Changed
- **Tool allow/deny lists refactored** — Extracted hardcoded allow/deny lists from `tmux.ts` into configurable `toolApprovalRules` in config, evaluated by the rule engine
- **WebSocket stream improvements** — Reset entries on reconnect to avoid duplicates, added `isWorking` state tracking, support for `tool_auto_approved` and `tool_auto_denied` event types
- **Claude state chips** — Improved status display: "Waiting" instead of "Waiting for input", proper Attached/Detached states with dot indicators
- **Footer layout** — Responsive footer with usage bars and keyboard shortcut hints

### Removed
- **PM (Project Manager) system** — Removed `session-pm.ts`, `pm-session.ts`, `pm-state.ts`, PM routes, PM commands, PM TUI views, and all associated tests. PM functionality has been deprecated in favor of direct session management.

### Technical Details
- WebSocket: Phase 1 (server + state), Phase 2 (session creation), Phase 3 (TUI hooks), Phase 4 (HTTP API)
- New core modules: `tool-rules.ts` (rule engine), `event-store.ts` (JSONL persistence), `claude-usage.ts` (OAuth + usage API)
- New web views: `ToolRulesView`, `TaskDetailView`, `SettingsView` (expanded)
- New web components: `Chip`, `FavoriteButton`
- New hooks: `useClaudeUsage`, expanded `useLinearTasks` (issue detail, comments, create comment)

## 1.3.0

### Added
- **Dynamic worker registration** — workers register with master API server, deprecating static host configuration
- **Co-located worker mode** — master server automatically starts a local worker for managing sessions on the same machine
- **Committed changes tracking** — Git Changes panel now shows both uncommitted and committed files in separate sections
- **Source-aware diff viewing** — uncommitted files diff against HEAD, committed files diff against main
- **Master/worker architecture** — new worker agent system for distributed session management across multiple machines

### Fixed
- **Clean git status in worktrees** — `.csm-metadata.json` and `.claude/` now ignored, `CLAUDE.md` uses `skip-worktree` to prevent false changes
- **Metadata file tracking** — CSM-injected files no longer pollute git status

## 1.2.0

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
- **SSH ControlMaster multiplexing** — persistent SSH connections for faster remote operations
- **Host renaming** — rename configured SSH hosts from the TUI
- **Session list persistence** — preserve session list across tmux attach/detach cycles
- **Remote host hook installation** — auto-install CSM hooks on remote hosts
- **Enhanced Hosts tab** — status indicators, latency, RAM usage, and local host display
- **Squash merge with AI commit messages** — Claude-generated commit messages for merge-to-main
- **Git changes preview panel** — interactive per-file diff view in the dashboard
- **Feedback loop system** — automatic task completion reports
- **Merge-to-main and archive** — squash merge session branches and archive completed sessions
- **Git stats column** — show files changed, insertions, and deletions per session
- **Terminal window attach** — press `t` to attach directly to the terminal window
- **Hosts tab** — manage SSH remote hosts from the TUI
- **Tasks tab** — Linear issue state management with browser open support

### Fixed
- Remote session SSH quoting, reply, and git stats
- TUI layout pinning header/tabs at top and footer at bottom
- Remote session attach targeting correct tmux window
- Clean check ignoring untracked files during merge
- Session status reporting with staleness checks and transcript fallback

## 1.1.0

### Added
- **Projects feature** — organize sessions by project with tabbed TUI navigation
- **Project setup scripts** — run setup commands when creating a session
- **Auto-return to TUI** — automatically return from tmux when Claude starts working
- **Claude Code session title** — display session titles from tmux pane titles
- **Full-screen TUI** — improved layout using full terminal height
- **Return to TUI** — automatically relaunch TUI after detaching from tmux
- **Worktree conflict recovery** — detect stale worktrees and offer cleanup
- **Interactive TUI dashboard** — React + Ink based terminal UI
- **TUI component tests** — test coverage for dashboard components

### Fixed
- Terminal handling when attaching from TUI

## 1.0.0

### Added
- Initial release of Claude Session Manager
- CLI commands: `create`, `attach`, `kill`, `list`/`ls`, `hosts`, `tui`, `help`
- tmux session management with `csm-` prefix
- Git worktree lifecycle management
- Linear issue integration
- Local and remote (SSH) session support
