import React from "react";
import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { SessionList } from "../components/SessionList";
import type { Session } from "../../types";

const mockSessions: Session[] = [
  {
    name: "feature-one",
    fullName: "csm-feature-one",
    attached: true,
    windows: 2,
    created: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    title: "Add login feature",
  },
  {
    name: "bugfix-123",
    fullName: "csm-bugfix-123",
    attached: false,
    windows: 1,
    created: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    title: "Fix auth bug",
  },
  {
    name: "refactor",
    fullName: "csm-refactor",
    attached: false,
    windows: 3,
    created: new Date(Date.now() - 604800000).toISOString(), // 1 week ago
    // No title for this one
  },
];

describe("SessionList component", () => {
  describe("empty state", () => {
    test("shows empty message when no sessions", () => {
      const { lastFrame } = render(
        <SessionList
          sessions={[]}
          selectedIndex={0}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      );

      expect(lastFrame()).toContain("No active sessions");
      expect(lastFrame()).toContain("Press [c] to create");
    });
  });

  describe("with sessions", () => {
    test("renders session names", () => {
      const { lastFrame } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      );
      const frame = lastFrame();

      expect(frame).toContain("feature-one");
      expect(frame).toContain("bugfix-123");
      expect(frame).toContain("refactor");
    });

    test("renders column headers", () => {
      const { lastFrame } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      );
      const frame = lastFrame();

      expect(frame).toContain("SESSION");
      expect(frame).toContain("STATUS");
      expect(frame).toContain("AGE");
      expect(frame).toContain("TITLE");
    });

    test("shows attached status for attached sessions", () => {
      const { lastFrame } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      );

      expect(lastFrame()).toContain("attached");
    });

    test("shows detached status for detached sessions", () => {
      const { lastFrame } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      );

      expect(lastFrame()).toContain("detached");
    });

    test("shows selection indicator on selected row", () => {
      const { lastFrame } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      );

      expect(lastFrame()).toContain("›");
    });

    test("shows relative time for recent sessions", () => {
      const { lastFrame } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      );
      const frame = lastFrame();

      // Should show relative times like "1h ago", "1d ago"
      expect(frame).toMatch(/\d+[hmd] ago/);
    });

    test("shows session titles", () => {
      const { lastFrame } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={() => {}}
          onActivate={() => {}}
        />
      );
      const frame = lastFrame();

      expect(frame).toContain("Add login feature");
      expect(frame).toContain("Fix auth bug");
      expect(frame).toContain("-"); // No title shows as "-"
    });
  });

  describe("keyboard navigation", () => {
    test("calls onSelect with new index on arrow down", () => {
      const onSelect = mock(() => {});
      const { stdin } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={onSelect}
          onActivate={() => {}}
        />
      );

      stdin.write("\x1B[B"); // Down arrow

      expect(onSelect).toHaveBeenCalledWith(1);
    });

    test("calls onSelect with new index on arrow up", () => {
      const onSelect = mock(() => {});
      const { stdin } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={1}
          onSelect={onSelect}
          onActivate={() => {}}
        />
      );

      stdin.write("\x1B[A"); // Up arrow

      expect(onSelect).toHaveBeenCalledWith(0);
    });

    test("does not go below 0 on arrow up at top", () => {
      const onSelect = mock(() => {});
      const { stdin } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={0}
          onSelect={onSelect}
          onActivate={() => {}}
        />
      );

      stdin.write("\x1B[A"); // Up arrow

      expect(onSelect).toHaveBeenCalledWith(0);
    });

    test("does not exceed list length on arrow down at bottom", () => {
      const onSelect = mock(() => {});
      const { stdin } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={2}
          onSelect={onSelect}
          onActivate={() => {}}
        />
      );

      stdin.write("\x1B[B"); // Down arrow

      expect(onSelect).toHaveBeenCalledWith(2);
    });

    test("calls onActivate on enter", () => {
      const onActivate = mock(() => {});
      const { stdin } = render(
        <SessionList
          sessions={mockSessions}
          selectedIndex={1}
          onSelect={() => {}}
          onActivate={onActivate}
        />
      );

      stdin.write("\r"); // Enter

      expect(onActivate).toHaveBeenCalledWith(mockSessions[1]);
    });
  });
});
