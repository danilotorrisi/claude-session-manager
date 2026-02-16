import { useState, useEffect, useRef } from 'react';
import { Card, CardBody, CardHeader, Chip, Button, Switch, ButtonGroup } from '@heroui/react';
import type { StreamLogEntry } from '../../types';
import { ClaudeView } from './ClaudeView';

interface LogViewerProps {
  entries: StreamLogEntry[];
  streamingText?: string;
  onClear?: () => void;
  className?: string;
}

const typeColorMap: Record<StreamLogEntry['type'], 'primary' | 'warning' | 'success' | 'danger' | 'default' | 'secondary'> = {
  message: 'primary',
  tool: 'warning',
  result: 'success',
  error: 'danger',
  system: 'default',
  user: 'secondary',
};

const typeLabelMap: Record<StreamLogEntry['type'], string> = {
  message: 'assistant',
  tool: 'tool',
  result: 'result',
  error: 'error',
  system: 'system',
  user: 'you',
};

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function ToolContent({ metadata }: { metadata: Record<string, unknown> }) {
  const input = metadata.input as Record<string, unknown> | undefined;
  const toolName = metadata.name as string;

  if (!input) return null;

  let additions: string | undefined;
  let deletions: string | undefined;
  let plainContent: string | undefined;

  if (toolName === 'Write' && input.content) {
    additions = input.content as string;
  } else if (toolName === 'Edit' && (input.old_string || input.new_string)) {
    deletions = input.old_string as string;
    additions = input.new_string as string;
  } else if (toolName === 'Bash' && input.command) {
    const cmd = input.command as string;
    if (cmd.length > 120) plainContent = cmd;
  }

  if (!additions && !deletions && !plainContent) return null;

  return (
    <div className="mt-1 rounded-md bg-[#0d1825] border border-[#1e3148] p-2.5 text-[11px] leading-[1.6] max-h-48 overflow-y-auto font-mono">
      {deletions && deletions.split('\n').map((line, i) => (
        <div key={`d-${i}`} className="text-red-400/80 whitespace-pre-wrap break-all">
          <span className="inline-block w-4 text-red-500/50 select-none shrink-0">-</span>
          {line}
        </div>
      ))}
      {additions && additions.split('\n').map((line, i) => (
        <div key={`a-${i}`} className="text-green-400/80 whitespace-pre-wrap break-all">
          <span className="inline-block w-4 text-green-500/50 select-none shrink-0">+</span>
          {line}
        </div>
      ))}
      {plainContent && (
        <span className="text-default-300 whitespace-pre-wrap break-all">{plainContent}</span>
      )}
    </div>
  );
}

type ViewMode = 'log' | 'claude';

export function LogViewer({ entries, streamingText, onClear, className }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoExpand, setAutoExpand] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('claude');

  useEffect(() => {
    if (viewMode === 'log') {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length, viewMode]);

  return (
    <Card className={`flex flex-col ${className ?? ''}`}>
      <CardHeader className="pb-1 pt-2 px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ButtonGroup size="sm" variant="flat">
            <Button
              color={viewMode === 'claude' ? 'primary' : 'default'}
              onPress={() => setViewMode('claude')}
              className="text-xs"
            >
              Claude
            </Button>
            <Button
              color={viewMode === 'log' ? 'primary' : 'default'}
              onPress={() => setViewMode('log')}
              className="text-xs"
            >
              Log
            </Button>
          </ButtonGroup>
          <Chip size="sm" variant="flat">
            {entries.length}
          </Chip>
        </div>
        <div className="flex items-center gap-3">
          {viewMode === 'log' && (
            <Switch
              size="sm"
              isSelected={autoExpand}
              onValueChange={setAutoExpand}
              classNames={{
                label: 'text-xs text-default-400',
              }}
            >
              Expand tools
            </Switch>
          )}
          {onClear && entries.length > 0 && (
            <Button size="sm" variant="light" onPress={onClear}>
              Clear
            </Button>
          )}
        </div>
      </CardHeader>
      <CardBody className="pt-1 flex-1 min-h-0 flex flex-col">
        {entries.length === 0 && !streamingText ? (
          <div className="rounded-md bg-default-50 p-4 text-center text-sm text-default-400 flex-1 flex items-center justify-center">
            No live activity — session may be detached
          </div>
        ) : viewMode === 'claude' ? (
          <ClaudeView entries={entries} streamingText={streamingText} />
        ) : (
          <div className="flex-1 overflow-y-auto rounded-md bg-default-50 p-2 font-mono text-xs">
            {entries.map((entry, i) => (
              <div key={i} className="py-0.5">
                <div className="flex items-start gap-0">
                  <span className="text-default-400 shrink-0 w-[90px] text-right pr-2">
                    [{formatTimestamp(entry.timestamp)}]
                  </span>
                  <span className="shrink-0 w-[80px] pr-2">
                    <Chip
                      size="sm"
                      variant="flat"
                      color={typeColorMap[entry.type]}
                      className="h-5 text-[10px]"
                    >
                      {typeLabelMap[entry.type]}
                    </Chip>
                  </span>
                  <span className={`min-w-0 break-words ${
                    entry.type === 'message' || entry.type === 'user'
                      ? 'text-white/90'
                      : entry.type === 'error'
                        ? 'text-red-300'
                        : entry.type === 'result'
                          ? 'text-white/90'
                          : 'text-default-400'
                  }`}>
                    {entry.content}
                  </span>
                </div>
                {autoExpand && entry.type === 'tool' && entry.metadata && (
                  <div className="ml-[170px]">
                    <ToolContent metadata={entry.metadata} />
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}
