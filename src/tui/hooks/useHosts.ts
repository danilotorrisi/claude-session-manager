import { useEffect, useRef, useCallback } from "react";
import { getHosts } from "../../lib/config";
import { testConnection, getHostInfo, getLocalHostInfo } from "../../lib/ssh";
import type { AppAction, HostStatusInfo } from "../types";

export const LOCAL_HOST_KEY = "__local__";
const POLL_INTERVAL = 30_000;

export function useHosts(dispatch: React.Dispatch<AppAction>) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkLocalHost = useCallback(async () => {
    dispatch({
      type: "SET_HOST_STATUS",
      name: LOCAL_HOST_KEY,
      statusInfo: { status: "checking" },
    });

    const info = await getLocalHostInfo();
    const statusInfo: HostStatusInfo = {
      status: "online",
      hostname: info.hostname,
      os: info.os,
      uptime: info.uptime,
      ramUsage: info.ramUsage,
      lastChecked: Date.now(),
    };

    dispatch({ type: "SET_HOST_STATUS", name: LOCAL_HOST_KEY, statusInfo });
  }, [dispatch]);

  const reload = useCallback(async () => {
    const hosts = await getHosts();
    dispatch({ type: "SET_HOSTS", hosts });
    return hosts;
  }, [dispatch]);

  const checkHost = useCallback(
    async (name: string) => {
      if (name === LOCAL_HOST_KEY) {
        return checkLocalHost();
      }

      dispatch({
        type: "SET_HOST_STATUS",
        name,
        statusInfo: { status: "checking" },
      });

      const result = await testConnection(name);
      const statusInfo: HostStatusInfo = {
        status: result.success ? "online" : "offline",
        latencyMs: result.latencyMs,
        lastChecked: Date.now(),
      };

      if (result.success) {
        const info = await getHostInfo(name);
        if (info) {
          statusInfo.hostname = info.hostname;
          statusInfo.os = info.os;
          statusInfo.uptime = info.uptime;
          statusInfo.ramUsage = info.ramUsage;
        }
      }

      dispatch({ type: "SET_HOST_STATUS", name, statusInfo });
    },
    [dispatch, checkLocalHost]
  );

  const refreshStatus = useCallback(async () => {
    const hosts = await getHosts();
    dispatch({ type: "SET_HOSTS", hosts });
    const names = Object.keys(hosts);
    await Promise.all([
      checkLocalHost(),
      ...names.map((name) => checkHost(name)),
    ]);
  }, [dispatch, checkHost, checkLocalHost]);

  useEffect(() => {
    checkLocalHost();

    reload().then((hosts) => {
      const names = Object.keys(hosts);
      names.forEach((name) => checkHost(name));
    });

    intervalRef.current = setInterval(() => {
      refreshStatus();
    }, POLL_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [reload, checkHost, checkLocalHost, refreshStatus]);

  return { reload, checkHost, refreshStatus };
}
