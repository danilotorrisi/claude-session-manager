import { apiClient } from './client';

interface SendMessageResponse {
  success: boolean;
  method: 'websocket' | 'tmux';
}

/** Send a user message to a session (via WebSocket or tmux fallback). */
export async function sendMessage(
  sessionName: string,
  text: string,
): Promise<SendMessageResponse> {
  const response = await apiClient.post<SendMessageResponse>(
    `/api/sessions/${encodeURIComponent(sessionName)}/message`,
    { text },
  );
  return response.data;
}
