import { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Textarea } from '@heroui/react';

interface MessageInputProps {
  onSend: (text: string) => void;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  isSending = false,
  disabled = false,
  placeholder = 'Type a message... (Cmd+Enter to send)',
}: MessageInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  return (
    <div className="flex gap-2 items-end">
      <Textarea
        ref={textareaRef}
        value={text}
        onValueChange={setText}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        minRows={1}
        maxRows={4}
        isDisabled={disabled || isSending}
        classNames={{
          inputWrapper: 'bg-default-50 !border-transparent hover:!border-default-300 focus-within:!border-primary !outline-none !ring-0 !shadow-none',
          innerWrapper: '!outline-none !ring-0',
          input: '!outline-none !ring-0',
        }}
        className="flex-1"
      />
      <Button
        color="primary"
        onPress={handleSend}
        isLoading={isSending}
        isDisabled={disabled || !text.trim()}
        className="shrink-0"
      >
        Send
      </Button>
    </div>
  );
}
