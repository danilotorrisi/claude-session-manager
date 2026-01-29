import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Footer } from "../components/Footer";

describe("Footer component", () => {
  test("renders dashboard keybindings", () => {
    const { lastFrame } = render(<Footer view="dashboard" />);
    const frame = lastFrame();

    // Key labels may wrap in narrow test terminal, so check for short key hints
    expect(frame).toContain("↑↓");
    expect(frame).toContain("kil");
    expect(frame).toContain("merg");
    expect(frame).toContain("quit");
  });

  test("renders create view keybindings", () => {
    const { lastFrame } = render(<Footer view="create" />);
    const frame = lastFrame();

    expect(frame).toContain("submit");
    expect(frame).toContain("next field");
    expect(frame).toContain("cancel");
  });

  test("renders detail view keybindings", () => {
    const { lastFrame } = render(<Footer view="detail" />);
    const frame = lastFrame();

    expect(frame).toContain("attach");
    expect(frame).toContain("kill");
    expect(frame).toContain("back");
    expect(frame).toContain("quit");
  });

  test("shows key hints with separator dots", () => {
    const { lastFrame } = render(<Footer view="dashboard" />);
    const frame = lastFrame();

    expect(frame).toContain("·");
  });
});
