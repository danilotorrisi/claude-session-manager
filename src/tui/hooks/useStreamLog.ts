import { useState, useEffect, useRef, useCallback } from "react";
import { wsSessionManager } from "../../lib/ws-session-manager";
import type { WsSessionEvent } from "../../lib/ws-types";

export interface LogEntry {
  timestamp: Date;
  type: "assistant" | "tool_approval" | "result" | "status" | "error";
  content: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_MAX_ENTRIES = 50;

export function useStreamLog(
  sessionName: string | undefined,
  maxEntries: number = DEFAULT_MAX_ENTRIES
) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const entriesRef = useRef<LogEntry[]>([]);

  const addEntry = useCallback(
    (entry: LogEntry) => {
      entriesRef.current = [...entriesRef.current, entry].slice(-maxEntries);
      setEntries(entriesRef.current);
    },
    [maxEntries]
  );

  useEffect(() => {
    if (!sessionName) return;

    // Reset state when session changes
    entriesRef.current = [];
    setEntries([]);
    setStreamingText("");

    const unsub = wsSessionManager.on((event: WsSessionEvent) => {
      if (event.sessionName !== sessionName) return;

      switch (event.type) {
        case "assistant_message":
          addEntry({
            timestamp: new Date(),
            type: "assistant",
            content: event.text,
            metadata: {
              stopReason: event.stopReason,
              contentBlocks: event.contentBlocks,
            },
          });
          break;

        case "tool_approval_needed":
          addEntry({
            timestamp: new Date(),
            type: "tool_approval",
            content: `Tool approval needed: ${event.approval.toolName}`,
            metadata: {
              requestId: event.approval.requestId,
              toolName: event.approval.toolName,
              toolInput: event.approval.toolInput,
              toolUseId: event.approval.toolUseId,
            },
          });
          break;

        case "result":
          // Clear streaming text when result arrives
          setStreamingText("");
          addEntry({
            timestamp: new Date(),
            type: "result",
            content: event.success
              ? event.result || "Completed successfully"
              : `Error: ${event.errors?.join("; ") || "Unknown error"}`,
            metadata: {
              success: event.success,
              numTurns: event.numTurns,
              totalCostUsd: event.totalCostUsd,
              durationMs: event.durationMs,
            },
          });
          break;

        case "status_changed":
          addEntry({
            timestamp: new Date(),
            type: "status",
            content: `${event.previousStatus} -> ${event.newStatus}`,
            metadata: {
              previousStatus: event.previousStatus,
              newStatus: event.newStatus,
            },
          });
          break;

        case "error":
          addEntry({
            timestamp: new Date(),
            type: "error",
            content: event.error,
          });
          break;

        case "stream_delta":
          setStreamingText(event.accumulatedText);
          break;
      }
    });

    return unsub;
  }, [sessionName, addEntry]);

  const clear = useCallback(() => {
    entriesRef.current = [];
    setEntries([]);
    setStreamingText("");
  }, []);

  return { entries, streamingText, clear };
}
