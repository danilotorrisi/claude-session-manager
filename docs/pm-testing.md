# PM System — Manual Testing Guide

This document describes how to manually test each component of the 3-tier PM architecture.

## Prerequisites

- `bun` installed
- `tmux` installed
- A git repo to use (e.g. the csm repo itself)
- CSM built and available as `csm` (or use `bun run src/index.ts` directly)

```bash
# Build if needed
bun run build

# Or alias for convenience during testing
alias csm="bun run /path/to/csm/src/index.ts"
```

---

## 1. PM Lifecycle (start / stop / status)

### 1.1 Start the PM

```bash
# Start with explicit repo path
csm pm start --project my-project --repo ~/my-repo

# Or configure defaults in ~/.config/csm/config.json:
# { "defaultRepo": "/path/to/repo", "pm": { "projectName": "my-project" } }
csm pm start
```

**Expected output:**
```
Starting PM session...
Project: my-project
Repo: /path/to/repo

PM session started: csm-pm
Working directory: /tmp/csm-worktrees/pm
Attach with: tmux attach -t csm-pm
Starting session monitor daemon...
[Monitor] Session monitor started
[Monitor] Watching: /tmp/csm-claude-state
[Monitor] Idle threshold: 120s
```

**Verify:**
```bash
# Check tmux session exists
tmux has-session -t csm-pm && echo "PM session exists"

# Check it has 2 windows (claude + terminal)
tmux list-windows -t csm-pm

# Check CLAUDE.md was generated with correct substitutions
cat /tmp/csm-worktrees/pm/CLAUDE.md | head -5
# Should show: "You are an autonomous project manager for the **my-project** project."

# Check .claude/settings.json has PM permissions
cat /tmp/csm-worktrees/pm/.claude/settings.json | jq '.permissions.allow' | head -5
# Should include "Bash(csm *)", "Bash(tmux *)", etc.

# Check state file was written
cat /tmp/csm-pm-state.json
# Should show: { "status": "running", ... }
```

### 1.2 Check PM Status

```bash
csm pm status
```

**Expected output:**
```
=== PM Status ===
Session: running
State: running
Started: 2025-01-15T10:30:00.000Z
```

### 1.3 Stop the PM

```bash
csm pm stop
```

**Expected output:**
```
PM session stopped.
```

**Verify:**
```bash
# Session should be gone
tmux has-session -t csm-pm 2>/dev/null || echo "PM session cleaned up"

# State file should show stopped
cat /tmp/csm-pm-state.json
# Should show: { "status": "stopped", ... }
```

### 1.4 Error cases

```bash
# Start twice — should fail with clear message
csm pm start --repo ~/my-repo
csm pm start --repo ~/my-repo
# Expected: "PM session is already running. Use 'csm pm stop' first."

# Start without repo — should fail
csm pm start --project test
# Expected: "No repo path configured. Set defaultRepo in config or use --repo."

# Stop when not running — should be a no-op
csm pm stop
# Expected: "PM session is not running."
```

---

## 2. PM Session Communication

These tests require the PM to be running (`csm pm start --repo ...`).

### 2.1 Attach and observe

```bash
# Attach to the PM session to see Claude running
tmux attach -t csm-pm

# Detach with Ctrl-B, D
```

### 2.2 Read PM's pane output

```bash
# Capture what's on the PM's Claude pane (last 50 lines)
tmux capture-pane -t csm-pm:claude -p -S -50
```

### 2.3 Send a direct message to PM

```bash
# Short message (like Clawdbot would via tmux)
tmux send-keys -t csm-pm:claude -l 'What sessions are currently running? Run csm list.' && tmux send-keys -t csm-pm:claude Enter

# Watch the response
sleep 10
tmux capture-pane -t csm-pm:claude -p -S -30
```

### 2.4 Send a task via temp file (like the API does)

```bash
# Write a command file
cat > /tmp/csm-pm-cmd-test.md << 'EOF'
Please create a new developer session called "test-feature" and send it a simple task:
tell it to create a file called hello.txt with the content "Hello from PM".
EOF

# Send to PM
tmux send-keys -t csm-pm:claude -l 'Read /tmp/csm-pm-cmd-test.md -- new user request.' && tmux send-keys -t csm-pm:claude Enter

# Monitor PM's response (wait for it to act)
sleep 15
tmux capture-pane -t csm-pm:claude -p -S -50
```

