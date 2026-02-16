import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../services/client';
import { useAuthStore } from '../../store/authStore';

interface SetupTokenResponse {
  token: string;
}

interface ValidateTokenResponse {
  valid: boolean;
}

/**
 * Hook to get or create the default API token (first-time setup).
 */
export function useSetupToken() {
  return useQuery({
    queryKey: ['auth', 'setup'],
    queryFn: async () => {
      const response = await apiClient.get<SetupTokenResponse>('/api/auth/setup');
      return response.data;
    },
    enabled: false, // Only run when explicitly requested
    retry: false,
  });
}

/**
 * Hook to validate an API token.
 */
export function useValidateToken() {
  return useMutation({
    mutationFn: async (token: string) => {
      const response = await apiClient.post<ValidateTokenResponse>('/api/auth/validate', { token });
      return response.data;
    },
  });
}

/**
 * Hook to login with a token.
 */
export function useLogin() {
  const login = useAuthStore((state) => state.login);
  const validateMutation = useValidateToken();

  return useMutation({
    mutationFn: async (token: string) => {
      // Validate token first
      const result = await validateMutation.mutateAsync(token);
      if (!result.valid) {
        throw new Error('Invalid token');
      }
      // Store token
      login(token);
      return true;
    },
  });
}

/**
 * Hook to logout.
 */
export function useLogout() {
  const logout = useAuthStore((state) => state.logout);

  return useMutation({
    mutationFn: async () => {
      logout();
      return true;
    },
  });
}

/**
 * Hook to check if user is authenticated.
 */
export function useIsAuthenticated() {
  return useAuthStore((state) => state.isAuthenticated);
}
