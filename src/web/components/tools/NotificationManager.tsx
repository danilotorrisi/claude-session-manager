import { useEffect, useRef } from 'react';
import { useNotifications } from '../../hooks/ui/useNotifications';
import { useSessions } from '../../hooks/api/useSessions';

/**
 * Invisible component that watches session state and fires browser
 * notifications for tool approvals and errors when the tab is not focused.
 */
export function NotificationManager() {
  const { notify, isGranted } = useNotifications();
  const { sessions } = useSessions();
  const prevApprovalsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isGranted) return;

    const currentApprovals = new Set<string>();
    for (const session of sessions) {
      if (session.pendingApproval) {
        const key = `${session.name}:${session.pendingApproval.requestId}`;
        currentApprovals.add(key);

        // Only notify for new approvals
        if (!prevApprovalsRef.current.has(key)) {
          notify(`Tool Approval: ${session.pendingApproval.toolName}`, {
            body: `Session "${session.name}" needs approval for ${session.pendingApproval.toolName}`,
            tag: key,
          });
        }
      }
    }

    prevApprovalsRef.current = currentApprovals;
  }, [sessions, isGranted, notify]);

  return null;
}
