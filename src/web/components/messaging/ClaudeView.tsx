import { useEffect, useRef } from 'react';
import type { StreamLogEntry } from '../../types';

interface ClaudeViewProps {
  entries: StreamLogEntry[];
  streamingText?: string;
  className?: string;
}

/** Renders inline code with backtick-style background */
function formatInlineCode(text: string): React.ReactNode[] {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="px-1 py-0.5 rounded bg-white/10 text-[#e8b4f8] text-[12px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function getToolLabel(toolName: string, input?: Record<string, unknown>): string {
  const filePath = (input?.file_path ?? input?.path ?? '') as string;
  const shortPath = filePath ? filePath.split('/').slice(-3).join('/') : '';
  switch (toolName) {
    case 'Write':
      return `Write(${shortPath})`;
    case 'Edit':
      return `Update(${shortPath})`;
    case 'Read':
      return `Read(${shortPath})`;
    case 'Bash': {
      const cmd = (input?.command as string) ?? '';
      return cmd.length > 80 ? `> ${cmd.slice(0, 80)}…` : `> ${cmd}`;
    }
    case 'Glob':
      return `Searched for ${input?.pattern ?? ''}`;
    case 'Grep':
      return `Searched for \`${input?.pattern ?? ''}\`${input?.path ? ` in ${(input.path as string).split('/').slice(-2).join('/')}` : ''}`;
    default:
      return `${toolName}()`;
  }
}

