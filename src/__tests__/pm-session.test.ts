import { describe, expect, test } from "bun:test";
import { PM_SESSION_NAME, PM_TMUX_SESSION } from "../lib/pm-session";

describe("pm-session constants", () => {
  test("PM_SESSION_NAME is 'pm'", () => {
    expect(PM_SESSION_NAME).toBe("pm");
  });

  test("PM_TMUX_SESSION follows csm- prefix convention", () => {
    expect(PM_TMUX_SESSION).toBe("csm-pm");
  });
});
