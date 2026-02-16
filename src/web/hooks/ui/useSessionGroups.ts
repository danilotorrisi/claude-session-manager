import { useMemo } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import type { SessionWithWs } from '../../services/sessions';

/**
 * Filter sessions by group and favorites.
 */
export function useSessionGroups(
  sessions: SessionWithWs[],
  selectedGroupId: string | null,
  showFavoritesOnly: boolean,
) {
  const groups = useSessionStore((s) => s.groups);
  const favorites = useSessionStore((s) => s.favorites);

  return useMemo(() => {
    let filtered = sessions;

    // Filter by group
    if (selectedGroupId) {
      const group = groups.find((g) => g.id === selectedGroupId);
      if (group) {
        const nameSet = new Set(group.sessionNames);
        filtered = filtered.filter((s) => nameSet.has(s.name));
      }
    }

    // Filter to favorites only
    if (showFavoritesOnly) {
      const favSet = new Set(favorites);
      filtered = filtered.filter((s) => favSet.has(s.name));
    }

    return filtered;
  }, [sessions, selectedGroupId, showFavoritesOnly, groups, favorites]);
}