function ToolDiff({ metadata }: { metadata: Record<string, unknown> }) {
  const input = metadata.input as Record<string, unknown> | undefined;
  const toolName = metadata.name as string;
  if (!input) return null;

  if (toolName === 'Write' && input.content) {
    const lines = (input.content as string).split('\n');
    return (
      <div className="ml-4 mt-1 mb-2">
        <div className="text-[#6b8a6b] text-[12px] mb-1">
          └ Wrote {lines.length} line{lines.length !== 1 ? 's' : ''}
        </div>
        <div className="rounded bg-[#0a1520] border border-[#1a2d42] overflow-hidden max-h-52 overflow-y-auto">
          {lines.map((line, i) => (
            <div key={i} className="flex text-[12px] leading-[1.7] bg-[#0d2818]/40">
              <span className="w-10 text-right pr-2 text-[#4a6a4a] select-none shrink-0 border-r border-[#1a2d42]">
                {i + 1}
              </span>
              <span className="text-[#4ade80] pl-1 select-none shrink-0">+</span>
              <span className="text-[#d4d4d4] pl-1 whitespace-pre-wrap break-all">{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (toolName === 'Edit' && (input.old_string || input.new_string)) {
    const oldLines = input.old_string ? (input.old_string as string).split('\n') : [];
    const newLines = input.new_string ? (input.new_string as string).split('\n') : [];
    const addedCount = Math.max(0, newLines.length - oldLines.length);
    const removedCount = Math.max(0, oldLines.length - newLines.length);
    const changedCount = Math.min(oldLines.length, newLines.length);

    let summary = '';
    if (addedCount > 0 && removedCount > 0) summary = `Added ${addedCount}, removed ${removedCount} line${removedCount !== 1 ? 's' : ''}`;
    else if (addedCount > 0) summary = `Added ${addedCount} line${addedCount !== 1 ? 's' : ''}`;
    else if (removedCount > 0) summary = `Removed ${removedCount} line${removedCount !== 1 ? 's' : ''}`;
    else summary = `Changed ${changedCount} line${changedCount !== 1 ? 's' : ''}`;

    return (
      <div className="ml-4 mt-1 mb-2">
        <div className="text-[#6b8a6b] text-[12px] mb-1">└ {summary}</div>
        <div className="rounded bg-[#0a1520] border border-[#1a2d42] overflow-hidden max-h-52 overflow-y-auto">
          {oldLines.map((line, i) => (
            <div key={`d-${i}`} className="flex text-[12px] leading-[1.7] bg-[#2d1215]/40">
              <span className="w-10 text-right pr-2 text-[#6a4a4a] select-none shrink-0 border-r border-[#1a2d42]">
                {i + 1}
              </span>
              <span className="text-[#f87171] pl-1 select-none shrink-0">-</span>
              <span className="text-[#d4d4d4]/60 pl-1 whitespace-pre-wrap break-all">{line || ' '}</span>
            </div>
          ))}
          {newLines.map((line, i) => (
            <div key={`a-${i}`} className="flex text-[12px] leading-[1.7] bg-[#0d2818]/40">
              <span className="w-10 text-right pr-2 text-[#4a6a4a] select-none shrink-0 border-r border-[#1a2d42]">
                {i + 1}
              </span>
              <span className="text-[#4ade80] pl-1 select-none shrink-0">+</span>
              <span className="text-[#d4d4d4] pl-1 whitespace-pre-wrap break-all">{line || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (toolName === 'Bash' && input.command) {
    return (
      <div className="ml-4 mt-1 mb-2">
        <div className="rounded bg-[#0a1520] border border-[#1a2d42] px-3 py-1.5 text-[12px]">
          <span className="text-[#888] select-none">$ </span>
          <span className="text-[#d4d4d4]">{input.command as string}</span>
        </div>
      </div>
    );
  }

  return null;
}

function ClaudeEntry({ entry }: { entry: StreamLogEntry }) {
  switch (entry.type) {
    case 'user':
      return (
        <div className="py-2 border-t border-[#1a2d42]">
          <div className="flex items-start gap-2">
            <span className="text-[#888] select-none shrink-0 text-[13px]">❯</span>
            <span className="text-white text-[13px] leading-relaxed">{entry.content}</span>
          </div>
        </div>
      );

    case 'message':
      return (
        <div className="py-1">
          <div className="flex items-start gap-2">
            <span className="text-[#3b82f6] select-none shrink-0 text-[10px] leading-[20px]">●</span>
            <span className="text-[#e2e2e2] text-[13px] leading-relaxed">
              {formatInlineCode(entry.content)}
            </span>
          </div>
        </div>
      );

    case 'tool': {
      const input = (entry.metadata as any)?.input as Record<string, unknown> | undefined;
      const toolName = (entry.metadata as any)?.name as string;
      const label = toolName ? getToolLabel(toolName, input) : entry.content;
      const isSearch = toolName === 'Grep' || toolName === 'Glob' || toolName === 'Read';

      return (
        <div className="py-1">
          <div className="flex items-start gap-2">
            <span className={`select-none shrink-0 text-[10px] leading-[20px] ${isSearch ? 'text-[#eab308]' : 'text-[#22c55e]'}`}>●</span>
            <span className="text-[#d4d4d4] text-[13px] font-medium">
              {formatInlineCode(label)}
            </span>
          </div>
          {toolName && entry.metadata && <ToolDiff metadata={entry.metadata} />}
        </div>
      );
    }

    case 'result':
      return (
        <div className="py-1">
          <div className="flex items-start gap-2">
            <span className="text-[#22c55e] select-none shrink-0 text-[10px] leading-[20px]">●</span>
            <span className="text-[#a3a3a3] text-[13px] leading-relaxed">
              {formatInlineCode(entry.content)}
            </span>
          </div>
        </div>
      );

    case 'error':
      return (
        <div className="py-1">
          <div className="flex items-start gap-2">
            <span className="text-[#ef4444] select-none shrink-0 text-[10px] leading-[20px]">●</span>
            <span className="text-[#fca5a5] text-[13px] leading-relaxed">{entry.content}</span>
          </div>
        </div>
      );

    case 'system':
      // Skip noisy status transitions in claude view
      return null;

    default:
      return null;
  }
}

export function ClaudeView({ entries, streamingText, className }: ClaudeViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries.length, streamingText]);

  const filteredEntries = entries.filter((e) => e.type !== 'system' && e.type !== 'result');

  return (
    <div className={`flex-1 overflow-y-auto rounded-md bg-[#0c1624] p-4 font-mono text-sm ${className ?? ''}`}>
      {filteredEntries.length === 0 && !streamingText ? (
        <div className="text-[#555] text-center py-8">
          Waiting for activity…
        </div>
      ) : (
        <>
          {filteredEntries.map((entry, i) => (
            <ClaudeEntry key={i} entry={entry} />
          ))}
          {streamingText && (
            <div className="py-1">
              <div className="flex items-start gap-2">
                <span className="text-[#3b82f6] select-none shrink-0 text-[10px] leading-[20px] animate-pulse">●</span>
                <span className="text-[#e2e2e2] text-[13px] leading-relaxed">
                  {formatInlineCode(streamingText)}
                </span>
                <span className="inline-block w-2 h-4 bg-white/70 animate-pulse ml-0.5" />
              </div>
            </div>
          )}
        </>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
