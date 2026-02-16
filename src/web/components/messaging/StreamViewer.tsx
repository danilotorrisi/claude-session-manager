import { useEffect, useRef } from 'react';
import { Card, CardBody, CardHeader, Spinner } from '@heroui/react';

interface StreamViewerProps {
  text: string;
  maxLength?: number;
}

export function StreamViewer({ text, maxLength = 2000 }: StreamViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [text]);

  if (!text) return null;

  const displayText = text.length > maxLength
    ? '...' + text.slice(-maxLength)
    : text;

  return (
    <Card className="border border-primary/20">
      <CardHeader className="pb-1 pt-2 px-4 flex items-center gap-2">
        <Spinner size="sm" color="primary" />
        <span className="text-sm font-semibold">Streaming</span>
      </CardHeader>
      <CardBody className="pt-1">
        <div className="max-h-48 overflow-y-auto rounded-md bg-default-50 p-3 font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-primary-600 dark:text-primary-400">
          {displayText}
          <div ref={bottomRef} />
        </div>
      </CardBody>
    </Card>
  );
}
