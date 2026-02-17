import { apiClient } from './client';
import type { Session } from '../types';

export interface SessionWithWs extends Session {
  wsConnected?: boolean;
  wsStatus?: string;
  wsModel?: string;
  wsTurnCount?: number;
  wsCost?: number;
  pendingApproval?: {
    requestId: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    toolUseId: string;
    description?: string;
    receivedAt: number;
  } | null;
}

interface ListSessionsResponse {
  sessions: SessionWithWs[];
}

/** Fetch all sessions with merged WebSocket state. */
export async function fetchSessions(): Promise<SessionWithWs[]> {
  const response = await apiClient.get<ListSessionsResponse>('/api/sessions');
  return response.data.sessions;
}

/** Fetch a single session by name. */
export async function fetchSession(name: string): Promise<SessionWithWs | undefined> {
  const sessions = await fetchSessions();
  return sessions.find((s) => s.name === name);
}

/** Kill (terminate) a session by name. */
export async function killSession(name: string): Promise<void> {
  await apiClient.post(`/api/sessions/${encodeURIComponent(name)}/kill`);
}

/** Reconnect a session: restart Claude Code with --sdk-url and --continue. */
export async function reconnectSession(name: string): Promise<void> {
  await apiClient.post(`/api/sessions/${encodeURIComponent(name)}/reconnect`);
}
