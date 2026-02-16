import { Navigate, Outlet } from 'react-router-dom';
import { useIsAuthenticated } from '../../hooks/api/useAuth';
import { ROUTES } from '../../utils/constants';

/**
 * Protected route wrapper that redirects to login if not authenticated.
 */
export function ProtectedRoute() {
  const isAuthenticated = useIsAuthenticated();

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  return <Outlet />;
}
