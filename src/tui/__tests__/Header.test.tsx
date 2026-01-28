import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Header } from "../components/Header";

describe("Header component", () => {
  test("renders default title", () => {
    const { lastFrame } = render(<Header />);

    expect(lastFrame()).toContain("Claude Session Manager");
  });

  test("renders custom title", () => {
    const { lastFrame } = render(<Header title="Custom Title" />);

    expect(lastFrame()).toContain("Custom Title");
  });

  test("renders with border", () => {
    const { lastFrame } = render(<Header />);
    const frame = lastFrame();

    // Check for round border characters
    expect(frame).toContain("╭");
    expect(frame).toContain("╰");
  });
});
