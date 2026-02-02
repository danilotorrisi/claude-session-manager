import { describe, expect, test } from "bun:test";
import { stripAnsi } from "../lib/pane-capture";

describe("pane-capture", () => {
  describe("stripAnsi", () => {
    test("returns plain text unchanged", () => {
      expect(stripAnsi("hello world")).toBe("hello world");
    });

    test("strips color codes", () => {
      expect(stripAnsi("\x1b[31mred\x1b[0m")).toBe("red");
    });

    test("strips bold/dim/underline codes", () => {
      expect(stripAnsi("\x1b[1mbold\x1b[0m")).toBe("bold");
      expect(stripAnsi("\x1b[2mdim\x1b[0m")).toBe("dim");
      expect(stripAnsi("\x1b[4munderline\x1b[0m")).toBe("underline");
    });

    test("strips 256-color codes", () => {
      expect(stripAnsi("\x1b[38;5;196mred256\x1b[0m")).toBe("red256");
    });

    test("strips cursor movement codes", () => {
      expect(stripAnsi("\x1b[2Amoved up\x1b[3B")).toBe("moved up");
    });

    test("handles empty string", () => {
      expect(stripAnsi("")).toBe("");
    });

    test("handles string with only ANSI codes", () => {
      expect(stripAnsi("\x1b[0m\x1b[1m\x1b[0m")).toBe("");
    });

    test("preserves newlines and whitespace", () => {
      expect(stripAnsi("\x1b[32mline1\x1b[0m\nline2")).toBe("line1\nline2");
    });

    test("strips multiple sequential codes", () => {
      expect(stripAnsi("\x1b[1m\x1b[31m\x1b[42mbold red on green\x1b[0m")).toBe(
        "bold red on green"
      );
    });
  });
});
