import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Footer } from "../components/Footer";

describe("Footer component", () => {
  test("renders dashboard keybindings", () => {
    // ink-testing-library renders at a narrow default width, so labels get
    // truncated. We check that key fragments and a representative subset of
    // labels are present somewhere in the frame.
    const { lastFrame } = render(<Footer view="dashboard" />);
    const frame = lastFrame() ?? "";

    // At minimum the key characters and partial labels should appear
    expect(frame).toContain("attach");
    expect(frame).toContain("create");
    expect(frame).toContain("quit");
  });

  test("renders create view keybindings", () => {
    const { lastFrame } = render(<Footer view="create" />);
    const frame = lastFrame() ?? "";

    // The create view has fewer hints so they fit better
    expect(frame).toContain("submit");
    expect(frame).toContain("cancel");
  });

  test("renders detail view keybindings", () => {
    const { lastFrame } = render(<Footer view="detail" />);
    const frame = lastFrame() ?? "";

    expect(frame).toContain("attach");
    expect(frame).toContain("kill");
    expect(frame).toContain("back");
    expect(frame).toContain("quit");
  });

  test("shows key hints with separator dots", () => {
    const { lastFrame } = render(<Footer view="dashboard" />);
    const frame = lastFrame() ?? "";

    expect(frame).toContain("·");
  });
});
