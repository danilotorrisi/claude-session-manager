import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
} from '@heroui/react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { NotificationManager } from '../tools/NotificationManager';
import { ShortcutList } from '../common/KeyboardHint';
import { useUIStore } from '../../store/uiStore';
import { useKeyboardShortcuts } from '../../hooks/ui/useKeyboardShortcuts';
import { useNotifications } from '../../hooks/ui/useNotifications';
import { ROUTES } from '../../utils/constants';

const SHORTCUT_HELP = [
  { keys: '/', description: 'Focus search' },
  { keys: '\u2318K', description: 'Quick search' },
  { keys: 'Esc', description: 'Go back / close modal' },
  { keys: 'N', description: 'New session' },
  { keys: 'Y', description: 'Approve tool' },
  { keys: '?', description: 'Show keyboard shortcuts' },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const { requestPermission, isSupported, isGranted } = useNotifications();
  const [showShortcuts, setShowShortcuts] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Request notification permission on first mount
  useEffect(() => {
    if (isSupported && !isGranted) {
      requestPermission();
    }
  }, [isSupported, isGranted, requestPermission]);

  // Close sidebar on mobile when navigating
  useEffect(() => {
    const isMobile = window.innerWidth < 768;
    if (isMobile && sidebarOpen) {
      toggleSidebar();
    }
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchFocus = useCallback(() => {
    // Find the search input on the dashboard and focus it
    const searchInput = document.querySelector<HTMLInputElement>(
      'input[placeholder*="Search"]',
    );
    if (searchInput) {
      searchInput.focus();
    }
  }, []);

  const handleGoBack = useCallback(() => {
    if (showShortcuts) {
      setShowShortcuts(false);
      return;
    }
    // If on a sub-page, go back to dashboard
    if (location.pathname !== '/') {
      navigate(ROUTES.HOME);
    }
  }, [showShortcuts, location.pathname, navigate]);

  // Global keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => [
        { key: '/', handler: handleSearchFocus },
        { key: 'k', metaKey: true, handler: handleSearchFocus },
        { key: 'Escape', handler: handleGoBack },
        { key: 'n', handler: () => navigate(ROUTES.CREATE) },
        {
          key: '?',
          shiftKey: true,
          handler: () => setShowShortcuts((prev) => !prev),
        },
      ],
      [handleSearchFocus, handleGoBack, navigate],
    ),
  );

  // Touch gesture: swipe right to open sidebar, swipe left to close
  useEffect(() => {
    let startX = 0;
    let startY = 0;

    function handleTouchStart(e: TouchEvent) {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
    }

    function handleTouchEnd(e: TouchEvent) {
      const endX = e.changedTouches[0].clientX;
      const endY = e.changedTouches[0].clientY;
      const dx = endX - startX;
      const dy = endY - startY;

      // Only trigger on mostly-horizontal swipes (> 80px, angle < 30deg)
      if (Math.abs(dx) > 80 && Math.abs(dy) < Math.abs(dx) * 0.58) {
        const store = useUIStore.getState();
        if (dx > 0 && !store.sidebarOpen) {
          store.toggleSidebar();
        } else if (dx < 0 && store.sidebarOpen) {
          store.toggleSidebar();
        }
      }
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        {/* Overlay for mobile when sidebar is open */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 md:hidden"
            onClick={toggleSidebar}
          />
        )}
        <main
          ref={mainRef}
          className="flex-1 overflow-y-auto transition-all duration-200"
        >
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <Footer />

      {/* Background notification watcher */}
      <NotificationManager />

      {/* Keyboard shortcuts help modal */}
      <Modal
        isOpen={showShortcuts}
        onOpenChange={setShowShortcuts}
        size="sm"
      >
        <ModalContent>
          <ModalHeader>Keyboard Shortcuts</ModalHeader>
          <ModalBody className="pb-6">
            <ShortcutList shortcuts={SHORTCUT_HELP} />
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
