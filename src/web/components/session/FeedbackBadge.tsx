import { Card, CardBody, CardHeader, Link } from '@heroui/react';
import type { FeedbackReport } from '../../types';

interface FeedbackBadgeProps {
  reports: FeedbackReport[];
}

export function FeedbackBadge({ reports }: FeedbackBadgeProps) {
  if (reports.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-1 pt-2 px-4">
        <span className="text-sm font-semibold text-warning">
          Feedback Reports ({reports.length})
        </span>
      </CardHeader>
      <CardBody className="pt-1">
        <div className="space-y-1">
          {reports.map((report, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-default-500">
                {new Date(report.timestamp).toLocaleString()}
              </span>
              <Link
                href={report.url}
                isExternal
                showAnchorIcon
                size="sm"
              >
                View Report
              </Link>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