---

## 3. Session Monitor

The monitor runs as part of the `csm pm start` process. Test it by simulating developer state changes.

### 3.1 Simulate a developer state change

```bash
# Create a fake developer session first
csm create test-dev --repo ~/my-repo

# Manually write a state file to simulate waiting_for_input
mkdir -p /tmp/csm-claude-state
cat > /tmp/csm-claude-state/test-dev-session.json << 'EOF'
{
  "state": "waiting_for_input",
  "event": "tool_use",
  "cwd": "/tmp/csm-worktrees/test-dev",
  "timestamp": REPLACE_WITH_EPOCH
}
EOF

# Replace timestamp with current epoch
sed -i '' "s/REPLACE_WITH_EPOCH/$(date +%s)/" /tmp/csm-claude-state/test-dev-session.json
```

**Expected:** After ~500ms debounce, the monitor should:
1. Detect the `waiting_for_input` transition
2. Capture the developer pane: `tmux capture-pane -t csm-test-dev:claude -p -S -30`
3. Write a notification file: `/tmp/csm-pm-notify-<ts>.md`
4. Send the notification to PM via tmux

**Verify:**
```bash
# Check notification file was created
ls /tmp/csm-pm-notify-*.md

# Read the notification content
cat /tmp/csm-pm-notify-*.md | head -20
# Should contain: "Session: test-dev", "Event: waiting_for_input", and pane content

# Check PM received it
tmux capture-pane -t csm-pm:claude -p -S -20
# Should show the "Read /tmp/csm-pm-notify-... -- developer needs attention." instruction
```

### 3.2 Simulate idle timeout

```bash
# Write a state file with an old timestamp (>120s ago)
OLD_TS=$(($(date +%s) - 200))
cat > /tmp/csm-claude-state/test-dev-idle.json << EOF
{
  "state": "waiting_for_input",
  "event": "tool_use",
  "cwd": "/tmp/csm-worktrees/test-dev",
  "timestamp": $OLD_TS
}
EOF

# The idle check runs every 30s, so wait up to 30s for the notification
sleep 35
ls /tmp/csm-pm-notify-*.md | tail -1
```

### 3.3 Simulate an escalation

```bash
# Write an escalation file (as if PM wrote it)
cat > /tmp/csm-pm-escalation.json << 'EOF'
{
  "id": "esc-001",
  "timestamp": "2025-01-15T10:35:00.000Z",
  "severity": "warning",
  "message": "Developer test-dev is stuck on authentication issue",
  "context": "Failed 3 attempts to configure OAuth. Needs human guidance.",
  "awaitingResponse": true
}
EOF
```

**Expected:** The monitor should detect the file and either:
- Forward it via HTTP to `escalationUrl` (if configured)
- Log it to console (if no URL configured)
- Delete the file after processing

**Verify:**
```bash
# File should be removed after processing
sleep 2
ls /tmp/csm-pm-escalation.json 2>/dev/null || echo "Escalation processed and removed"

# Check the PM process logs for:
# "[Monitor] Escalation (no URL configured): Developer test-dev is stuck..."
```

### 3.4 Cleanup test artifacts

```bash
# Kill the test developer session
csm kill test-dev

# Remove test state files
rm -f /tmp/csm-claude-state/test-dev-*.json
rm -f /tmp/csm-pm-notify-*.md
rm -f /tmp/csm-pm-cmd-test.md
```

---

## 4. API Endpoints

Start the API server first (requires both server and PM running):

```bash
# Terminal 1: Start PM
csm pm start --repo ~/my-repo

# Terminal 2: Start API server
csm server --port 3000
```

### 4.1 POST /api/pm/command

Send a command to the PM via HTTP.

```bash
curl -X POST http://localhost:3000/api/pm/command \
  -H 'Content-Type: application/json' \
  -d '{"command": "List all active sessions and report their status."}'
```

**Expected response:**
```json
{"success": true, "commandFile": "/tmp/csm-pm-cmd-1705312200000.md"}
```

**Verify:**
```bash
# Command file should exist
cat /tmp/csm-pm-cmd-*.md | tail -5

# PM should have received the instruction
tmux capture-pane -t csm-pm:claude -p -S -10
# Should show: "Read /tmp/csm-pm-cmd-... -- new user request."
```

