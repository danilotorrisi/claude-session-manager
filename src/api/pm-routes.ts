/**
 * API route handlers for Clawdbot ↔ PM communication.
 *
 * These are thin HTTP-to-tmux bridges. Each handler writes content to a temp
 * file and sends a "Read" instruction to the PM's tmux pane. The PM (Claude)
 * then reads the file and acts on it.
 *
 * Routes (mounted in src/api/server.ts):
 *   POST /api/pm/command             → handlePMCommand
 *   GET  /api/pm/status              → handlePMStatus
 *   POST /api/pm/escalation-response → handlePMEscalationResponse
 *
 * ## Manual testing with curl
 *
 * Prerequisites: PM running (csm pm start), API server running (csm server).
 *
 * Send a command:
 *   curl -X POST http://localhost:3000/api/pm/command \
 *     -H 'Content-Type: application/json' \
 *     -d '{"command": "List all sessions."}'
 *   # → 200 {"success":true,"commandFile":"/tmp/csm-pm-cmd-<ts>.md"}
 *   # Verify: tmux capture-pane -t csm-pm:claude -p -S -5
 *
 * Get status:
 *   curl http://localhost:3000/api/pm/status | jq .
 *   # → 200 {"pm":{...},"sessions":{...}}
 *
 * Respond to escalation:
 *   curl -X POST http://localhost:3000/api/pm/escalation-response \
 *     -H 'Content-Type: application/json' \
 *     -d '{"escalationId":"esc-001","response":"Approved, go ahead."}'
 *   # → 200 {"success":true,"responseFile":"/tmp/csm-pm-escalation-response-<ts>.md"}
 *
 * Error cases:
 *   curl -X POST http://localhost:3000/api/pm/command -H 'Content-Type: application/json' -d '{}'
 *   # → 400 {"error":"Missing 'command' field"}
 *
 *   csm pm stop  # then:
 *   curl -X POST http://localhost:3000/api/pm/command -H 'Content-Type: application/json' -d '{"command":"test"}'
 *   # → 503 {"error":"PM session not available",...}
 */

import { exec } from "../lib/ssh";
import { readPMState } from "../lib/pm-state";
import { PM_TMUX_SESSION } from "../lib/pm-session";
import { readClaudeStates } from "../lib/claude-state";

/**
 * Handle a command sent to the PM from Clawdbot.
 * Writes the command to a temp file and sends it to PM via tmux.
 */
export async function handlePMCommand(body: { command: string }): Promise<Response> {
  if (!body.command) {
    return new Response(
      JSON.stringify({ error: "Missing 'command' field" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const ts = Date.now();
  const cmdPath = `/tmp/csm-pm-cmd-${ts}.md`;

  await Bun.write(cmdPath, body.command);

  // Send to PM via tmux
  const instruction = `Read ${cmdPath} -- new user request.`;
  const escaped = instruction.replace(/'/g, "'\\''");
  const result = await exec(
    `tmux send-keys -t ${PM_TMUX_SESSION}:claude -l '${escaped}' && tmux send-keys -t ${PM_TMUX_SESSION}:claude Enter`
  );

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: "PM session not available", details: result.stderr }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, commandFile: cmdPath }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Return PM status including runtime state and live Claude states.
 */
export function handlePMStatus(): Response {
  const pmState = readPMState();
  const claudeStates = readClaudeStates();

  // Convert Claude states map to a serializable object
  const sessions: Record<string, { state: string; timestamp: number }> = {};
  for (const [cwd, info] of claudeStates) {
    const match = cwd.match(/csm-worktrees\/([^/]+)/);
    if (match) {
      sessions[match[1]] = { state: info.state, timestamp: info.timestamp };
    }
  }

  return new Response(
    JSON.stringify({ pm: pmState, sessions }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

/**
 * Handle an escalation response from the user (via Clawdbot).
 * Writes the response to a temp file and sends it to PM via tmux.
 */
export async function handlePMEscalationResponse(body: {
  escalationId: string;
  response: string;
}): Promise<Response> {
  if (!body.escalationId || !body.response) {
    return new Response(
      JSON.stringify({ error: "Missing 'escalationId' or 'response' field" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const ts = Date.now();
  const responsePath = `/tmp/csm-pm-escalation-response-${ts}.md`;

  const content = [
    `# Escalation Response`,
    ``,
    `**Escalation ID:** ${body.escalationId}`,
    `**Response:** ${body.response}`,
    `**Time:** ${new Date().toISOString()}`,
  ].join("\n");

  await Bun.write(responsePath, content);

  // Send to PM via tmux
  const instruction = `Read ${responsePath} -- escalation response from user.`;
  const escaped = instruction.replace(/'/g, "'\\''");
  const result = await exec(
    `tmux send-keys -t ${PM_TMUX_SESSION}:claude -l '${escaped}' && tmux send-keys -t ${PM_TMUX_SESSION}:claude Enter`
  );

  if (!result.success) {
    return new Response(
      JSON.stringify({ error: "PM session not available", details: result.stderr }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(
    JSON.stringify({ success: true, responseFile: responsePath }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
