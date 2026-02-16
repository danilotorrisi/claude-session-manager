import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { apiClient } from '../../services/client';
import { DEBOUNCE_DELAY } from '../../utils/constants';
import type { LinearIssue } from '../../types';

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
