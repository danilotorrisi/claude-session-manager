import { useState, useCallback, useEffect } from 'react';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  RadioGroup,
  Radio,
  Snippet,
  Spinner,
} from '@heroui/react';
import { useTheme } from '../hooks/ui/useTheme';
import { useAuthStore } from '../store/authStore';
import { apiClient } from '../services/client';

export function SettingsView() {
  const { theme, setTheme, isDark } = useTheme();
  const { token, login, logout } = useAuthStore();
  const [linearKey, setLinearKey] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [apiError, setApiError] = useState<string | null>(null);

  const tokenPreview = token
    ? `${token.slice(0, 8)}..${token.slice(-4)}`
    : 'Not set';

  // Check API connection
  const checkApiConnection = useCallback(async () => {
    setApiStatus('checking');
    setApiError(null);
    try {
      await apiClient.get('/api/sessions');
      setApiStatus('connected');
    } catch (err: any) {
      setApiStatus('error');
      setApiError(err.response?.status === 401 ? 'Unauthorized' : err.message || 'Connection failed');
    }
  }, []);

  // Check on mount
  useEffect(() => {
    checkApiConnection();
  }, [checkApiConnection]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    try {
      const response = await apiClient.get<{ token: string }>('/api/auth/setup');
      if (response.data?.token) {
        login(response.data.token);
      }
    } catch {
      // Setup endpoint might not be available; ignore
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-default-500 mt-1">
          Configure your CSM web dashboard preferences
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Appearance</h2>
          </CardHeader>
          <CardBody className="gap-4">
            <RadioGroup
              label="Theme"
              orientation="horizontal"
              value={theme}
              onValueChange={(val) => setTheme(val as 'light' | 'dark' | 'system')}
              description="Choose between light, dark, or system theme"
            >
              <Radio value="system">System</Radio>
              <Radio value="light">Light</Radio>
              <Radio value="dark">Dark</Radio>
            </RadioGroup>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Current mode</p>
                <p className="text-xs text-default-500">
                  {isDark ? 'Dark mode active' : 'Light mode active'}
                </p>
              </div>
              <div className="w-8 h-8 rounded-full border border-divider flex items-center justify-center">
                {isDark ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Authentication & Token Management */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Authentication</h2>
          </CardHeader>
          <CardBody className="gap-4">
            <div>
              <p className="text-sm font-medium mb-1">API Token</p>
              <div className="flex items-center gap-2">
                <Snippet
                  symbol=""
                  variant="flat"
                  className="flex-1"
                  hideCopyButton={!showToken}
                >
                  {showToken ? (token || 'Not set') : tokenPreview}
                </Snippet>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() => setShowToken(!showToken)}
                >
                  {showToken ? 'Hide' : 'Show'}
                </Button>
              </div>
              <p className="text-xs text-default-500 mt-1">
                This token authenticates your web dashboard with the CSM API server
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="flat"
                color="warning"
                onPress={handleRegenerate}
                isLoading={regenerating}
              >
                Regenerate Token
              </Button>
              <p className="text-xs text-default-500">
                This will invalidate your current token
              </p>
            </div>
            <Divider />
            <Button
              color="danger"
              variant="flat"
              onPress={logout}
            >
              Sign Out
            </Button>
          </CardBody>
        </Card>

        {/* API Connection Status */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">API Connection</h2>
            <Chip
              size="sm"
              variant="flat"
              color={
                apiStatus === 'connected' ? 'success' :
                apiStatus === 'error' ? 'danger' : 'default'
              }
            >
              {apiStatus === 'checking' ? 'Checking...' :
               apiStatus === 'connected' ? 'Connected' : 'Disconnected'}
            </Chip>
          </CardHeader>
          <CardBody className="gap-3">
            {apiStatus === 'checking' && (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span className="text-sm text-default-500">Checking API connection...</span>
              </div>
            )}
            {apiStatus === 'connected' && (
              <p className="text-sm text-success">
                Successfully connected to CSM API server.
              </p>
            )}
            {apiStatus === 'error' && (
              <div>
                <p className="text-sm text-danger">
                  Failed to connect: {apiError}
                </p>
              </div>
            )}
            <Button
              size="sm"
              variant="flat"
              onPress={checkApiConnection}
              isDisabled={apiStatus === 'checking'}
            >
              Test Connection
            </Button>
          </CardBody>
        </Card>

        {/* Linear Integration */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">Linear Integration</h2>
          </CardHeader>
          <CardBody className="gap-4">
            <Input
              type="password"
              label="Linear API Key"
              placeholder="lin_api_..."
              value={linearKey}
              onValueChange={setLinearKey}
              description="Your Linear API key for issue search and task management. Configured via CSM config file."
            />
            <p className="text-xs text-default-500">
              The Linear API key is stored in your CSM config at{' '}
              <code className="text-primary bg-primary-50 dark:bg-primary-900/20 px-1 rounded">
                ~/.config/csm/config.json
              </code>
            </p>
          </CardBody>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold">About</h2>
          </CardHeader>
          <CardBody>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-default-500">Application</span>
                <span className="font-medium">Claude Session Manager</span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-500">Version</span>
                <Chip size="sm" variant="flat" color="primary">v1.4.0</Chip>
              </div>
              <div className="flex justify-between">
                <span className="text-default-500">Dashboard</span>
                <span className="font-medium">Web UI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-500">Runtime</span>
                <span className="font-medium">Bun + React</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
