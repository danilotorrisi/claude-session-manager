import { useState, useEffect, useCallback } from 'react';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

/**
 * Manage browser notification permission and sending.
 */
export function useNotifications() {
  const [permission, setPermission] = useState<PermissionState>(() => {
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission as PermissionState;
  });

  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    setPermission(Notification.permission as PermissionState);
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported' as const;
    const result = await Notification.requestPermission();
    setPermission(result as PermissionState);
    return result as PermissionState;
  }, []);

  const notify = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (permission !== 'granted') return null;
      // Only notify when tab is not focused
      if (document.hasFocus()) return null;
      const notification = new Notification(title, {
        icon: '/favicon.ico',
        ...options,
      });
      // Auto-close after 5 seconds
      setTimeout(() => notification.close(), 5000);
      // Focus window on click
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      return notification;
    },
    [permission],
  );

  return {
    permission,
    isSupported: permission !== 'unsupported',
    isGranted: permission === 'granted',
    requestPermission,
    notify,
  };
}
