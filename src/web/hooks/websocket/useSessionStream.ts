import { useState, useRef, useCallback } from 'react';
import { useSSE } from './useSSE';
import { MAX_LOG_ENTRIES } from '../../utils/constants';
import type { StreamLogEntry } from '../../types';

function countLines(text: string | undefined): number {
  if (!text) return 0;
  return text.split('\n').length;
}

function formatToolDetail(toolName: string, input?: Record<string, unknown>): string {
  if (!input) return `Tool: ${toolName}`;
  const filePath = (input.file_path ?? input.path ?? '') as string;
  const shortPath = filePath.split('/').slice(-2).join('/');
  switch (toolName) {
    case 'Write': {
      const lines = countLines(input.content as string);
      return `Write: ${shortPath} (+${lines} lines)`;
    }
    case 'Edit': {
      const oldLines = countLines(input.old_string as string);
      const newLines = countLines(input.new_string as string);
      const diff = newLines - oldLines;
      const diffStr = diff > 0 ? `+${diff}` : diff < 0 ? `${diff}` : '~0';
      return `Edit: ${shortPath} (${diffStr} lines, ${oldLines}→${newLines})`;
    }
    case 'Read':
      return `Read: ${shortPath}`;
    case 'Bash':
      return `Bash: ${(input.command as string)?.slice(0, 120) ?? ''}`;
    case 'Glob':
      return `Glob: ${input.pattern ?? ''}`;
    case 'Grep':
      return `Grep: ${input.pattern ?? ''}${input.path ? ` in ${(input.path as string).split('/').slice(-2).join('/')}` : ''}`;
    case 'WebFetch':
      return `WebFetch: ${input.url ?? ''}`;
    case 'WebSearch':
      return `WebSearch: ${input.query ?? ''}`;
    default: {
      const firstVal = Object.values(input).find((v) => typeof v === 'string') as string | undefined;
      return firstVal ? `${toolName}: ${firstVal.slice(0, 100)}` : `Tool: ${toolName}`;
    }
  }
}

/**
 * Accumulate a live log of session events via SSE.
 * Mirrors the TUI's useStreamLog pattern but uses SSE instead of the
 * in-process wsSessionManager.
 */
