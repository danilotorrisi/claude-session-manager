import { Kbd } from '@heroui/react';

interface KeyboardHintProps {
  keys: string;
  label?: string;
  className?: string;
}

/**
 * Render a keyboard shortcut hint with the key combination and optional label.
 */
export function KeyboardHint({ keys, label, className }: KeyboardHintProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <Kbd className="text-[10px]">{keys}</Kbd>
      {label && <span className="text-xs text-default-500">{label}</span>}
    </span>
  );
}

interface ShortcutListProps {
  shortcuts: Array<{ keys: string; description: string }>;
}

/**
 * Render a vertical list of keyboard shortcuts with descriptions.
 */
export function ShortcutList({ shortcuts }: ShortcutListProps) {
  return (
    <div className="space-y-2">
      {shortcuts.map(({ keys, description }) => (
        <div key={keys} className="flex items-center justify-between gap-4">
          <span className="text-sm text-default-600">{description}</span>
          <Kbd className="text-xs">{keys}</Kbd>
        </div>
      ))}
    </div>
  );
}
