import { describe, expect, test } from "bun:test";
import { getSessionName, parseSessionName } from "../lib/tmux";

describe("tmux utilities", () => {
  describe("getSessionName", () => {
    test("prefixes session name with csm-", () => {
      expect(getSessionName("my-feature")).toBe("csm-my-feature");
    });

    test("handles simple names", () => {
      expect(getSessionName("test")).toBe("csm-test");
    });

    test("handles names with numbers", () => {
      expect(getSessionName("feature-123")).toBe("csm-feature-123");
    });

    test("handles underscores", () => {
      expect(getSessionName("my_feature")).toBe("csm-my_feature");
    });
  });

  describe("parseSessionName", () => {
    test("extracts name from csm- prefixed session", () => {
      expect(parseSessionName("csm-my-feature")).toBe("my-feature");
    });

    test("returns null for non-csm sessions", () => {
      expect(parseSessionName("other-session")).toBeNull();
    });

    test("returns null for empty string", () => {
      expect(parseSessionName("")).toBeNull();
    });

    test("handles csm- prefix only", () => {
      expect(parseSessionName("csm-")).toBe("");
    });

    test("handles names with multiple hyphens", () => {
      expect(parseSessionName("csm-my-long-feature-name")).toBe("my-long-feature-name");
    });
  });
});
