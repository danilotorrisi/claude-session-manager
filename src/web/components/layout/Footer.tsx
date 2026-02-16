import { Chip, Kbd } from '@heroui/react';
import { useNotifications } from '../../hooks/ui/useNotifications';

export function Footer() {
  const { isGranted, isSupported } = useNotifications();

  return (
    <footer className="border-t border-divider px-4 py-2 flex items-center justify-between text-xs text-default-500 bg-content1">
      <div className="flex items-center gap-2">
        <Chip size="sm" variant="dot" color="success">
          Connected
        </Chip>
        <span className="hidden sm:inline">Claude Session Manager</span>
      </div>
      <div className="hidden md:flex items-center gap-3">
        {isSupported && (
          <Chip
            size="sm"
            variant="dot"
            color={isGranted ? 'success' : 'default'}
          >
            {isGranted ? 'Notifications on' : 'Notifications off'}
          </Chip>
        )}
        <span className="flex items-center gap-1.5 text-default-400">
          <Kbd className="text-[10px]">/</Kbd>
          <span>search</span>
        </span>
        <span className="flex items-center gap-1.5 text-default-400">
          <Kbd className="text-[10px]">?</Kbd>
          <span>shortcuts</span>
        </span>
        <span>v1.4.0</span>
      </div>
    </footer>
  );
}
