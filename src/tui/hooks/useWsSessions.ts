import { useEffect, useState, useCallback, useRef } from "react";
import { wsSessionManager } from "../../lib/ws-session-manager";
import type {
  WsSessionState,
  WsSessionEvent,
  PendingToolApproval,
} from "../../lib/ws-types";

export interface PendingApprovalEntry {
  sessionName: string;
  requestId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolUseId: string;
  description?: string;
  receivedAt: number;
}

export interface UseWsSessionsResult {
  wsStates: Map<string, WsSessionState>;
  pendingApprovals: PendingApprovalEntry[];
  approveTool: (sessionName: string, requestId: string) => boolean;
  denyTool: (sessionName: string, requestId: string, message?: string) => boolean;
  sendMessage: (sessionName: string, text: string) => boolean;
}

export function useWsSessions(): UseWsSessionsResult {
  const [wsStates, setWsStates] = useState<Map<string, WsSessionState>>(
    () => new Map(wsSessionManager.getAllSessions())
  );

  // Use a ref for pending approvals to avoid stale closures in event handler,
  // and a state counter to trigger re-renders when approvals change.
  const pendingApprovalsRef = useRef<Map<string, PendingApprovalEntry>>(new Map());
  const [, setApprovalVersion] = useState(0);

  useEffect(() => {
    // Sync initial state
    setWsStates(new Map(wsSessionManager.getAllSessions()));

    // Build initial pending approvals from existing sessions
    const initialApprovals = new Map<string, PendingApprovalEntry>();
    for (const [, state] of wsSessionManager.getAllSessions()) {
      if (state.pendingToolApproval) {
        const key = `${state.sessionName}:${state.pendingToolApproval.requestId}`;
        initialApprovals.set(key, {
          sessionName: state.sessionName,
          ...state.pendingToolApproval,
        });
      }
    }
    pendingApprovalsRef.current = initialApprovals;
    setApprovalVersion((v) => v + 1);

    const unsubscribe = wsSessionManager.on((event: WsSessionEvent) => {
      // Always refresh the full state map on any event
      setWsStates(new Map(wsSessionManager.getAllSessions()));

      if (event.type === "tool_approval_needed") {
        const key = `${event.sessionName}:${event.approval.requestId}`;
        pendingApprovalsRef.current.set(key, {
          sessionName: event.sessionName,
          requestId: event.approval.requestId,
          toolName: event.approval.toolName,
          toolInput: event.approval.toolInput,
          toolUseId: event.approval.toolUseId,
          description: event.approval.description,
          receivedAt: event.approval.receivedAt,
        });
        setApprovalVersion((v) => v + 1);
      }

      if (event.type === "tool_approval_resolved") {
        const key = `${event.sessionName}:${event.requestId}`;
        pendingApprovalsRef.current.delete(key);
        setApprovalVersion((v) => v + 1);
      }

      // Clean up approvals for disconnected sessions
      if (event.type === "session_disconnected") {
        let changed = false;
        for (const [key] of pendingApprovalsRef.current) {
          if (key.startsWith(`${event.sessionName}:`)) {
            pendingApprovalsRef.current.delete(key);
            changed = true;
          }
        }
        if (changed) {
          setApprovalVersion((v) => v + 1);
        }
      }
    });

    return unsubscribe;
  }, []);

  const pendingApprovals = Array.from(pendingApprovalsRef.current.values());

  const approveTool = useCallback(
    (sessionName: string, requestId: string): boolean => {
      return wsSessionManager.respondToToolApproval(
        sessionName,
        requestId,
        "allow"
      );
    },
    []
  );

  const denyTool = useCallback(
    (sessionName: string, requestId: string, message?: string): boolean => {
      return wsSessionManager.respondToToolApproval(
        sessionName,
        requestId,
        "deny",
        message
      );
    },
    []
  );

  const sendMessage = useCallback(
    (sessionName: string, text: string): boolean => {
      return wsSessionManager.sendUserMessage(sessionName, text);
    },
    []
  );

  return {
    wsStates,
    pendingApprovals,
    approveTool,
    denyTool,
    sendMessage,
  };
}
