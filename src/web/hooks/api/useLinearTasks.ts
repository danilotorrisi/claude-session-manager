import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../services/client';
import { DEBOUNCE_DELAY } from '../../utils/constants';
import type { LinearIssue } from '../../types';

export interface LinearComment {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    displayName: string;
    avatarUrl?: string;
  };
}

interface LinearSearchResponse {
  issues: LinearIssue[];
}

async function searchLinearIssues(query: string): Promise<LinearIssue[]> {
  if (!query.trim()) return [];
  const response = await apiClient.get<LinearSearchResponse>('/api/linear/search', {
    params: { q: query },
  });
  return response.data.issues;
}

async function fetchMyIssues(): Promise<LinearIssue[]> {
  const response = await apiClient.get<LinearSearchResponse>('/api/linear/my-issues');
  return response.data.issues;
}

/**
 * Hook for searching Linear issues with 300ms debounce.
 */
export function useLinearSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, DEBOUNCE_DELAY);
    return () => clearTimeout(timerRef.current);
  }, [searchTerm]);

  const query = useQuery<LinearIssue[]>({
    queryKey: ['linear-search', debouncedTerm],
    queryFn: () => searchLinearIssues(debouncedTerm),
    enabled: debouncedTerm.length >= 2,
    staleTime: 30_000,
  });

  return {
    searchTerm,
    setSearchTerm,
    results: query.data ?? [],
    isSearching: query.isFetching,
    error: query.error,
  };
}

/**
 * Hook for fetching the current user's assigned Linear issues.
 */
export function useMyLinearIssues() {
  const query = useQuery<LinearIssue[]>({
    queryKey: ['linear-my-issues'],
    queryFn: fetchMyIssues,
    staleTime: 60_000,
  });

  return {
    issues: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching a single Linear issue by identifier (e.g., "MPO-142").
 * Tries to find it in cached data first, then searches for it.
 */
export function useLinearIssue(identifier: string) {
  const query = useQuery<LinearIssue | null>({
    queryKey: ['linear-issue', identifier],
    queryFn: async () => {
      // Try searching for the specific issue
      const results = await searchLinearIssues(identifier);
      // Find exact match by identifier
      const match = results.find(
        (issue) => issue.identifier.toLowerCase() === identifier.toLowerCase()
      );
      return match || null;
    },
    enabled: !!identifier,
    staleTime: 60_000,
  });

  return {
    issue: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}

/**
 * Hook for fetching comments for a Linear issue.
 */
export function useIssueComments(issueId: string | undefined) {
  const query = useQuery<LinearComment[]>({
    queryKey: ['linear-comments', issueId],
    queryFn: async () => {
      if (!issueId) return [];
      const response = await apiClient.get<{ comments: LinearComment[] }>(
        `/api/linear/issues/${issueId}/comments`
      );
      return response.data.comments;
    },
    enabled: !!issueId,
    staleTime: 30_000,
  });

  return {
    comments: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for creating a comment on a Linear issue.
 */
export function useCreateComment(issueId: string | undefined) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (body: string) => {
      if (!issueId) throw new Error('Issue ID is required');
      const response = await apiClient.post<{ comment: LinearComment }>(
        `/api/linear/issues/${issueId}/comments`,
        { body }
      );
      return response.data.comment;
    },
    onSuccess: () => {
      // Invalidate comments query to refetch
      queryClient.invalidateQueries({ queryKey: ['linear-comments', issueId] });
    },
  });

  return {
    createComment: mutation.mutate,
    isCreating: mutation.isPending,
    error: mutation.error,
  };
}
