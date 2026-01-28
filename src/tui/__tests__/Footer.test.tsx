import React from "react";
import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Footer } from "../components/Footer";

describe("Footer component", () => {
  test("renders dashboard keybindings", () => {
    const { lastFrame } = render(<Footer view="dashboard" />);
    const frame = lastFrame();

    expect(frame).toContain("navigate");
    expect(frame).toContain("attach");
    expect(frame).toContain("create");
    expect(frame).toContain("kill");
    expect(frame).toContain("refresh");
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

  test("shows key hints in brackets", () => {
    const { lastFrame } = render(<Footer view="dashboard" />);
    const frame = lastFrame();

    expect(frame).toContain("[");
    expect(frame).toContain("]");
  });
});
