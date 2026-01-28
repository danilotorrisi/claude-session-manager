import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { StatusBar } from "../components/StatusBar";

describe("StatusBar component", () => {
  test("shows error message", () => {
    const { lastFrame } = render(
      <StatusBar
        error="Connection failed"
        message={null}
        sessionCount={0}
      />
    );

    expect(lastFrame()).toContain("Connection failed");
    expect(lastFrame()).toContain("✗");
  });

  test("shows success message", () => {
    const { lastFrame } = render(
      <StatusBar
        error={null}
        message="Session created!"
        sessionCount={0}
      />
    );

    expect(lastFrame()).toContain("Session created!");
    expect(lastFrame()).toContain("✓");
  });

  test("shows session count when idle", () => {
    const { lastFrame } = render(
      <StatusBar
        error={null}
        message={null}
        sessionCount={3}
      />
    );

    expect(lastFrame()).toContain("3 sessions active");
  });

  test("shows singular session text for 1 session", () => {
    const { lastFrame } = render(
      <StatusBar
        error={null}
        message={null}
        sessionCount={1}
      />
    );

    expect(lastFrame()).toContain("1 session active");
    expect(lastFrame()).not.toContain("sessions");
  });

  test("shows 0 sessions", () => {
    const { lastFrame } = render(
      <StatusBar
        error={null}
        message={null}
        sessionCount={0}
      />
    );

    expect(lastFrame()).toContain("0 sessions active");
  });

  test("prioritizes error over message and count", () => {
    const { lastFrame } = render(
      <StatusBar
        error="Error occurred"
        message="Success message"
        sessionCount={5}
      />
    );

    expect(lastFrame()).toContain("Error occurred");
    expect(lastFrame()).not.toContain("Success message");
  });

  test("prioritizes message over count", () => {
    const { lastFrame } = render(
      <StatusBar
        error={null}
        message="Operation complete"
        sessionCount={5}
      />
    );

    expect(lastFrame()).toContain("Operation complete");
    expect(lastFrame()).not.toContain("5 sessions");
  });
});
