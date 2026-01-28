import type { Session } from "../types";

export type View = "dashboard" | "create" | "detail";

export interface AppState {
  view: View;
  sessions: Session[];
  selectedSession: Session | null;
  loading: boolean;
  error: string | null;
  message: string | null;
}

export type AppAction =
  | { type: "SET_VIEW"; view: View }
  | { type: "SET_SESSIONS"; sessions: Session[] }
  | { type: "SELECT_SESSION"; session: Session | null }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_MESSAGE"; message: string | null }
  | { type: "CLEAR_MESSAGE" };

export const initialState: AppState = {
  view: "dashboard",
  sessions: [],
  selectedSession: null,
  loading: true,
  error: null,
  message: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_VIEW":
      return { ...state, view: action.view, error: null };
    case "SET_SESSIONS":
      return { ...state, sessions: action.sessions, loading: false };
    case "SELECT_SESSION":
      return { ...state, selectedSession: action.session };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_ERROR":
      return { ...state, error: action.error, loading: false };
    case "SET_MESSAGE":
      return { ...state, message: action.message };
    case "CLEAR_MESSAGE":
      return { ...state, message: null };
    default:
      return state;
  }
}
