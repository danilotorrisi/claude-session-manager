# Code Review: Host Tab Refactoring

## Summary

This review covers all changes introduced in the CSM Host refactoring: worker registration protocol, auto-start co-located worker, auto worker ID, frontend rewrite, and deprecation warnings. Overall the implementation is solid and well-structured. Below are findings organized by category.

---

## 1. Type Safety

### 1.1 `sessions: Map<string, any>` remains untyped
**File:** `src/api/server.ts:15`
**Severity:** Low
The sessions map uses `any` for values. This predates the refactoring but was not addressed. Consider defining a `StoredSession` interface for the values stored by `handleWorkerEvent`.

### 1.2 `WorkerEvent.data` is a single flat optional bag
**File:** `src/worker/types.ts:28-49`
**Severity:** Low
All event types share the same `data?` shape. This means nothing prevents sending `hostInfo` on a `session_killed` event or `gitStats` on a `worker_registered` event. A discriminated union (`WorkerRegisteredEvent | HeartbeatEvent | ...`) would catch mismatched payloads at compile time. This is a trade-off vs simplicity — acceptable for now but worth revisiting as event types grow.

### 1.3 No runtime validation of `/api/workers` response
**File:** `src/tui/hooks/useWorkers.ts:38`
**Severity:** Low
`response.json()` is cast directly to `{ workers: RegisteredWorker[] }` without validation. If the API shape changes or the response is malformed, the TUI will silently receive unexpected data. A lightweight check (e.g., `Array.isArray(data.workers)`) would add robustness.

### 1.4 `buildWorkerConfig` returns `masterUrl: undefined` when env not set
**File:** `src/commands/worker.ts:14`
**Severity:** Low
`process.env.CSM_MASTER_URL` is `undefined` when not set, so `masterUrl` becomes `undefined`. The `WorkerConfig` type allows this (`masterUrl?: string`), and `MasterClient` handles it, but `startWorker` prints `"not configured"` and proceeds to start anyway. The worker will queue all events indefinitely without a master URL.

---

## 2. Edge Cases and Error Handling

### 2.1 `worker_deregistered` may fail silently on shutdown
**File:** `src/worker/worker-agent.ts:99-104`
**Severity:** Medium
`stop()` calls `this.pushEvent(...)` for the deregistration event. If the master is unreachable, the event gets queued to the state file. But since the worker is shutting down, the queued event will only be sent if the worker restarts later and processes its queue. Meanwhile, the master still shows the worker as "stale" until the heartbeat threshold expires. This is acceptable degraded behavior but should be documented.

### 2.2 Co-located worker state file collision
**File:** `src/commands/server.ts:12`, `src/commands/worker.ts:15`
**Severity:** Medium
Both `startColocatedWorker` and `buildWorkerConfig` use the same state file path: `~/.config/csm-worker/state.json`. If someone runs `csm server` (which auto-starts a co-located worker) AND separately runs `csm worker start` on the same machine, both worker processes will read/write the same state file simultaneously. This can cause data corruption. Consider including the worker ID in the state file path, e.g., `state-{workerId}.json`.

### 2.3 `deriveWorkerStatus` edge case with clock skew
**File:** `src/api/server.ts:129-135`
**Severity:** Low
If a worker's clock is ahead of the server's clock, `age` could be negative, and the worker would always appear "online". The code doesn't guard against this. Not a practical issue in typical LAN deployments but worth noting.

### 2.4 Event array slicing on every event
**File:** `src/api/server.ts:30-31`
**Severity:** Low
When the events array exceeds 1000 entries, `state.events.slice(-1000)` creates a new array on every subsequent event push. A ring buffer or deque would be more efficient, but at 1000 entries the performance impact is negligible.

### 2.5 `selectedIndex` can go stale
**File:** `src/tui/views/Hosts.tsx:55`
**Severity:** Low
If workers disconnect and the list shrinks below the current `selectedIndex`, the arrow-down handler clamps correctly (`Math.min(workers.length - 1, i + 1)`), but the current `selectedIndex` isn't clamped on re-render. If `selectedIndex` is 5 and the list shrinks to 3, the selection will be out-of-bounds until the user presses a key. Add a `useEffect` to clamp the index when `workers.length` changes.

---

## 3. Performance and Memory

### 3.1 `gatherHostInfo()` called every heartbeat (30s)
**File:** `src/worker/worker-agent.ts:195`
**Severity:** Medium
`gatherHostInfo()` calls `getLocalHostInfo()` which shells out to system commands (uptime, memory). Running shell commands every 30 seconds is not expensive in absolute terms, but it's unnecessary for values that change slowly. Consider:
- Gathering full host info every 5 minutes
- Only sending `hostname`, `arch`, `cpuCount` (which never change) once at registration
- Refreshing only `uptime` and `ramUsage` on heartbeats

### 3.2 TUI polls `/api/workers` every 5 seconds
**File:** `src/tui/hooks/useWorkers.ts:1` (POLL_INTERVAL = 5000)
**Severity:** Low
This is aggressive compared to the heartbeat interval (30s). Worker status can only change every 30s at fastest, so a 10-15s poll interval would reduce API traffic without meaningful UX degradation. The 3s timeout (`AbortSignal.timeout(3000)`) is appropriate.

