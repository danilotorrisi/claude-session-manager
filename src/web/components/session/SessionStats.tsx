import { Chip } from '@heroui/react';
import { formatCost } from '../../utils/formatting';

interface SessionStatsProps {
  turnCount?: number;
  cost?: number;
}

export function SessionStats({ turnCount, cost }: SessionStatsProps) {
  if (!turnCount && !cost) return null;

  return (
    <div className="flex gap-1.5 items-center">
      {turnCount != null && turnCount > 0 && (
        <Chip size="sm" variant="flat" color="primary">
          {turnCount} turn{turnCount !== 1 ? 's' : ''}
        </Chip>
      )}
      {cost != null && cost > 0 && (
        <Chip size="sm" variant="flat" color="success">
          {formatCost(cost)}
        </Chip>
      )}
    </div>
  );
}
