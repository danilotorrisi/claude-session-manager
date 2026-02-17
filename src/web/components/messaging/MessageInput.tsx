import { useState, useCallback, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

export interface MessageInputHandle {
  focus: () => void;
}

interface MessageInputProps {
  onSend: (text: string) => void;
  isSending?: boolean;
  disabled?: boolean;
  placeholder?: string;
}

export const MessageInput = forwardRef<MessageInputHandle, MessageInputProps>(function MessageInput({
  onSend,
  isSending = false,
  disabled = false,
  placeholder = 'Type a message...',
}, ref) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  }, [text, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Auto-resize textarea to content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const isDisabled = disabled || isSending;

  return (
    <div className={`relative flex items-start border border-default-200 rounded-lg bg-default-50 transition-colors focus-within:border-primary ${isDisabled ? 'opacity-50' : ''}`}>
      <span className="pl-3 pt-[9px] text-primary select-none shrink-0 leading-none">{'>'}</span>
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isDisabled}
        rows={1}
        className="flex-1 bg-transparent text-sm text-foreground placeholder:text-default-400 px-2 py-2 resize-none outline-none min-h-[36px] max-h-[120px] leading-[20px]"
      />
      {isSending && (
        <span className="pr-3 pb-2.5 text-xs text-default-400 shrink-0 animate-pulse">
          sending...
        </span>
      )}
    </div>
  );
});
