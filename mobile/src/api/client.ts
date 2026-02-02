import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "csm_server_url";
const DEFAULT_URL = "http://localhost:3000";
const TIMEOUT_MS = 5000;

let cachedUrl: string | null = null;

export async function getServerUrl(): Promise<string> {
  if (cachedUrl) return cachedUrl;
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  cachedUrl = stored || DEFAULT_URL;
  return cachedUrl;
}

export async function setServerUrl(url: string): Promise<void> {
  cachedUrl = url;
  await AsyncStorage.setItem(STORAGE_KEY, url);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const baseUrl = await getServerUrl();
  const url = new URL(path, baseUrl);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, String(value));
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new ApiError(response.status, `API error: ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error).name === "AbortError") {
      throw new ApiError(0, "Request timed out");
    }
    throw new ApiError(0, (error as Error).message || "Network error");
  } finally {
    clearTimeout(timeout);
  }
}