### 3.3 `hostname()` called on every render cycle
**File:** `src/tui/hooks/useWorkers.ts:23`
**Severity:** Low
`const localHostname = hostname()` is called inside the hook body (which runs on every render). `hostname()` is a synchronous OS call — fast but unnecessary to repeat. Move it to a module-level constant or wrap in `useMemo`.

### 3.4 In-memory state not bounded for sessions
**File:** `src/api/server.ts:15`
**Severity:** Low
`state.sessions` Map grows unboundedly (entries are only removed on `session_killed`). If workers create and kill thousands of sessions over time, the Map stays manageable because killed sessions are deleted. However, if a worker loses connectivity and doesn't send `session_killed`, orphan entries accumulate. Consider periodic cleanup of sessions belonging to offline workers.

---

## 4. Consistency with Project Style

### 4.1 CORS headers pattern is verbose and repetitive
**File:** `src/api/server.ts:192-248`
**Severity:** Low (pre-existing)
Every route handler creates a Response and then manually sets CORS headers via `Object.entries(headers).forEach(...)`. This pattern existed before the refactoring but was extended. A middleware-style wrapper would reduce duplication. Not a blocker — mentioned for future cleanup.

### 4.2 Consistent use of `colors` theme
**File:** `src/tui/views/Hosts.tsx`
**Severity:** None (positive)
The rewritten Hosts component correctly uses the shared `colors` theme object, consistent with other views (Dashboard, Projects, Tasks).

### 4.3 `generateWorkerId` naming convention
**File:** `src/commands/worker.ts:6-9`
**Severity:** None (positive)
Stripping `.local`, lowercasing, and sanitizing to `[a-z0-9-]` is a clean approach that produces readable IDs (`mac-mini`, `macbook-pro`) matching the existing naming patterns in the codebase.

### 4.4 `startColocatedWorker` duplicates config construction
**File:** `src/commands/server.ts:8-16`
**Severity:** Low
`startColocatedWorker` builds its own `WorkerConfig` object rather than calling `buildWorkerConfig()` from `commands/worker.ts`. The two configs differ only in `masterUrl` (localhost vs env var). Consider reusing `buildWorkerConfig({ masterUrl: \`http://localhost:${masterPort}\` })` to avoid drift.

---

## 5. Testing Coverage

### 5.1 No new tests written
**Severity:** High
No tests were added for any of the new code. The following are the critical gaps:

| Component | What to test |
|---|---|
| `generateWorkerId()` | Various hostnames: `Mac-Mini.local`, `ubuntu-server`, empty hostname, special chars |
| `gatherHostInfo()` | Success path, fallback when `getLocalHostInfo()` throws |
| `deriveWorkerStatus()` | Online/stale/offline thresholds, empty string input, future timestamps |
| `handleWorkerEvent()` | Registration, deregistration, heartbeat, event cap at 1000 |
| `handleGetWorkers()` | Empty state, multiple workers, status derivation |
| `isLocalWorker()` | Matching with `.local` suffix, case differences, undefined hostname |
| `normalizeHostname()` | `.local` stripping, lowercase |
| `useWorkers` hook | Fetch success/failure, masterReachable state transitions, sorting |
| `Hosts.tsx` | Render states: loading, unreachable, no workers, with workers, local badge |
| Co-located worker lifecycle | Start with server, `--no-worker` flag, graceful shutdown order |

### 5.2 Pre-existing test failure
**File:** `tests/tui/Footer.test.tsx`
**Severity:** Low (pre-existing)
The Footer test fails due to terminal width truncation in the test environment. Our changes to the hosts keybindings did not cause this failure — it fails on the dashboard keybindings test case.

---

## 6. Recommendations (Priority Order)

1. **Write unit tests** for `generateWorkerId`, `deriveWorkerStatus`, `isLocalWorker`, `normalizeHostname`, and `handleWorkerEvent`. These are pure functions and easy to test.
2. **Fix state file collision** — include worker ID in the state file path to prevent corruption when co-located worker and standalone worker run simultaneously.
3. **Clamp `selectedIndex`** in Hosts.tsx when `workers.length` changes.
4. **Reuse `buildWorkerConfig`** in `startColocatedWorker` to avoid config duplication.
5. **Reduce `gatherHostInfo` frequency** — full info at registration, lightweight refresh on heartbeat.
6. **Move `hostname()` call** to module scope or `useMemo` in `useWorkers.ts`.
7. **Add runtime validation** for API responses in `useWorkers.ts`.
8. **Increase TUI poll interval** from 5s to 10-15s to match heartbeat cadence.

---

## Verdict

The refactoring achieves its goals cleanly: the Host tab is now a live worker view, the master auto-starts a co-located worker, and static host config is properly deprecated. The architecture correctly keeps `isLocal` as a client-side concept. The main gaps are **missing tests** and the **state file collision** risk. The code is production-ready for the current scale (2-5 workers) but should address the testing gap before wider deployment.