export function useSessionStream(
  sessionName: string | undefined,
  maxEntries: number = MAX_LOG_ENTRIES,
) {
  const [entries, setEntries] = useState<StreamLogEntry[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [isWorking, setIsWorking] = useState(false);
  const entriesRef = useRef<StreamLogEntry[]>([]);
  const addEntry = useCallback(
    (entry: StreamLogEntry) => {
      entriesRef.current = [...entriesRef.current, entry].slice(-maxEntries);
      setEntries(entriesRef.current);
    },
    [maxEntries],
  );

  const handleEvent = useCallback(
    (raw: Record<string, unknown>) => {
      const type = raw.type as string;
      const now = new Date().toISOString();

      switch (type) {
        case 'connected':
          // Reset entries on (re)connect to avoid duplicates (e.g. after HMR)
          entriesRef.current = [];
          setEntries([]);
          setStreamingText('');
          addEntry({
            timestamp: now,
            type: 'system',
            content: 'Connected to session stream',
          });
          break;

        case 'state_snapshot':
          if (entriesRef.current.length <= 1) {
            addEntry({
              timestamp: now,
              type: 'system',
              content: `Session state: ${(raw.state as any)?.status ?? 'unknown'}`,
            });
          }
          break;

        case 'assistant_message': {
          setIsWorking(false);
          const text = raw.text as string | undefined;
          const blocks = raw.contentBlocks as Array<{ type: string; name?: string }> | undefined;

          if (text) {
            addEntry({
              timestamp: now,
              type: 'message',
              content: text,
              metadata: { stopReason: raw.stopReason },
            });
          }

          // Show tool use blocks as separate entries
          if (blocks) {
            for (const block of blocks) {
              if (block.type === 'tool_use' && block.name) {
                const input = (block as any).input as Record<string, unknown> | undefined;
                const detail = formatToolDetail(block.name, input);
                addEntry({
                  timestamp: now,
                  type: 'tool',
                  content: detail,
                  metadata: block,
                });
              }
            }
          }
          break;
        }

        case 'tool_approval_needed': {
          const approval = raw.approval as Record<string, unknown>;
          addEntry({
            timestamp: now,
            type: 'tool',
            content: `Tool approval needed: ${approval?.toolName ?? 'unknown'}`,
            metadata: approval,
          });
          break;
        }

        case 'tool_auto_approved': {
          const toolName = raw.toolName as string;
          const toolInput = raw.toolInput as Record<string, unknown> | undefined;
          const matchedRule = raw.matchedRule as { tool: string; pattern?: string; action: string } | undefined;
          const detail = formatToolDetail(toolName, toolInput);
          const ruleDesc = matchedRule?.pattern
            ? `${matchedRule.tool}: ${matchedRule.pattern}`
            : matchedRule?.tool ?? 'rule';
          addEntry({
            timestamp: now,
            type: 'tool',
            content: detail,
            metadata: { name: toolName, input: toolInput, autoApproved: true, matchedRule: ruleDesc },
          });
          break;
        }

        case 'tool_auto_denied': {
          const toolName = raw.toolName as string;
          const toolInput = raw.toolInput as Record<string, unknown> | undefined;
          const matchedRule = raw.matchedRule as { tool: string; pattern?: string; action: string } | undefined;
          const detail = formatToolDetail(toolName, toolInput);
          const ruleDesc = matchedRule?.pattern
            ? `${matchedRule.tool}: ${matchedRule.pattern}`
            : matchedRule?.tool ?? 'rule';
          addEntry({
            timestamp: now,
            type: 'error',
            content: `Denied: ${detail}`,
            metadata: { name: toolName, input: toolInput, autoDenied: true, matchedRule: ruleDesc },
          });
          break;
        }

        case 'result':
          setStreamingText('');
          setIsWorking(false);
          addEntry({
            timestamp: now,
            type: 'result',
            content: raw.success
              ? (raw.result as string) || 'Completed successfully'
              : `Error: ${(raw.errors as string[])?.join('; ') || 'Unknown error'}`,
            metadata: {
              success: raw.success,
              numTurns: raw.numTurns,
              totalCostUsd: raw.totalCostUsd,
              durationMs: raw.durationMs,
            },
          });
          break;

        case 'status_changed':
          addEntry({
            timestamp: now,
            type: 'system',
            content: `${raw.previousStatus} -> ${raw.newStatus}`,
            metadata: {
              previousStatus: raw.previousStatus,
              newStatus: raw.newStatus,
            },
          });
          break;

        case 'error':
          addEntry({
            timestamp: now,
            type: 'error',
            content: raw.error as string,
          });
          break;

        case 'user_message': {
          setIsWorking(true);
          // Skip if the last entry is already this user message (added locally via addUserMessage)
          const last = entriesRef.current[entriesRef.current.length - 1];
          if (!(last?.type === 'user' && last?.content === raw.text)) {
            addEntry({
              timestamp: now,
              type: 'user',
              content: raw.text as string,
            });
          }
          break;
        }

        case 'stream_delta':
          setStreamingText(raw.accumulatedText as string);
          break;
      }
    },
    [addEntry],
  );

  useSSE({
    path: `/api/sessions/${encodeURIComponent(sessionName ?? '')}/stream`,
    onEvent: handleEvent,
    enabled: !!sessionName,
  });

  const clear = useCallback(() => {
    entriesRef.current = [];
    setEntries([]);
    setStreamingText('');
  }, []);

  const addUserMessage = useCallback(
    (text: string) => {
      setIsWorking(true);
      addEntry({
        timestamp: new Date().toISOString(),
        type: 'user',
        content: text,
      });
    },
    [addEntry],
  );

  return { entries, streamingText, isWorking, clear, addUserMessage };
}
