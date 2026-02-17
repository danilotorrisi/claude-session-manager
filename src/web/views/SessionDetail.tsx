import { useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  Breadcrumbs,
  BreadcrumbItem,
} from '@heroui/react';
import { Chip } from '../components/common/Chip';
import { useSessionDetail } from '../hooks/api/useSessionDetail';
import { useSessionStream } from '../hooks/websocket/useSessionStream';
import { useToolApprovals } from '../hooks/websocket/useToolApprovals';
import { useKeyboardShortcuts } from '../hooks/ui/useKeyboardShortcuts';
import { LogViewer } from '../components/messaging/LogViewer';
import { MessageInput, type MessageInputHandle } from '../components/messaging/MessageInput';
import { GitChanges } from '../components/session/GitChanges';
import { FeedbackBadge } from '../components/session/FeedbackBadge';
import { ToolApprovalModal } from '../components/tools/ToolApprovalModal';
import { EmptyState } from '../components/common/EmptyState';
import { SessionDetailSkeleton } from '../components/common/Skeleton';
import { sendMessage } from '../services/messages';
import { killSession, reconnectSession } from '../services/sessions';
import { ROUTES } from '../utils/constants';

function claudeStateChip(state?: string, attached?: boolean) {
  switch (state) {
    case 'working':
      return <Chip color="warning" variant="dot" size="sm">Working</Chip>;
    case 'waiting_for_input':
      return <Chip color="danger" variant="dot" size="sm">Waiting</Chip>;
    case 'idle':
      return <Chip variant="dot" size="sm">Idle</Chip>;
    default:
      return (
        <Chip
          color={attached ? 'success' : 'default'}
          variant="dot"
          size="sm"
        >
          {attached ? 'Attached' : 'Detached'}
        </Chip>
      );
  }
}

export function SessionDetail() {
  const { name } = useParams<{ name: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const messageInputRef = useRef<MessageInputHandle>(null);
  const { session, isLoading, error } = useSessionDetail(name);
  const { entries, streamingText, isWorking, clear: clearLog, addUserMessage } = useSessionStream(name);
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

  const reconnectMutation = useMutation({
    mutationFn: () => reconnectSession(name!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
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
              {claudeStateChip(session.wsStatus ?? session.claudeState, session.attached)}
              {session.wsConnected && (
                <Chip color="success" variant="dot" size="sm">WS</Chip>
              )}
            </h1>
            {session.title && (
              <p className="text-sm text-default-600 mt-1">{session.title}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!session.wsConnected && (
              <Button
                color="primary"
                variant="flat"
                size="sm"
                onPress={() => reconnectMutation.mutate()}
                isLoading={reconnectMutation.isPending}
              >
                Reconnect
              </Button>
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

      {/* Two-column layout with divider */}
      <div className="flex-1 min-h-0 px-4 pb-4 flex flex-col">
        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          {/* Left panel: Claude view + message input */}
          <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0 pr-4">
            <div className="flex-1 min-h-0">
              <LogViewer entries={entries} streamingText={streamingText} isWorking={isWorking} onClear={clearLog} onClickArea={() => messageInputRef.current?.focus()} className="h-full" />
            </div>
            <div className="shrink-0">
              <MessageInput
                ref={messageInputRef}
                onSend={handleSend}
                isSending={sendMutation.isPending}
                disabled={(session.wsStatus ?? session.claudeState) === 'working'}
                placeholder={
                  (session.wsStatus ?? session.claudeState) === 'working'
                    ? 'Claude is working...'
                    : 'Type a message... (Shift+Enter for new line)'
                }
              />
            </div>
          </div>

          {/* Divider */}
          <div className="hidden lg:block w-px bg-default-200 shrink-0" />

          {/* Right panel: git changes + feedback */}
          <div className="w-full lg:w-[340px] lg:shrink-0 space-y-4 lg:overflow-y-auto lg:min-h-0 lg:pl-4 pt-4 lg:pt-0">
            {session.gitStats && session.gitStats.filesChanged > 0 && (
              <GitChanges stats={session.gitStats} sessionName={name!} />
            )}
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
