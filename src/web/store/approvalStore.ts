import { create } from 'zustand';
import type { PendingToolApproval } from '../types';

interface ApprovalEntry {
  sessionName: string;
  approval: PendingToolApproval;
}

interface ApprovalStoreState {
  /** Map key is "sessionName:requestId" */
  pendingApprovals: Map<string, ApprovalEntry>;
  addApproval: (sessionName: string, approval: PendingToolApproval) => void;
  removeApproval: (sessionName: string, requestId: string) => void;
  removeAllForSession: (sessionName: string) => void;
  clearAll: () => void;
  getAll: () => ApprovalEntry[];
}

export const useApprovalStore = create<ApprovalStoreState>()((set, get) => ({
  pendingApprovals: new Map(),

  addApproval: (sessionName, approval) =>
    set((state) => {
      const next = new Map(state.pendingApprovals);
      next.set(`${sessionName}:${approval.requestId}`, { sessionName, approval });
      return { pendingApprovals: next };
    }),

  removeApproval: (sessionName, requestId) =>
    set((state) => {
      const next = new Map(state.pendingApprovals);
      next.delete(`${sessionName}:${requestId}`);
      return { pendingApprovals: next };
    }),

  removeAllForSession: (sessionName) =>
    set((state) => {
      const next = new Map(state.pendingApprovals);
      for (const key of next.keys()) {
        if (key.startsWith(`${sessionName}:`)) {
          next.delete(key);
        }
      }
      return { pendingApprovals: next };
    }),

  clearAll: () => set({ pendingApprovals: new Map() }),

  getAll: () => Array.from(get().pendingApprovals.values()),
}));
