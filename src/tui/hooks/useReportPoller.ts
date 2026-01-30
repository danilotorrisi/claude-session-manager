import { useEffect, useRef, useCallback } from "react";
import { pollAllSessionReports } from "../../lib/report-uploader";
import { getR2Config, isFeedbackEnabled } from "../../lib/config";
import type { Session, R2Config, FeedbackReport } from "../../types";

const POLL_INTERVAL = 5000;

export function useReportPoller(sessions: Session[]) {
  const processedRef = useRef(new Set<string>());
  const r2ConfigRef = useRef<R2Config | undefined>(undefined);
  const enabledRef = useRef(false);
  const latestReportRef = useRef<FeedbackReport | null>(null);

  // Load R2 config on mount and periodically
  useEffect(() => {
    const loadConfig = async () => {
      r2ConfigRef.current = await getR2Config();
      enabledRef.current = await isFeedbackEnabled();
    };
    loadConfig();
    const configInterval = setInterval(loadConfig, 30000);
    return () => clearInterval(configInterval);
  }, []);

  useEffect(() => {
    if (sessions.length === 0) return;

    const poll = async () => {
      if (!enabledRef.current) return;
      const report = await pollAllSessionReports(
        sessions,
        r2ConfigRef.current,
        processedRef.current
      );
      if (report) {
        latestReportRef.current = report;
      }
    };

    const interval = setInterval(poll, POLL_INTERVAL);
    // Run immediately on first mount
    poll();

    return () => clearInterval(interval);
  }, [sessions]);

  const getLatestReport = useCallback(() => {
    return latestReportRef.current;
  }, []);

  return { getLatestReport };
}
