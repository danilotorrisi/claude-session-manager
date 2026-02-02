/**
 * PM runtime state persistence.
 *
 * State is stored as JSON at /tmp/csm-pm-state.json. This file is the source
 * of truth for `csm pm status` and the GET /api/pm/status endpoint. The PM
 * Claude session also writes to this file to track its own plan and sessions.
 *
 * ## Manual testing
 *
 * Read state (safe even when PM is not running — returns defaults):
 *   bun -e 'import{readPMState}from"./src/lib/pm-state";console.log(readPMState())'
 *
 * Write a test state and verify with csm pm status:
 *   bun -e 'import{writePMState}from"./src/lib/pm-state";await writePMState({status:"running",activeSessions:["dev-1"],escalations:[],startedAt:new Date().toISOString()})'
 *   csm pm status   # should show "State: running", "Active sessions: dev-1"
 *   cat /tmp/csm-pm-state.json | jq .
 *
 * Partial update:
 *   bun -e 'import{updatePMState}from"./src/lib/pm-state";await updatePMState({activeSessions:["dev-1","dev-2"]})'
 *
 * Cleanup:
 *   rm -f /tmp/csm-pm-state.json
 */

import { readFileSync } from "fs";
import type { PMRuntimeState } from "../types";

const PM_STATE_FILE = "/tmp/csm-pm-state.json";

const DEFAULT_STATE: PMRuntimeState = {
  status: "stopped",
  activeSessions: [],
  escalations: [],
  startedAt: "",
};

export function readPMState(): PMRuntimeState {
  try {
    const content = readFileSync(PM_STATE_FILE, "utf-8");
    return JSON.parse(content) as PMRuntimeState;
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function writePMState(state: PMRuntimeState): Promise<void> {
  await Bun.write(PM_STATE_FILE, JSON.stringify(state, null, 2));
}

export async function updatePMState(
  updates: Partial<PMRuntimeState>
): Promise<PMRuntimeState> {
  const current = readPMState();
  const updated = { ...current, ...updates };
  await writePMState(updated);
  return updated;
}

export { PM_STATE_FILE };