**Error case — PM not running:**
```bash
csm pm stop
curl -X POST http://localhost:3000/api/pm/command \
  -H 'Content-Type: application/json' \
  -d '{"command": "test"}'
# Expected: 503 {"error": "PM session not available", ...}
```

**Error case — missing field:**
```bash
curl -X POST http://localhost:3000/api/pm/command \
  -H 'Content-Type: application/json' \
  -d '{}'
# Expected: 400 {"error": "Missing 'command' field"}
```

### 4.2 GET /api/pm/status

```bash
curl http://localhost:3000/api/pm/status | jq .
```

**Expected response:**
```json
{
  "pm": {
    "status": "running",
    "activeSessions": [],
    "escalations": [],
    "startedAt": "2025-01-15T10:30:00.000Z"
  },
  "sessions": {
    "pm": { "state": "working", "timestamp": 1705312200 },
    "test-dev": { "state": "idle", "timestamp": 1705312100 }
  }
}
```

The `sessions` field is a live snapshot from `/tmp/csm-claude-state/*.json` files, keyed by session name extracted from the worktree cwd path.

### 4.3 POST /api/pm/escalation-response

Respond to a PM escalation (simulating Clawdbot forwarding user's answer).

```bash
curl -X POST http://localhost:3000/api/pm/escalation-response \
  -H 'Content-Type: application/json' \
  -d '{"escalationId": "esc-001", "response": "Use OAuth2 with Google provider, here is the client ID: abc123"}'
```

**Expected response:**
```json
{"success": true, "responseFile": "/tmp/csm-pm-escalation-response-1705312200000.md"}
```

**Verify:**
```bash
# Response file should contain the structured response
cat /tmp/csm-pm-escalation-response-*.md

# PM should have received it
tmux capture-pane -t csm-pm:claude -p -S -10
# Should show: "Read /tmp/csm-pm-escalation-response-... -- escalation response from user."
```

**Error case — missing fields:**
```bash
curl -X POST http://localhost:3000/api/pm/escalation-response \
  -H 'Content-Type: application/json' \
  -d '{"escalationId": "esc-001"}'
# Expected: 400 {"error": "Missing 'escalationId' or 'response' field"}
```

---

## 5. pane-capture.ts Utilities

Test the low-level tmux helpers independently.

### 5.1 capturePane()

```bash
# Requires a running tmux session. Use the PM session or create one:
tmux new-session -d -s test-capture -n main

# Send some text
tmux send-keys -t test-capture:main 'echo "hello from test"' Enter

# Test via bun eval
bun -e '
import { capturePane } from "./src/lib/pane-capture";
const output = await capturePane("test-capture", 10, "main");
console.log("Captured:", JSON.stringify(output));
'
# Should contain "hello from test"

tmux kill-session -t test-capture
```

### 5.2 stripAnsi()

```bash
bun -e '
import { stripAnsi } from "./src/lib/pane-capture";
const dirty = "\x1b[31mred text\x1b[0m and \x1b[1mbold\x1b[0m";
console.log("Clean:", stripAnsi(dirty));
'
# Expected: "Clean: red text and bold"
```

### 5.3 sendMultilineToSession()

```bash
# Requires PM running
bun -e '
import { sendMultilineToSession } from "./src/lib/pane-capture";
const path = await sendMultilineToSession(
  "csm-pm",
  "This is a test multiline message.\nLine 2.\nLine 3.",
  "-- test message."
);
console.log("Written to:", path);
'

# Verify the file exists and PM received the instruction
cat /tmp/csm-pm-msg-*.md | tail -5
tmux capture-pane -t csm-pm:claude -p -S -5
```

---

## 6. pm-state.ts State Persistence

```bash
# Read current state (works even if PM not running — returns defaults)
bun -e '
import { readPMState } from "./src/lib/pm-state";
console.log(JSON.stringify(readPMState(), null, 2));
'

# Write a test state
bun -e '
import { writePMState } from "./src/lib/pm-state";
await writePMState({
  status: "running",
  currentPlan: {
    id: "plan-1",
    goal: "Implement login page",
    steps: [
      { id: "s1", title: "Create component", description: "...", status: "completed" },
      { id: "s2", title: "Add API call", description: "...", status: "in_progress", sessionName: "login-api" },
      { id: "s3", title: "Write tests", description: "...", status: "pending" },
    ],
    createdAt: new Date().toISOString(),
  },
  activeSessions: ["login-api"],
  escalations: [],
  startedAt: new Date().toISOString(),
});
'

# Verify state and then check status display
cat /tmp/csm-pm-state.json | jq .
csm pm status
# Expected output should show plan progress with [x], [~], [ ] indicators

# Test updatePMState (partial update)
bun -e '
import { updatePMState } from "./src/lib/pm-state";
const updated = await updatePMState({ activeSessions: ["login-api", "login-ui"] });
console.log("Updated sessions:", updated.activeSessions);
'

# Clean up
rm -f /tmp/csm-pm-state.json
```

---

## 7. End-to-End Workflow

Full test: PM receives a task, creates a developer session, monitors it, reports status.

```bash
# 1. Start PM (Terminal 1 — stays running)
csm pm start --project my-app --repo ~/my-repo

# 2. Start API server (Terminal 2 — stays running)
csm server --port 3000

# 3. Send a task via API (Terminal 3)
curl -X POST http://localhost:3000/api/pm/command \
  -H 'Content-Type: application/json' \
  -d '{"command": "Create a developer session called feature-1 and ask it to create a file called test.txt with the text Hello World."}'

# 4. Watch PM process the request (Terminal 3)
sleep 5
tmux capture-pane -t csm-pm:claude -p -S -50

# 5. Check if developer session was created
csm list
# Should show "pm" and "feature-1"

# 6. Check PM status via API
curl http://localhost:3000/api/pm/status | jq .

# 7. Check the developer session's output
tmux capture-pane -t csm-feature-1:claude -p -S -30

# 8. Wait for the developer to finish and trigger a notification
# (The monitor will detect waiting_for_input and notify PM)
sleep 60
tmux capture-pane -t csm-pm:claude -p -S -30

# 9. Cleanup
csm pm stop
# PM should kill its managed sessions during shutdown
```

---

## 8. File Locations Reference

| File | Purpose | Created by |
|---|---|---|
| `/tmp/csm-pm-state.json` | PM runtime state | pm-state.ts / PM Claude |
| `/tmp/csm-pm-escalation.json` | PM writes escalations here | PM Claude |
| `/tmp/csm-pm-notify-<ts>.md` | Monitor notifications to PM | session-monitor.ts |
| `/tmp/csm-pm-cmd-<ts>.md` | User commands (via API) to PM | pm-routes.ts |
| `/tmp/csm-pm-task-<name>-<ts>.md` | PM tasks sent to developers | PM Claude |
| `/tmp/csm-pm-msg-<ts>.md` | Generic messages via pane-capture | pane-capture.ts |
| `/tmp/csm-pm-escalation-response-<ts>.md` | User responses to escalations | pm-routes.ts |
| `/tmp/csm-claude-state/*.json` | Claude Code state files | Claude Code hooks |
| `/tmp/csm-worktrees/pm/` | PM worktree directory | pm-session.ts |
| `/tmp/csm-worktrees/pm/CLAUDE.md` | PM's generated CLAUDE.md | pm-session.ts |
| `/tmp/csm-worktrees/pm/.claude/settings.json` | PM permissions | pm-session.ts |

---

## 9. Troubleshooting

### PM won't start
```bash
# Check if session already exists
tmux has-session -t csm-pm 2>/dev/null && echo "Already running"

# Force cleanup if stale
tmux kill-session -t csm-pm 2>/dev/null
rm -f /tmp/csm-pm-state.json

# Check worktree exists
ls -la /tmp/csm-worktrees/pm/
```

### Monitor not detecting state changes
```bash
# Verify state directory exists and is watchable
ls /tmp/csm-claude-state/

# Manually trigger a state file write and watch for logs
echo '{"state":"waiting_for_input","event":"test","cwd":"/tmp/csm-worktrees/test-dev","timestamp":'$(date +%s)'}' > /tmp/csm-claude-state/test.json

# Check the PM process logs for "[Monitor] ..." messages
```

### API returns 503
The PM tmux session isn't running. Check:
```bash
tmux has-session -t csm-pm 2>/dev/null && echo "PM running" || echo "PM not running"
```

### Notification files accumulating
Temp files under `/tmp/csm-pm-*` are not auto-cleaned (by design — PM is expected to clean up). To manually clean:
```bash
rm -f /tmp/csm-pm-notify-*.md /tmp/csm-pm-cmd-*.md /tmp/csm-pm-msg-*.md /tmp/csm-pm-escalation-response-*.md
```
