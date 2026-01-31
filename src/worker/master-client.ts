import type { WorkerEvent } from "./types";

export class MasterClient {
  private masterUrl: string | undefined;
  private enabled: boolean;

  constructor(masterUrl?: string) {
    this.masterUrl = masterUrl;
    this.enabled = !!masterUrl;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async pushEvent(event: WorkerEvent): Promise<boolean> {
    if (!this.enabled || !this.masterUrl) {
      return false;
    }

    try {
      const response = await fetch(`${this.masterUrl}/api/worker-events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5000), // 5s timeout
      });

      if (!response.ok) {
        console.error(
          `Failed to push event: ${response.status} ${response.statusText}`
        );
        return false;
      }

      return true;
    } catch (error) {
      // Master not available, will retry later
      if (error instanceof Error) {
        console.debug(`Master unavailable: ${error.message}`);
      }
      return false;
    }
  }

  async checkAvailability(): Promise<boolean> {
    if (!this.enabled || !this.masterUrl) {
      return false;
    }

    try {
      const response = await fetch(`${this.masterUrl}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async syncState(sessions: any[]): Promise<boolean> {
    if (!this.enabled || !this.masterUrl) {
      return false;
    }

    try {
      const response = await fetch(`${this.masterUrl}/api/worker-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sessions }),
        signal: AbortSignal.timeout(10000),
      });

      return response.ok;
    } catch (error) {
      console.error("Failed to sync state:", error);
      return false;
    }
  }
}
