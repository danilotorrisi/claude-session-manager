import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../services/client';
import type { Project, Config, HostConfig } from '../../types';

interface ConfigResponse {
  config: Config;
}

async function fetchConfig(): Promise<Config> {
  const response = await apiClient.get<ConfigResponse>('/api/config');
  return response.data.config;
}

/**
 * Hook for fetching projects from the config.
 */
export function useProjects() {
  const query = useQuery<Config>({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: 30_000,
  });

  return {
    projects: query.data?.projects ?? [],
    hosts: query.data?.hosts ?? {},
    hasLinear: (query.data as any)?.hasLinear ?? false,
    config: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Hook for fetching hosts from the config.
 */
export function useHosts() {
  const query = useQuery<Config>({
    queryKey: ['config'],
    queryFn: fetchConfig,
    staleTime: 30_000,
  });

  const hosts = query.data?.hosts ?? {};
  const hostList = Object.entries(hosts).map(([name, config]) => ({
    name,
    ...config,
  }));

  return {
    hosts: hostList,
    hostsMap: hosts,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
