import { useState } from 'react';
import { Card, CardBody, CardFooter, Button, Tooltip } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../common/StatusBadge';
import { SessionStats } from './SessionStats';
import { formatRelativeTime, truncate } from '../../utils/formatting';
import { useSessionStore } from '../../store/sessionStore';
import { useKillSession } from '../../hooks/api/useSessions';
import type { SessionWithWs } from '../../services/sessions';

interface SessionCardProps {
  session: SessionWithWs;
}

export function SessionCard({ session }: SessionCardProps) {
  const navigate = useNavigate();
  const favorites = useSessionStore((s) => s.favorites);
  const toggleFavorite = useSessionStore((s) => s.toggleFavorite);
  const isFavorite = favorites.includes(session.name);
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(session.name);
              }}
              className="text-lg hover:scale-110 transition-transform"
              aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
            >
              {isFavorite ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="text-warning">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-default-400">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                </svg>
              )}
            </button>
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
