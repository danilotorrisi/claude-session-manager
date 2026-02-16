import { apiClient } from './client';

interface ApproveToolResponse {
  success: boolean;
}

/** Approve a pending tool use request. */
export async function approveTool(
  sessionName: string,
  requestId: string,
): Promise<boolean> {
  const response = await apiClient.post<ApproveToolResponse>(
    `/api/sessions/${encodeURIComponent(sessionName)}/approve-tool`,
    { requestId, action: 'allow' },
  );
  return response.data.success;
}

/** Deny a pending tool use request with an optional message. */
export async function denyTool(
  sessionName: string,
  requestId: string,
  message?: string,
): Promise<boolean> {
  const response = await apiClient.post<ApproveToolResponse>(
    `/api/sessions/${encodeURIComponent(sessionName)}/approve-tool`,
    { requestId, action: 'deny', message },
  );
  return response.data.success;
}
