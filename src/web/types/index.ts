// Re-export types from core library
export type {
  Session,
  Project,
  HostConfig,
  Config,
  LinearIssue,
  GitStats,
  GitFileChange,
  FeedbackReport,
} from '@/types';

export type {
  WsSessionState,
  WsSessionEvent,
  PendingToolApproval,
  WsSessionStatus,
  ContentBlock,
  TextBlock,
  ToolUseBlock,
  McpServerInfo,
  ModelUsageEntry,
} from '@/lib/ws-types';

// Web-specific log entry type
export interface StreamLogEntry {
  timestamp: string;
  type: 'message' | 'tool' | 'result' | 'error' | 'system' | 'user';
  content: string;
  metadata?: Record<string, unknown>;
}

// Web-specific types
export interface AuthState {
  token: string | null;
  isAuthenticated: boolean;
  login: (token: string) => void;
  logout: () => void;
}

export interface UIState {
  theme: 'light' | 'dark' | 'system';
  sidebarOpen: boolean;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

export interface SessionGroup {
  id: string;
  name: string;
  sessionNames: string[];
}

export interface SessionStoreState {
  groups: SessionGroup[];
  favorites: string[];
  addGroup: (name: string) => void;
  removeGroup: (id: string) => void;
  addSessionToGroup: (groupId: string, sessionName: string) => void;
  removeSessionFromGroup: (groupId: string, sessionName: string) => void;
  toggleFavorite: (sessionName: string) => void;
}

export interface ApprovalStoreState {
  pendingApprovals: Map<string, import('@/lib/ws-types').PendingToolApproval>;
  addApproval: (sessionName: string, approval: import('@/lib/ws-types').PendingToolApproval) => void;
  removeApproval: (sessionName: string) => void;
  clearAll: () => void;
}
