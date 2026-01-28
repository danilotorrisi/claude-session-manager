import { describe, expect, test } from "bun:test";
import { appReducer, initialState } from "../types";
import type { AppState, AppAction } from "../types";

describe("TUI state management", () => {
  describe("initialState", () => {
    test("has correct default values", () => {
      expect(initialState.view).toBe("dashboard");
      expect(initialState.sessions).toEqual([]);
      expect(initialState.selectedSession).toBeNull();
      expect(initialState.loading).toBe(true);
      expect(initialState.error).toBeNull();
      expect(initialState.message).toBeNull();
    });
  });

  describe("appReducer", () => {
    test("SET_VIEW changes view and clears error", () => {
      const state: AppState = { ...initialState, error: "some error" };
      const action: AppAction = { type: "SET_VIEW", view: "create" };

      const result = appReducer(state, action);

      expect(result.view).toBe("create");
      expect(result.error).toBeNull();
    });

    test("SET_SESSIONS updates sessions and sets loading to false", () => {
      const sessions = [
        {
          name: "test",
          fullName: "csm-test",
          attached: false,
          windows: 1,
          created: new Date().toISOString(),
        },
      ];
      const action: AppAction = { type: "SET_SESSIONS", sessions };

      const result = appReducer(initialState, action);

      expect(result.sessions).toEqual(sessions);
      expect(result.loading).toBe(false);
    });

    test("SELECT_SESSION updates selectedSession", () => {
      const session = {
        name: "test",
        fullName: "csm-test",
        attached: true,
        windows: 2,
        created: new Date().toISOString(),
      };
      const action: AppAction = { type: "SELECT_SESSION", session };

      const result = appReducer(initialState, action);

      expect(result.selectedSession).toEqual(session);
    });

    test("SELECT_SESSION can set to null", () => {
      const state: AppState = {
        ...initialState,
        selectedSession: {
          name: "test",
          fullName: "csm-test",
          attached: false,
          windows: 1,
          created: new Date().toISOString(),
        },
      };
      const action: AppAction = { type: "SELECT_SESSION", session: null };

      const result = appReducer(state, action);

      expect(result.selectedSession).toBeNull();
    });

    test("SET_LOADING updates loading state", () => {
      const action: AppAction = { type: "SET_LOADING", loading: true };

      const result = appReducer({ ...initialState, loading: false }, action);

      expect(result.loading).toBe(true);
    });

    test("SET_ERROR updates error and sets loading to false", () => {
      const state: AppState = { ...initialState, loading: true };
      const action: AppAction = { type: "SET_ERROR", error: "Something went wrong" };

      const result = appReducer(state, action);

      expect(result.error).toBe("Something went wrong");
      expect(result.loading).toBe(false);
    });

    test("SET_ERROR can clear error with null", () => {
      const state: AppState = { ...initialState, error: "old error" };
      const action: AppAction = { type: "SET_ERROR", error: null };

      const result = appReducer(state, action);

      expect(result.error).toBeNull();
    });

    test("SET_MESSAGE updates message", () => {
      const action: AppAction = { type: "SET_MESSAGE", message: "Session created!" };

      const result = appReducer(initialState, action);

      expect(result.message).toBe("Session created!");
    });

    test("CLEAR_MESSAGE sets message to null", () => {
      const state: AppState = { ...initialState, message: "some message" };
      const action: AppAction = { type: "CLEAR_MESSAGE" };

      const result = appReducer(state, action);

      expect(result.message).toBeNull();
    });

    test("returns same state for unknown action", () => {
      const action = { type: "UNKNOWN_ACTION" } as unknown as AppAction;

      const result = appReducer(initialState, action);

      expect(result).toEqual(initialState);
    });
  });
});
