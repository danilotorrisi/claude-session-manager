import { exec } from "./ssh";

/**
 * Tmux pane capture and multiline message utilities.
 *
 * ## Manual testing
 *
 * capturePane — requires any tmux session:
 *   tmux new-session -d -s test-cap -n main
 *   tmux send-keys -t test-cap:main 'echo hello' Enter
 *   bun -e 'import{capturePane}from"./src/lib/pane-capture";console.log(await capturePane("test-cap",10,"main"))'
 *   tmux kill-session -t test-cap
 *
 * stripAnsi:
 *   bun -e 'import{stripAnsi}from"./src/lib/pane-capture";console.log(stripAnsi("\x1b[31mred\x1b[0m"))'
 *   # Expected: "red"
 */

/**
 * Capture the contents of a tmux pane.
 * @param sessionName Full tmux session name (e.g. "csm-my-feature")
 * @param lines Number of lines to capture from the bottom (default 50)
 * @param windowName Optional window name (e.g. "claude")
 */
export async function capturePane(
  sessionName: string,
  lines: number = 50,
  windowName?: string
): Promise<string> {
  const target = windowName ? `${sessionName}:${windowName}` : sessionName;
  const result = await exec(
    `tmux capture-pane -t ${target} -p -S -${lines} 2>/dev/null`
  );
  if (!result.success) return "";
  return stripAnsi(result.stdout);
}

/**
 * Strip ANSI escape codes from text.
 */
export function stripAnsi(text: string): string {
  // Match all ANSI escape sequences: CSI sequences, OSC sequences, and simple escapes
  return text.replace(
    // eslint-disable-next-line no-control-regex
    /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g,
    ""
  );
}

/**
 * Send a multiline message to a tmux session by writing to a temp file
 * and instructing Claude to read it. Avoids shell escaping issues.
 * @param sessionName Full tmux session name
 * @param message The message content
 * @param prefix Text to prepend to the "Read" instruction
 * @returns Path to the temp file written
 */
export async function sendMultilineToSession(
  sessionName: string,
  message: string,
  prefix: string = ""
): Promise<string> {
  const ts = Date.now();
  const tmpPath = `/tmp/csm-msg-${ts}.md`;
  await Bun.write(tmpPath, message);

  const instruction = prefix
    ? `${prefix} Read ${tmpPath}`
    : `Read ${tmpPath}`;

  // Send the instruction to the claude window
  const escaped = instruction.replace(/'/g, "'\\''");
  await exec(
    `tmux send-keys -t ${sessionName}:claude -l '${escaped}' && tmux send-keys -t ${sessionName}:claude Enter`
  );

  return tmpPath;
}
