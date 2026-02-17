import { useState } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Spinner,
  Button,
  Tooltip,
} from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { StatusBadge } from '../common/StatusBadge';
import { SessionStats } from './SessionStats';
import { formatRelativeTime, truncate } from '../../utils/formatting';
import { useKillSession } from '../../hooks/api/useSessions';
import { FavoriteButton } from './FavoriteButton';
import type { SessionWithWs } from '../../services/sessions';

interface SessionTableProps {
  sessions: SessionWithWs[];
  isLoading: boolean;
}

const columns = [
  { key: 'favorite', label: '', width: 40 },
  { key: 'name', label: 'Session' },
  { key: 'status', label: 'Status' },
  { key: 'project', label: 'Project' },
  { key: 'task', label: 'Task' },
  { key: 'message', label: 'Last Message' },
  { key: 'stats', label: 'Stats' },
  { key: 'created', label: 'Created' },
  { key: 'host', label: 'Host' },
  { key: 'actions', label: '', width: 50 },
];

export function SessionTable({ sessions, isLoading }: SessionTableProps) {
  const navigate = useNavigate();
  const killMutation = useKillSession();
  const [killingName, setKillingName] = useState<string | null>(null);

  return (
    <Table
      aria-label="Sessions"
      selectionMode="single"
      onRowAction={(key) => {
        navigate(`/sessions/${encodeURIComponent(String(key))}`);
      }}
      classNames={{
        wrapper: 'min-h-[200px]',
        tr: 'cursor-pointer',
      }}
    >
      <TableHeader>
        {columns.map((col) => (
          <TableColumn key={col.key} width={col.width}>
            {col.label}
          </TableColumn>
        ))}
      </TableHeader>
      <TableBody
        items={sessions}
        isLoading={isLoading}
        loadingContent={<Spinner label="Loading sessions..." />}
        emptyContent="No sessions found"
      >
        {(session) => (
          <TableRow key={session.name}>
            <TableCell>
              <FavoriteButton sessionName={session.name} />
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="font-medium">{session.name}</span>
                {session.title && (
                  <span className="text-xs text-default-400">{truncate(session.title, 50)}</span>
                )}
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge
                status={session.wsConnected ? session.wsStatus : session.claudeState}
                wsConnected={session.wsConnected}
              />
            </TableCell>
            <TableCell>
              {session.projectName ? (
                <span className="text-sm">{session.projectName}</span>
              ) : (
                <span className="text-xs text-default-300">--</span>
              )}
            </TableCell>
            <TableCell>
              {session.linearIssue ? (
                <span className="text-sm text-primary">{session.linearIssue.identifier}</span>
              ) : (
                <span className="text-xs text-default-300">--</span>
              )}
            </TableCell>
            <TableCell>
              {session.claudeLastMessage ? (
                <span className="text-xs text-default-500">
                  {truncate(session.claudeLastMessage, 60)}
                </span>
              ) : (
                <span className="text-xs text-default-300">--</span>
              )}
            </TableCell>
            <TableCell>
              <SessionStats turnCount={session.wsTurnCount} cost={session.wsCost} />
            </TableCell>
            <TableCell>
              <span className="text-xs text-default-400">
                {formatRelativeTime(session.created)}
              </span>
            </TableCell>
            <TableCell>
              {session.host ? (
                <span className="text-xs text-default-500">{session.host}</span>
              ) : (
                <span className="text-xs text-default-300">local</span>
              )}
            </TableCell>
            <TableCell>
              <Tooltip content="Kill session">
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  isLoading={killingName === session.name}
                  onPress={() => {
                    setKillingName(session.name);
                    killMutation.mutate(session.name, {
                      onSettled: () => setKillingName(null),
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
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
