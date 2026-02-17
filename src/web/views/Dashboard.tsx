import { useState, useMemo } from 'react';
import {
  Input,
  Button,
  ButtonGroup,
  Spinner,
} from '@heroui/react';
import { Chip } from '../components/common/Chip';
import { useNavigate } from 'react-router-dom';
import { useSessions } from '../hooks/api/useSessions';
import { useSessionGroups } from '../hooks/ui/useSessionGroups';
import { SessionTable } from '../components/session/SessionTable';
import { SessionCard } from '../components/session/SessionCard';
import { SessionGroupSelector } from '../components/session/SessionGroupSelector';
import { ToolApprovalBanner } from '../components/tools/ToolApprovalBanner';
import { SessionTableSkeleton } from '../components/common/Skeleton';
import { EmptyState } from '../components/common/EmptyState';
import { ROUTES } from '../utils/constants';

type ViewMode = 'table' | 'cards';

const statusColorMap: Record<string, 'danger' | 'warning' | 'success' | 'secondary' | 'default'> = {
  waiting_for_input: 'danger',
  working: 'warning',
  idle: 'default',
  compacting: 'secondary',
  error: 'danger',
  offline: 'default',
};

const statusLabelMap: Record<string, string> = {
  waiting_for_input: 'waiting',
  working: 'working',
  idle: 'idle',
  compacting: 'compacting',
  error: 'error',
  offline: 'offline',
};

export function Dashboard() {
  const navigate = useNavigate();
  const { sessions, isLoading, error, refetch } = useSessions();

  // Local UI state
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Apply group/favorites filter
  const groupFiltered = useSessionGroups(sessions, selectedGroup, showFavoritesOnly);

  // Apply search + status filter
  const filteredSessions = useMemo(() => {
    let result = groupFiltered;

    // Text search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.title?.toLowerCase().includes(q) ||
          s.projectName?.toLowerCase().includes(q) ||
          s.linearIssue?.identifier.toLowerCase().includes(q) ||
          s.claudeLastMessage?.toLowerCase().includes(q) ||
          s.host?.toLowerCase().includes(q),
      );
    }

    // Status filter
    if (statusFilter) {
      result = result.filter((s) => {
        const status = s.wsConnected ? s.wsStatus : s.claudeState;
        return status === statusFilter;
      });
    }

    return result;
  }, [groupFiltered, search, statusFilter]);

  // Compute status counts for filter chips
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of groupFiltered) {
      const status = s.wsConnected ? (s.wsStatus ?? 'unknown') : (s.claudeState ?? 'offline');
      counts[status] = (counts[status] ?? 0) + 1;
    }
    return counts;
  }, [groupFiltered]);

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          title="Failed to load sessions"
          description={error.message}
          action={{ label: 'Retry', onClick: () => refetch() }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Tool approval banner */}
      <ToolApprovalBanner sessions={sessions} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          isClearable
          size="sm"
          placeholder="Search sessions..."
          value={search}
          onValueChange={setSearch}
          className="w-full sm:max-w-xs"
          startContent={
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-default-400">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          }
        />

        <SessionGroupSelector
          selectedGroup={selectedGroup}
          onSelectGroup={setSelectedGroup}
        />

        <Button
          size="sm"
          variant={showFavoritesOnly ? 'solid' : 'flat'}
          color={showFavoritesOnly ? 'warning' : 'default'}
          onPress={() => setShowFavoritesOnly(!showFavoritesOnly)}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={showFavoritesOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          Favorites
        </Button>

        <div className="flex-1" />

        {/* Status filter chips */}
        <div className="hidden md:flex gap-1.5 items-center">
          {Object.entries(statusCounts).map(([status, count]) => {
            const isActive = statusFilter === status;
            const color = statusColorMap[status] ?? 'default';
            const label = statusLabelMap[status] ?? status;
            return (
              <Chip
                key={status}
                size="sm"
                variant={isActive ? 'solid' : 'dot'}
                color={color}
                className="cursor-pointer"
                onClick={() =>
                  setStatusFilter(isActive ? null : status)
                }
              >
                {label} ({count})
              </Chip>
            );
          })}
        </div>

        {/* View mode toggle */}
        <ButtonGroup size="sm" variant="flat">
          <Button
            isIconOnly
            color={viewMode === 'table' ? 'primary' : 'default'}
            onPress={() => setViewMode('table')}
            aria-label="Table view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6"/>
              <line x1="8" y1="12" x2="21" y2="12"/>
              <line x1="8" y1="18" x2="21" y2="18"/>
              <line x1="3" y1="6" x2="3.01" y2="6"/>
              <line x1="3" y1="12" x2="3.01" y2="12"/>
              <line x1="3" y1="18" x2="3.01" y2="18"/>
            </svg>
          </Button>
          <Button
            isIconOnly
            color={viewMode === 'cards' ? 'primary' : 'default'}
            onPress={() => setViewMode('cards')}
            aria-label="Card view"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"/>
              <rect x="14" y="3" width="7" height="7"/>
              <rect x="14" y="14" width="7" height="7"/>
              <rect x="3" y="14" width="7" height="7"/>
            </svg>
          </Button>
        </ButtonGroup>

        <Button
          size="sm"
          color="primary"
          onPress={() => navigate(ROUTES.CREATE)}
        >
          + New Session
        </Button>
      </div>

      {/* Session count */}
      <div className="flex items-center gap-2 text-sm text-default-500">
        <span>
          {filteredSessions.length} session{filteredSessions.length !== 1 ? 's' : ''}
          {filteredSessions.length !== sessions.length && ` (of ${sessions.length})`}
        </span>
        {isLoading && <Spinner size="sm" />}
      </div>

      {/* Content */}
      {sessions.length === 0 && isLoading ? (
        <SessionTableSkeleton rows={4} />
      ) : sessions.length === 0 && !isLoading ? (
        <EmptyState
          title="No sessions yet"
          description="Create your first Claude Code session to get started."
          icon={
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
              <polyline points="7 8 10 11 7 14"/>
              <line x1="12" y1="14" x2="16" y2="14"/>
            </svg>
          }
          action={{
            label: 'Create Session',
            onClick: () => navigate(ROUTES.CREATE),
          }}
        />
      ) : viewMode === 'table' ? (
        <SessionTable sessions={filteredSessions} isLoading={isLoading} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSessions.map((session) => (
            <SessionCard key={session.name} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
