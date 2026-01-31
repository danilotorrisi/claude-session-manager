# CSM Worker Agent

Remote worker agent for Claude Session Manager. Runs on remote machines to manage sessions locally and sync state with CSM Master.

## Architecture

```
┌─────────────────────┐
│   CSM Master        │
│   (MacBook Pro)     │
│   - TUI Dashboard   │
│   - API Server      │
└──────────┬──────────┘
           │
           │ Events (push)
           ▼
┌─────────────────────┐
│   CSM Worker        │
│   (Mac mini)        │
│   - Session Manager │
│   - State Tracker   │
│   - Event Pusher    │
└─────────────────────┘
```

## Features

- **Local Session Management**: Create, attach, kill sessions via tmux
- **Event-Driven Sync**: Push updates to Master only when changes occur
- **Offline Queue**: Events are queued locally if Master is unavailable
- **State Persistence**: Local state survives restarts
- **Heartbeat**: Regular health checks to Master

## Events

Worker pushes these events to Master:

- `session_created`: New session started
- `session_attached`: Session attached
- `session_detached`: Session detached
- `session_killed`: Session terminated
- `claude_state_changed`: Claude IDE state updated
- `git_changes`: Git stats changed (files, +/-)
- `heartbeat`: Worker alive signal

## Configuration

Set via environment variables:

```bash
export CSM_WORKER_ID="mac-mini"              # Worker identifier
export CSM_MASTER_URL="http://macbook.local:3000"  # Master API URL (optional)
```

State file: `~/.config/csm-worker/state.json`

## Usage

### Start Worker Agent

```bash
csm worker start
```

Runs in foreground. Press Ctrl+C to stop gracefully.

### Check Status

```bash
csm worker status
```

Shows:
- Active sessions
- Claude state
- Git changes
- Master connectivity

### Force Sync

```bash
csm worker sync
```

Pushes full state to Master immediately.

## Worker Commands (via Telegram/API)

When interacting with the worker via Clawdbot:

- "stato sessioni" → Lists all sessions with details
- "che sta facendo my-feature?" → Shows Claude state and last message
- "cambiamenti in my-feature?" → Shows git changes
- "crea sessione per issue ENG-456" → Creates new session

## Integration with CSM Master

Worker pushes events to these endpoints (to be implemented in CSM):

### POST /api/worker-events

Receives individual events:

```typescript
{
  type: "session_created",
  timestamp: "2026-01-31T10:00:00Z",
  workerId: "mac-mini",
  sessionName: "my-feature",
  data: {
    worktreePath: "/tmp/csm-worktrees/my-feature-123",
    projectName: "freedom"
  }
}
```

### POST /api/worker-sync

Receives full state sync:

```typescript
{
  sessions: [
    { name: "my-feature", ... },
    { name: "bugfix-123", ... }
  ]
}
```

### GET /api/health

Health check endpoint.

## State Format

Local state file (`~/.config/csm-worker/state.json`):

```json
{
  "workerId": "mac-mini",
  "sessions": {
    "my-feature": {
      "name": "my-feature",
      "created": "2026-01-31T10:00:00Z",
      "attached": false,
      "windows": 1,
      "worktreePath": "/tmp/csm-worktrees/my-feature-123",
      "claudeState": "working",
      "gitStats": {
        "filesChanged": 3,
        "insertions": 45,
        "deletions": 12
      }
    }
  },
  "lastHeartbeat": "2026-01-31T11:00:00Z",
  "eventQueue": []
}
```

## Development

```bash
# Run worker in dev mode
bun run src/index.ts worker start

# Type check
bun run typecheck
```

## Deployment

### As systemd service (Linux)

```ini
[Unit]
Description=CSM Worker Agent
After=network.target

[Service]
Type=simple
User=clawdbot
Environment="CSM_WORKER_ID=mac-mini"
Environment="CSM_MASTER_URL=http://macbook.local:3000"
ExecStart=/usr/local/bin/csm worker start
Restart=always

[Install]
WantedBy=multi-user.target
```

### As launchd service (macOS)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.csm.worker</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/csm</string>
        <string>worker</string>
        <string>start</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CSM_WORKER_ID</key>
        <string>mac-mini</string>
        <key>CSM_MASTER_URL</key>
        <string>http://macbook.local:3000</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

## Next Steps

1. Implement API endpoints in CSM Master:
   - `/api/worker-events` - Receive events
   - `/api/worker-sync` - Receive full state
   - `/api/health` - Health check

2. Update TUI to show remote sessions from workers

3. Create Clawdbot skill for natural language interaction with worker
