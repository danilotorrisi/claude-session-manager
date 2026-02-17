import { copyFileSync, unlinkSync } from "fs";
import { readFile as readFileAsync } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { execSync } from "child_process";
import { createDecipheriv, pbkdf2Sync } from "crypto";
import { Database } from "bun:sqlite";

export interface UsageTier {
  utilization: number;
  resetsAt: string;
}

export interface ClaudeUsageData {
  session: UsageTier;
  weekly: UsageTier;
  sonnet: UsageTier;
  plan: string;
}

interface OAuthCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number | string;
    scopes?: string[];
  };
}

interface KeychainEntry {
  data: string; // base64-encoded JSON
  storedAt: string;
}

const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CODEXBAR_KEYCHAIN_SERVICE = "com.steipete.codexbar.cache";
const CODEXBAR_KEYCHAIN_ACCOUNT = "oauth.claude";
const CLAUDE_CODE_KEYCHAIN_SERVICE = "Claude Code-credentials";

// In-memory cache
let cachedResult: { data: ClaudeUsageData; fetchedAt: number } | null = null;
const CACHE_TTL = 30_000; // 30 seconds

// ─── OAuth credential loading ────────────────────────────────

async function readCredentialsFromFile(): Promise<OAuthCredentials | null> {
  try {
    const raw = await readFileAsync(CREDENTIALS_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readCredentialsFromKeychain(service: string, account?: string): OAuthCredentials | null {
  try {
    const cmd = account
      ? `security find-generic-password -s "${service}" -a "${account}" -w 2>/dev/null`
      : `security find-generic-password -s "${service}" -w 2>/dev/null`;
    const raw = execSync(cmd, { encoding: "utf-8", timeout: 5000 }).trim();

    // CodexBar stores base64-encoded JSON inside a wrapper
    if (service === CODEXBAR_KEYCHAIN_SERVICE) {
      const entry: KeychainEntry = JSON.parse(raw);
      const decoded = Buffer.from(entry.data, "base64").toString("utf-8");
      return JSON.parse(decoded);
    }

    // Claude Code stores plain JSON
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getOAuthToken(): Promise<string | null> {
  // Try multiple sources for OAuth credentials with user:profile scope
  const sources: Array<{ creds: OAuthCredentials | null; label: string }> = [
    { creds: await readCredentialsFromFile(), label: "file" },
    { creds: readCredentialsFromKeychain(CODEXBAR_KEYCHAIN_SERVICE, CODEXBAR_KEYCHAIN_ACCOUNT), label: "codexbar-keychain" },
    { creds: readCredentialsFromKeychain(CLAUDE_CODE_KEYCHAIN_SERVICE), label: "claude-code-keychain" },
  ];

  for (const { creds } of sources) {
    const oauth = creds?.claudeAiOauth;
    if (!oauth?.accessToken) continue;

    // Check expiry
    const expiresAtMs = getExpiresAtMs(oauth.expiresAt);
    if (expiresAtMs < Date.now() + 60_000) continue; // expired

    return oauth.accessToken;
  }

  return null;
}

/** Normalize utilization to 0-1 range (Web API returns 0-100, OAuth returns 0-1). */
function normalizeUtilization(value: number): number {
  return value > 1 ? value / 100 : value;
}

function getExpiresAtMs(expiresAt: number | string): number {
  if (typeof expiresAt === "number") {
    return expiresAt > 1e12 ? expiresAt : expiresAt * 1000;
  }
  return new Date(expiresAt).getTime();
}

// ─── OAuth API approach ──────────────────────────────────────

async function fetchUsageViaOAuth(token: string): Promise<ClaudeUsageData | null> {
  const res = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      Accept: "application/json",
    },
  });

  if (res.status === 403) {
    // Scope issue — fall through to web approach
    return null;
  }

  if (!res.ok) {
    throw new Error(`OAuth usage API failed: ${res.status}`);
  }

  const raw = await res.json();
  return parseOAuthUsageResponse(raw);
}

function parseOAuthUsageResponse(raw: any): ClaudeUsageData {
  return {
    session: {
      utilization: normalizeUtilization(raw.fiveHour?.utilization ?? raw.five_hour?.utilization ?? raw.session?.utilization ?? 0),
      resetsAt: raw.fiveHour?.resetsAt ?? raw.five_hour?.resets_at ?? raw.session?.resets_at ?? "",
    },
    weekly: {
      utilization: normalizeUtilization(raw.sevenDay?.utilization ?? raw.seven_day?.utilization ?? raw.weekly?.utilization ?? 0),
      resetsAt: raw.sevenDay?.resetsAt ?? raw.seven_day?.resets_at ?? raw.weekly?.resets_at ?? "",
    },
    sonnet: {
      utilization: normalizeUtilization(raw.sevenDaySonnet?.utilization ?? raw.seven_day_sonnet?.utilization ?? raw.sonnet?.utilization ?? 0),
      resetsAt: raw.sevenDaySonnet?.resetsAt ?? raw.seven_day_sonnet?.resets_at ?? raw.sonnet?.resets_at ?? "",
    },
    plan: raw.plan ?? "unknown",
  };
}

// ─── Web API approach (Chrome cookie) ────────────────────────

function extractChromeSessionKey(): string | null {
  try {
    // Get Chrome's encryption key from Keychain
    const chromeKey = execSync(
      'security find-generic-password -s "Chrome Safe Storage" -w',
      { encoding: "utf-8", timeout: 5000 }
    ).trim();
    const derivedKey = pbkdf2Sync(chromeKey, "saltysalt", 1003, 16, "sha1");

    // Find the Chrome cookie DB (try Default profile and numbered profiles)
    const chromeBase = join(homedir(), "Library/Application Support/Google/Chrome");
    const profiles = ["Default", "Profile 1", "Profile 2", "Profile 3"];

    for (const profile of profiles) {
      const cookieDbPath = join(chromeBase, profile, "Cookies");
      try {
        const tmpPath = `/tmp/csm-chrome-cookies-${Date.now()}.db`;
        copyFileSync(cookieDbPath, tmpPath);

        const db = new Database(tmpPath, { readonly: true });
        const rows = db
          .query("SELECT encrypted_value FROM cookies WHERE host_key = '.claude.ai' AND name = 'sessionKey'")
          .all() as Array<{ encrypted_value: Buffer }>;

        db.close();
        unlinkSync(tmpPath);

        for (const row of rows) {
          const enc = Buffer.from(row.encrypted_value);
          if (enc.subarray(0, 3).toString("ascii") !== "v10") continue;

          const iv = Buffer.alloc(16, " ");
          const decipher = createDecipheriv("aes-128-cbc", derivedKey, iv);
          let decrypted = decipher.update(enc.subarray(3));
          decrypted = Buffer.concat([decrypted, decipher.final()]);
          const value = decrypted.toString("utf-8");

          // The decrypted value may have binary prefix bytes before the actual token
          const match = value.match(/sk-ant-[\w-]+/);
          if (match) {
            return match[0];
          }
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Chrome not available or Keychain access denied
  }
  return null;
}

async function fetchUsageViaWebAPI(sessionKey: string): Promise<ClaudeUsageData> {
  const cookieHeader = `sessionKey=${sessionKey}`;

  // Step 1: Get organization ID
  const orgRes = await fetch("https://claude.ai/api/organizations", {
    headers: {
      Cookie: cookieHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!orgRes.ok) {
    throw new Error(`Failed to fetch organizations: ${orgRes.status}`);
  }

  const orgs: any[] = await orgRes.json();
  // Pick the first org with chat capability (non-API-only)
  const org = orgs.find((o: any) =>
    o.capabilities?.includes("chat") || !o.api_disabled_at
  ) ?? orgs[0];

  if (!org?.uuid) {
    throw new Error("No Claude organization found");
  }

  // Step 2: Fetch usage
  const usageRes = await fetch(`https://claude.ai/api/organizations/${org.uuid}/usage`, {
    headers: {
      Cookie: cookieHeader,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  if (!usageRes.ok) {
    throw new Error(`Failed to fetch usage: ${usageRes.status}`);
  }

  const raw = await usageRes.json();

  return {
    session: {
      utilization: normalizeUtilization(raw.five_hour?.utilization ?? 0),
      resetsAt: raw.five_hour?.resets_at ?? "",
    },
    weekly: {
      utilization: normalizeUtilization(raw.seven_day?.utilization ?? 0),
      resetsAt: raw.seven_day?.resets_at ?? "",
    },
    sonnet: {
      utilization: normalizeUtilization(raw.seven_day_sonnet?.utilization ?? raw.seven_day_opus?.utilization ?? 0),
      resetsAt: raw.seven_day_sonnet?.resets_at ?? raw.seven_day_opus?.resets_at ?? "",
    },
    plan: org.billing_type ?? org.active_subscription?.plan ?? "unknown",
  };
}

// ─── Main entry point ────────────────────────────────────────

export async function fetchClaudeUsage(): Promise<ClaudeUsageData> {
  // Return cached result if fresh
  if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL) {
    return cachedResult.data;
  }

  // Strategy 1: Try OAuth API
  const token = await getOAuthToken();
  if (token) {
    const oauthResult = await fetchUsageViaOAuth(token).catch(() => null);
    if (oauthResult) {
      cachedResult = { data: oauthResult, fetchedAt: Date.now() };
      return oauthResult;
    }
  }

  // Strategy 2: Try Web API with Chrome session cookie
  const sessionKey = extractChromeSessionKey();
  if (sessionKey) {
    const webResult = await fetchUsageViaWebAPI(sessionKey);
    cachedResult = { data: webResult, fetchedAt: Date.now() };
    return webResult;
  }

  throw new Error(
    "No Claude credentials available. Need either an OAuth token with user:profile scope or an active claude.ai session in Chrome."
  );
}
