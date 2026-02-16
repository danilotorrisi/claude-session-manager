import { apiClient } from './client';

interface DiffResponse {
  diff: string;
}

/** Fetch unified diff for a specific file in a session. */
export async function getFileDiff(sessionName: string, filePath: string): Promise<string> {
  const response = await apiClient.get<DiffResponse>(
    `/api/sessions/${encodeURIComponent(sessionName)}/diff`,
    { params: { file: filePath } }
  );
  return response.data.diff;
}
