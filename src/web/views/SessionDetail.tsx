import { useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Chip,
  Breadcrumbs,
  BreadcrumbItem,
} from '@heroui/react';
import { useSessionDetail } from '../hooks/api/useSessionDetail';
import { useSessionStream } from '../hooks/websocket/useSessionStream';
import { useToolApprovals } from '../hooks/websocket/useToolApprovals';
import { useKeyboardShortcuts } from '../hooks/ui/useKeyboardShortcuts';
import { LogViewer } from '../components/messaging/LogViewer';
import { MessageInput } from '../components/messaging/MessageInput';
import { GitChanges } from '../components/session/GitChanges';
import { FeedbackBadge } from '../components/session/FeedbackBadge';
import { ToolApprovalModal } from '../components/tools/ToolApprovalModal';
import { EmptyState } from '../components/common/EmptyState';
import { SessionDetailSkeleton } from '../components/common/Skeleton';
import { sendMessage } from '../services/messages';
import { killSession } from '../services/sessions';
import { ROUTES } from '../utils/constants';

function claudeStateChip(state?: string, attached?: boolean) {
  switch (state) {
    case 'working':
      return <Chip color="warning" variant="dot" size="sm">Working</Chip>;
    case 'waiting_for_input':
      return <Chip color="danger" variant="dot" size="sm">Waiting for input</Chip>;
    case 'idle':
      return <Chip variant="dot" size="sm">Idle</Chip>;
    default:
      if (!attached) {
        return <Chip color="default" variant="flat" size="sm">Detached</Chip>;
      }
      return <Chip variant="flat" size="sm">Unknown</Chip>;
  }
}

export function SessionDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { session, isLoading, error } = useSessionDetail(name);
  const { entries, streamingText, clear: clearLog, addUserMessage } = useSessionStream(name);
  const {
    pendingApprovals,
    approve,
    deny,
    isApproving,
    isDenying,
  } = useToolApprovals();

  // Find pending approval for this session
  const sessionApproval = useMemo(
    () => pendingApprovals.find((a) => a.sessionName === name),
    [pendingApprovals, name],
  );

  // Also check the session's own pendingApproval from SSE state
  const activePendingApproval = sessionApproval?.approval ?? session?.pendingApproval ?? null;

  const sendMutation = useMutation({
    mutationFn: (text: string) => sendMessage(name!, text),
  });

  const killMutation = useMutation({
    mutationFn: () => killSession(name!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      navigate(ROUTES.HOME);
    },
  });

  const handleSend = useCallback(
    (text: string) => {
      if (!name) return;
      addUserMessage(text);
      sendMutation.mutate(text);
    },
    [name, sendMutation, addUserMessage],
  );

  const handleKill = useCallback(() => {
    if (!name) return;
    if (window.confirm(`Kill session "${name}"? This will terminate the tmux session.`)) {
      killMutation.mutate();
    }
  }, [name, killMutation]);

  const handleApprove = useCallback(() => {
    if (!name || !activePendingApproval) return;
    approve(name, activePendingApproval.requestId);
  }, [name, activePendingApproval, approve]);

  const handleDeny = useCallback(() => {
    if (!name || !activePendingApproval) return;
    deny(name, activePendingApproval.requestId);
  }, [name, activePendingApproval, deny]);

  // Keyboard shortcuts for tool approval
  useKeyboardShortcuts(
    useMemo(
      () =>
        activePendingApproval
          ? [
              { key: 'y', handler: handleApprove },
              { key: 'n', handler: handleDeny },
            ]
          : [],
      [activePendingApproval, handleApprove, handleDeny],
    ),
  );

  if (isLoading) {
    return <SessionDetailSkeleton />;
  }

  if (error) {
    return (
      <div className="p-6">
        <EmptyState
          title="Failed to load session"
          description={error instanceof Error ? error.message : 'Unknown error'}
          action={{ label: 'Go Back', onClick: () => navigate(ROUTES.HOME) }}
        />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="p-6">
        <EmptyState
          title="Session not found"
          description={`No session named "${name}" was found.`}
          action={{ label: 'Go to Dashboard', onClick: () => navigate(ROUTES.HOME) }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header area */}
      <div className="p-4 pb-0">
        <Breadcrumbs className="mb-3">
          <BreadcrumbItem onPress={() => navigate(ROUTES.HOME)}>
            Dashboard
          </BreadcrumbItem>
          <BreadcrumbItem>{session.name}</BreadcrumbItem>
        </Breadcrumbs>

        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {session.name}
              <Chip
                color={session.attached ? 'success' : 'default'}
                variant="flat"
                size="sm"
              >
                {session.attached ? 'Attached' : 'Detached'}
              </Chip>
            </h1>
            {session.title && (
              <p className="text-sm text-default-600 mt-1">{session.title}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {claudeStateChip(session.wsStatus ?? session.claudeState, session.attached)}
            {session.wsConnected && (
              <Chip color="success" variant="flat" size="sm">WS</Chip>
            )}
            <Button
              color="danger"
              variant="flat"
              size="sm"
              onPress={handleKill}
              isLoading={killMutation.isPending}
            >
              Kill Session
            </Button>
          </div>
        </div>
      </div>

      {/* Two-column layout on lg, single column on mobile */}
      <div className="flex-1 min-h-0 px-4 pb-4 flex flex-col">
        <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
          {/* Left panel: Claude view + message input */}
          <div className="flex-1 min-w-0 flex flex-col gap-4 min-h-0">
            {/* Live Log */}
            <div className="flex-1 min-h-0">
              <LogViewer entries={entries} streamingText={streamingText} onClear={clearLog} className="h-full" />
            </div>

            {/* Message input */}
            <div className="shrink-0">
              <MessageInput
                onSend={handleSend}
                isSending={sendMutation.isPending}
                disabled={(session.wsStatus ?? session.claudeState) === 'working'}
                placeholder={
                  (session.wsStatus ?? session.claudeState) === 'working'
                    ? 'Claude is working...'
                    : 'Type a message... (Cmd+Enter to send)'
                }
              />
            </div>
          </div>

          {/* Right panel: git changes + feedback */}
          <div className="w-full lg:w-[380px] lg:shrink-0 space-y-4 lg:overflow-y-auto lg:min-h-0">
            {/* Git Changes */}
            {session.gitStats && session.gitStats.filesChanged > 0 && (
              <GitChanges stats={session.gitStats} sessionName={name!} />
            )}

            {/* Feedback Reports */}
            {session.feedbackReports && session.feedbackReports.length > 0 && (
              <FeedbackBadge reports={session.feedbackReports} />
            )}
          </div>
        </div>
      </div>

      {/* Tool Approval Modal */}
      {activePendingApproval && (
        <ToolApprovalModal
          isOpen
          toolName={activePendingApproval.toolName}
          toolInput={activePendingApproval.toolInput}
          description={activePendingApproval.description}
          onApprove={handleApprove}
          onDeny={handleDeny}
          isApproving={isApproving}
          isDenying={isDenying}
        />
      )}
    </div>
  );
}
