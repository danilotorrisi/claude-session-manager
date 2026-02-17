import { Chip } from './Chip';

type SessionStatus = 'idle' | 'working' | 'waiting_for_input' | string | undefined;

interface StatusBadgeProps {
  status: SessionStatus;
  wsConnected?: boolean;
}

function getStatusConfig(status: SessionStatus, wsConnected?: boolean) {
  if (!wsConnected) {
    return { label: 'offline', color: 'default' as const };
  }

  switch (status) {
    case 'working':
      return { label: 'working', color: 'warning' as const };
    case 'waiting_for_input':
      return { label: 'waiting', color: 'danger' as const };
    case 'ready':
    case 'idle':
      return { label: 'idle', color: 'default' as const };
    case 'compacting':
      return { label: 'compacting', color: 'secondary' as const };
    case 'error':
      return { label: 'error', color: 'danger' as const };
    case 'connecting':
    case 'initializing':
      return { label: status, color: 'default' as const };
    default:
      return { label: status || 'unknown', color: 'default' as const };
  }
}

export function StatusBadge({ status, wsConnected }: StatusBadgeProps) {
  const config = getStatusConfig(status, wsConnected);

  return (
    <Chip
      size="sm"
      variant="dot"
      color={config.color}
    >
      {config.label}
    </Chip>
  );
}
