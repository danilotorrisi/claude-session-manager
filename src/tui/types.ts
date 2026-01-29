import type { Session, Project, LinearIssue, HostConfig } from "../types";

export type Tab = "sessions" | "projects" | "tasks" | "hosts";
export type View = "dashboard" | "create" | "detail" | "projects";

const tabOrder: Tab[] = ["sessions", "projects", "tasks", "hosts"];

export function nextTab(current: Tab): Tab {
  const idx = tabOrder.indexOf(current);
  return tabOrder[(idx + 1) % tabOrder.length];
}

export interface AppState {
  view: View;
  sessions: Session[];
  selectedSession: Session | null;
  loading: boolean;
  error: string | null;
  message: string | null;
  activeTab: Tab;
  projects: Project[];
  tasks: LinearIssue[];
  hosts: Record<string, HostConfig>;
}

export type AppAction =
  | { type: "SET_VIEW"; view: View }
  | { type: "SET_SESSIONS"; sessions: Session[] }
  | { type: "SELECT_SESSION"; session: Session | null }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null }
  | { type: "SET_MESSAGE"; message: string | null }
  | { type: "CLEAR_MESSAGE" }
  | { type: "SET_TAB"; tab: Tab }
  | { type: "SET_PROJECTS"; projects: Project[] }
  | { type: "SET_TASKS"; tasks: LinearIssue[] }
  | { type: "SET_HOSTS"; hosts: Record<string, HostConfig> };

export const initialState: AppState = {
  view: "dashboard",
  sessions: [],
  selectedSession: null,
  loading: true,
  error: null,
  message: null,
  activeTab: "sessions",
  projects: [],
  tasks: [],
  hosts: {},
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
    case "SET_TAB":
      return { ...state, activeTab: action.tab };
    case "SET_PROJECTS":
      return { ...state, projects: action.projects };
    case "SET_TASKS":
      return { ...state, tasks: action.tasks };
    case "SET_HOSTS":
      return { ...state, hosts: action.hosts };
    default:
      return state;
  }
}
