/**
 * Global keyboard shortcut definitions.
 *
 * Shortcuts are only active when focus is NOT in an input/textarea.
 * Cmd+K is an exception -- it works globally to open search.
 */

export interface ShortcutDef {
  key: string;
  label: string;
  description: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  /** If true, the shortcut fires even when an input is focused. */
  global?: boolean;
}

export const SHORTCUTS: ShortcutDef[] = [
  {
    key: '/',
    label: '/',
    description: 'Focus search',
  },
  {
    key: 'k',
    label: '\u2318K',
    description: 'Quick search',
    metaKey: true,
    global: true,
  },
  {
    key: 'Escape',
    label: 'Esc',
    description: 'Go back / close',
  },
  {
    key: 'n',
    label: 'N',
    description: 'New session',
  },
  {
    key: 'y',
    label: 'Y',
    description: 'Approve tool',
  },
  {
    key: '?',
    label: '?',
    description: 'Show shortcuts',
    shiftKey: true,
  },
];

/**
 * Check whether a keyboard event matches a shortcut definition.
 */
export function matchesShortcut(e: KeyboardEvent, shortcut: ShortcutDef): boolean {
  if (shortcut.metaKey && !(e.metaKey || e.ctrlKey)) return false;
  if (shortcut.ctrlKey && !e.ctrlKey) return false;
  if (shortcut.shiftKey && !e.shiftKey) return false;

  return e.key.toLowerCase() === shortcut.key.toLowerCase();
}

/**
 * Returns true if the event target is a text input element.
 */
export function isInputFocused(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement;
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );
}
