import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { apiFetch } from "../api/client";
import type {
  HealthResponse,
  WorkersResponse,
  StateResponse,
  EventsResponse,
  Session,
  Worker,
} from "../types";

// ─── useHealth ───────────────────────────────────────────────────────────────
// Polls /api/health every 10 seconds.

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/health"),
    refetchInterval: 10_000,
    staleTime: 8_000,
    retry: 2,
  });
}

// ─── useWorkers ──────────────────────────────────────────────────────────────
// Polls /api/workers every 10 seconds. Selects the `.workers` array.

export function useWorkers() {
  return useQuery<WorkersResponse, Error, Worker[]>({
    queryKey: ["workers"],
    queryFn: () => apiFetch<WorkersResponse>("/api/workers"),
    select: (data) => data.workers,
    refetchInterval: 10_000,
    staleTime: 8_000,
    retry: 2,
  });
}

// ─── useSessions ─────────────────────────────────────────────────────────────
// Polls /api/state every 5 seconds. Selects the `.sessions` array.

export function useSessions() {
  return useQuery<StateResponse, Error, Session[]>({
    queryKey: ["state"],
    queryFn: () => apiFetch<StateResponse>("/api/state"),
    select: (data) => data.sessions,
    refetchInterval: 5_000,
    staleTime: 4_000,
    retry: 2,
  });
}

// ─── useEvents ───────────────────────────────────────────────────────────────
// Polls /api/events every 10 seconds with a configurable limit.

export function useEvents(limit: number = 50) {
  return useQuery<EventsResponse>({
    queryKey: ["events", limit],
    queryFn: () => apiFetch<EventsResponse>(`/api/events?limit=${limit}`),
    refetchInterval: 10_000,
    staleTime: 8_000,
    retry: 2,
  });
}

// ─── useDashboardData ────────────────────────────────────────────────────────
// Combines useHealth() and useSessions() to derive high-level dashboard stats.

export function useDashboardData() {
  const health = useHealth();
  const sessions = useSessions();

  const dashboardData = useMemo(() => {
    const sessionList = sessions.data ?? [];
    const totalSessions = sessionList.length;

    const activeWorkers = health.data?.workers ?? 0;

    const workingCount = sessionList.filter(
      (s) => s.claudeState === "working"
    ).length;

    const waitingCount = sessionList.filter(
      (s) => s.claudeState === "waiting_for_input"
    ).length;

    const isConnected = health.data?.status === "ok";

    return {
      totalSessions,
      activeWorkers,
      workingCount,
      waitingCount,
      isConnected,
    };
  }, [health.data, sessions.data]);

  return {
    ...dashboardData,
    isLoading: health.isLoading || sessions.isLoading,
    isError: health.isError || sessions.isError,
    error: health.error || sessions.error,
  };
}
