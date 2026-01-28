import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { StatusBar } from "../components/StatusBar";

describe("StatusBar component", () => {
  test("shows loading state with spinner", () => {
    const { lastFrame } = render(
      <StatusBar
        loading={true}
        error={null}
        message={null}
        sessionCount={0}
      />
    );

    expect(lastFrame()).toContain("Loading sessions");
  });

  test("shows error message", () => {
    const { lastFrame } = render(
      <StatusBar
        loading={false}
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
        loading={false}
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
        loading={false}
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
        loading={false}
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
        loading={false}
        error={null}
        message={null}
        sessionCount={0}
      />
    );

    expect(lastFrame()).toContain("0 sessions active");
  });

  test("prioritizes loading over other states", () => {
    const { lastFrame } = render(
      <StatusBar
        loading={true}
        error="Some error"
        message="Some message"
        sessionCount={5}
      />
    );

    expect(lastFrame()).toContain("Loading");
    expect(lastFrame()).not.toContain("Some error");
    expect(lastFrame()).not.toContain("Some message");
  });

  test("prioritizes error over message and count", () => {
    const { lastFrame } = render(
      <StatusBar
        loading={false}
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
        loading={false}
        error={null}
        message="Operation complete"
        sessionCount={5}
      />
    );

    expect(lastFrame()).toContain("Operation complete");
    expect(lastFrame()).not.toContain("5 sessions");
  });
});
