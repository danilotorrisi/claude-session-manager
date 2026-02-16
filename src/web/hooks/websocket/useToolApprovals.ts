import { useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useApprovalStore } from '../../store/approvalStore';
import { approveTool, denyTool } from '../../services/approvals';
import { useSessions } from '../api/useSessions';

/**
 * Global tool approval management.
 *
 * Tracks pending approvals in the approval store and exposes
 * approve/deny mutations that call the API and update the store.
 */
export function useToolApprovals() {
  const store = useApprovalStore();
  const { invalidate } = useSessions();

  const approveMutation = useMutation({
    mutationFn: async ({
      sessionName,
      requestId,
    }: {
      sessionName: string;
      requestId: string;
    }) => {
      const success = await approveTool(sessionName, requestId);
      if (success) {
        store.removeApproval(sessionName, requestId);
      }
      return success;
    },
    onSuccess: () => invalidate(),
  });

  const denyMutation = useMutation({
    mutationFn: async ({
      sessionName,
      requestId,
      message,
    }: {
      sessionName: string;
      requestId: string;
      message?: string;
    }) => {
      const success = await denyTool(sessionName, requestId, message);
      if (success) {
        store.removeApproval(sessionName, requestId);
      }
      return success;
    },
    onSuccess: () => invalidate(),
  });

  const approve = useCallback(
    (sessionName: string, requestId: string) =>
      approveMutation.mutateAsync({ sessionName, requestId }),
    [approveMutation],
  );

  const deny = useCallback(
    (sessionName: string, requestId: string, message?: string) =>
      denyMutation.mutateAsync({ sessionName, requestId, message }),
    [denyMutation],
  );

  return {
    pendingApprovals: store.getAll(),
    approve,
    deny,
    isApproving: approveMutation.isPending,
    isDenying: denyMutation.isPending,
  };
}
