import { useState } from 'react';
import { Card, CardBody, CardFooter, Button, Tooltip } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../common/StatusBadge';
import { SessionStats } from './SessionStats';
import { formatRelativeTime, truncate } from '../../utils/formatting';
import { useKillSession } from '../../hooks/api/useSessions';
import { FavoriteButton } from './FavoriteButton';
import type { SessionWithWs } from '../../services/sessions';

interface SessionCardProps {
  session: SessionWithWs;
}

export function SessionCard({ session }: SessionCardProps) {
  const navigate = useNavigate();
  const killMutation = useKillSession();
  const [isKilling, setIsKilling] = useState(false);

  return (
    <Card
      isPressable
      onPress={() => navigate(`/sessions/${encodeURIComponent(session.name)}`)}
      className="w-full"
    >
      <CardBody className="gap-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FavoriteButton sessionName={session.name} size={16} />
            <span className="font-semibold">{session.name}</span>
          </div>
          <div className="flex items-center gap-1">
            <StatusBadge
              status={session.wsConnected ? session.wsStatus : session.claudeState}
              wsConnected={session.wsConnected}
            />
            <Tooltip content="Kill session">
              <Button
                isIconOnly
                size="sm"
                variant="light"
                color="danger"
                isLoading={isKilling}
                onPress={() => {
                  setIsKilling(true);
                  killMutation.mutate(session.name, {
                    onSettled: () => setIsKilling(false),
                  });
                }}
                aria-label="Kill session"
                className="min-w-6 w-6 h-6"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </Button>
            </Tooltip>
          </div>
        </div>

        {session.title && (
          <p className="text-sm text-default-500">{truncate(session.title, 80)}</p>
        )}

        {session.claudeLastMessage && (
          <p className="text-xs text-default-400 line-clamp-2">
            {truncate(session.claudeLastMessage, 120)}
          </p>
        )}
      </CardBody>

      <CardFooter className="justify-between pt-0">
        <div className="flex items-center gap-2 text-xs text-default-400">
          {session.projectName && (
            <span className="bg-default-100 px-1.5 py-0.5 rounded text-default-600">
              {session.projectName}
            </span>
          )}
          {session.linearIssue && (
            <span className="text-primary">{session.linearIssue.identifier}</span>
          )}
          <span>{formatRelativeTime(session.created)}</span>
          {session.host && <span className="text-default-300">{session.host}</span>}
        </div>
        <SessionStats turnCount={session.wsTurnCount} cost={session.wsCost} />
      </CardFooter>
    </Card>
  );
}
