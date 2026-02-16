import { createBrowserRouter, Navigate } from 'react-router-dom';
import { LoginPage } from './components/auth/LoginPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './views/Dashboard';
import { SessionDetail } from './views/SessionDetail';
import { CreateSession } from './views/CreateSession';
import { ProjectsView } from './views/ProjectsView';
import { HostsView } from './views/HostsView';
import { TasksView } from './views/TasksView';
import { SettingsView } from './views/SettingsView';
import { ROUTES } from './utils/constants';

export const router = createBrowserRouter([
  {
    path: ROUTES.LOGIN,
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <Dashboard />,
          },
          {
            path: ROUTES.SESSION_DETAIL,
            element: <SessionDetail />,
          },
          {
            path: ROUTES.CREATE,
            element: <CreateSession />,
          },
          {
            path: ROUTES.PROJECTS,
            element: <ProjectsView />,
          },
          {
            path: ROUTES.HOSTS,
            element: <HostsView />,
          },
          {
            path: ROUTES.TASKS,
            element: <TasksView />,
          },
          {
            path: ROUTES.SETTINGS,
            element: <SettingsView />,
          },
          {
            path: '*',
            element: <Navigate to={ROUTES.HOME} replace />,
          },
        ],
      },
    ],
  },
]);
