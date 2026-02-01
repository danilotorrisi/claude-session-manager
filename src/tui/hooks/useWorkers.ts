import { useEffect, useRef, useCallback, useState } from "react";
import { hostname } from "os";
import type { AppAction, RegisteredWorker, WorkerDisplayInfo } from "../types";

const POLL_INTERVAL = 5_000;
const DEFAULT_MASTER_URL = `http://localhost:${process.env.CSM_API_PORT || "3000"}`;
const LOCAL_HOSTNAME = hostname();

function getMasterUrl(): string {
  return process.env.CSM_MASTER_URL || DEFAULT_MASTER_URL;
}

export function normalizeHostname(h: string): string {
  return h.replace(/\.local$/, "").toLowerCase();
}

export function isLocalWorker(workerHostname: string | undefined, tuiHostname: string): boolean {
  if (!workerHostname) return false;
  return normalizeHostname(workerHostname) === normalizeHostname(tuiHostname);
}

export function useWorkers(dispatch: React.Dispatch<AppAction>) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [masterReachable, setMasterReachable] = useState<boolean | null>(null);

  const fetchWorkers = useCallback(async () => {
    try {
      const response = await fetch(`${getMasterUrl()}/api/workers`, {
        signal: AbortSignal.timeout(3000),
      });

      if (!response.ok) {
        setMasterReachable(false);
        return;
      }

      setMasterReachable(true);
      const data: { workers: RegisteredWorker[] } = await response.json();

      const enriched: WorkerDisplayInfo[] = data.workers
        .map((w) => ({
          ...w,
          isLocal: isLocalWorker(w.hostInfo?.hostname, LOCAL_HOSTNAME),
        }))
        .sort((a, b) => {
          // Local first
          if (a.isLocal && !b.isLocal) return -1;
          if (!a.isLocal && b.isLocal) return 1;
          // Then by id
          return a.id.localeCompare(b.id);
        });

      dispatch({ type: "SET_WORKERS", workers: enriched });
    } catch {
      setMasterReachable(false);
    }
  }, [dispatch]);

  const refresh = useCallback(async () => {
    await fetchWorkers();
  }, [fetchWorkers]);

  useEffect(() => {
    fetchWorkers();

    intervalRef.current = setInterval(() => {
      fetchWorkers();
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchWorkers]);

  return { refresh, masterReachable };
}
