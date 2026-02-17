// API configuration
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Storage keys
export const AUTH_TOKEN_KEY = 'csm-auth-token';

// Routes
export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  SESSIONS: '/sessions',
  SESSION_DETAIL: '/sessions/:name',
  CREATE: '/create',
  PROJECTS: '/projects',
  HOSTS: '/hosts',
  TASKS: '/tasks',
  TASK_DETAIL: '/tasks/:id',
  TOOL_RULES: '/tool-rules',
  SETTINGS: '/settings',
} as const;

// Polling intervals
export const POLL_INTERVAL = 5000; // 5 seconds
export const SSE_RECONNECT_DELAY = 1000; // 1 second

// UI constants
export const MAX_LOG_ENTRIES = 50;
export const DEBOUNCE_DELAY = 300; // 300ms for search inputs
