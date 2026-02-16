import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SessionStoreState } from '../types';

export const useSessionStore = create<SessionStoreState>()(
  persist(
    (set) => ({
      groups: [],
      favorites: [],

      addGroup: (name) =>
        set((state) => ({
          groups: [
            ...state.groups,
            { id: crypto.randomUUID(), name, sessionNames: [] },
          ],
        })),

      removeGroup: (id) =>
        set((state) => ({
          groups: state.groups.filter((g) => g.id !== id),
        })),

      addSessionToGroup: (groupId, sessionName) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId && !g.sessionNames.includes(sessionName)
              ? { ...g, sessionNames: [...g.sessionNames, sessionName] }
              : g,
          ),
        })),

      removeSessionFromGroup: (groupId, sessionName) =>
        set((state) => ({
          groups: state.groups.map((g) =>
            g.id === groupId
              ? { ...g, sessionNames: g.sessionNames.filter((n) => n !== sessionName) }
              : g,
          ),
        })),

      toggleFavorite: (sessionName) =>
        set((state) => ({
          favorites: state.favorites.includes(sessionName)
            ? state.favorites.filter((n) => n !== sessionName)
            : [...state.favorites, sessionName],
        })),
    }),
    {
      name: 'csm-session-prefs',
    },
  ),
);
