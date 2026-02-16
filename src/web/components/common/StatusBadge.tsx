import { Chip } from '@heroui/react';

type SessionStatus = 'idle' | 'working' | 'waiting_for_input' | string | undefined;

interface StatusBadgeProps {
  status: SessionStatus;
  wsConnected?: boolean;
}

function getStatusConfig(status: SessionStatus, wsConnected?: boolean) {
  if (!wsConnected) {
    return { label: 'offline', color: 'default' as const, dot: 'bg-default-400' };
  }

  switch (status) {
    case 'working':
      return { label: 'working', color: 'success' as const, dot: 'bg-success animate-pulse' };
    case 'waiting_for_input':
      return { label: 'waiting', color: 'danger' as const, dot: 'bg-danger' };
    case 'ready':
    case 'idle':
      return { label: 'idle', color: 'warning' as const, dot: 'bg-warning' };
    case 'compacting':
      return { label: 'compacting', color: 'secondary' as const, dot: 'bg-secondary animate-pulse' };
    case 'error':
      return { label: 'error', color: 'danger' as const, dot: 'bg-danger' };
    case 'connecting':
    case 'initializing':
      return { label: status, color: 'default' as const, dot: 'bg-default-400 animate-pulse' };
    default:
      return { label: status || 'unknown', color: 'default' as const, dot: 'bg-default-400' };
  }
}

export function StatusBadge({ status, wsConnected }: StatusBadgeProps) {
  const config = getStatusConfig(status, wsConnected);

  return (
    <Chip
      size="sm"
      variant="flat"
      color={config.color}
      startContent={
        <span className={`inline-block w-2 h-2 rounded-full ${config.dot}`} />
      }
    >
      {config.label}
    </Chip>
  );
}
