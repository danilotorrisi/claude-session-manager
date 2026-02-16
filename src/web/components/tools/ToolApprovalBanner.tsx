import { Card, CardBody, Button, Chip } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import type { SessionWithWs } from '../../services/sessions';

interface ToolApprovalBannerProps {
  sessions: SessionWithWs[];
}

/**
 * Global banner shown when one or more sessions have pending tool approvals.
 */
export function ToolApprovalBanner({ sessions }: ToolApprovalBannerProps) {
  const navigate = useNavigate();
  const withApprovals = sessions.filter((s) => s.pendingApproval);

  if (withApprovals.length === 0) return null;

  return (
    <Card className="bg-warning-50 dark:bg-warning-50/10 border border-warning-200 dark:border-warning-500/30">
      <CardBody className="py-2 px-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <Chip color="warning" variant="flat" size="sm">
              {withApprovals.length} pending
            </Chip>
            <span className="text-sm">
              Tool approval{withApprovals.length !== 1 ? 's' : ''} needed
            </span>
            <span className="text-xs text-default-400">
              {withApprovals
                .slice(0, 3)
                .map((s) => `${s.name}: ${s.pendingApproval!.toolName}`)
                .join(', ')}
              {withApprovals.length > 3 && `, +${withApprovals.length - 3} more`}
            </span>
          </div>
          <Button
            size="sm"
            color="warning"
            variant="flat"
            onPress={() => {
              const first = withApprovals[0];
              navigate(`/sessions/${encodeURIComponent(first.name)}`);
            }}
          >
            Review
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
