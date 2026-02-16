import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, CardHeader, Button, Input, Code, Divider } from '@heroui/react';
import { useSetupToken, useLogin } from '../../hooks/api/useAuth';
import { ROUTES } from '../../utils/constants';

export function LoginPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  const setupTokenQuery = useSetupToken();
  const loginMutation = useLogin();

  const handleGenerateToken = async () => {
    try {
      await setupTokenQuery.refetch();
      setShowSetup(true);
    } catch (error) {
      console.error('Failed to generate token:', error);
    }
  };

  const handleLogin = async () => {
    try {
      await loginMutation.mutateAsync(token);
      navigate(ROUTES.HOME);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const generatedToken = setupTokenQuery.data?.token;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-col gap-2 px-6 pt-6">
          <h1 className="text-2xl font-bold">Claude Session Manager</h1>
          <p className="text-sm text-default-500">Web Dashboard</p>
        </CardHeader>

        <CardBody className="gap-4 px-6 pb-6">
          {!showSetup ? (
            <>
              <p className="text-sm text-default-600">
                Welcome! To access the web dashboard, you need an API token.
              </p>

              <Divider />

              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Already have a token?</h3>
                  <div className="space-y-2">
                    <Input
                      label="API Token"
                      placeholder="Enter your API token"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && token) {
                          handleLogin();
                        }
                      }}
                      disabled={loginMutation.isPending}
                    />
                    <Button
                      color="primary"
                      onClick={handleLogin}
                      isLoading={loginMutation.isPending}
                      isDisabled={!token}
                      className="w-full"
                    >
                      Login
                    </Button>
                    {loginMutation.isError && (
                      <p className="text-xs text-danger">
                        Invalid token. Please try again.
                      </p>
                    )}
                  </div>
                </div>

                <Divider />

                <div>
                  <h3 className="mb-2 text-sm font-semibold">First time setup</h3>
                  <Button
                    color="secondary"
                    variant="flat"
                    onClick={handleGenerateToken}
                    isLoading={setupTokenQuery.isFetching}
                    className="w-full"
                  >
                    Generate New Token
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-success">
                ✓ Token generated successfully!
              </p>

              <div className="space-y-2">
                <p className="text-xs text-default-600">
                  Copy this token and save it somewhere safe. You won't be able to see it again.
                </p>
                <Code className="block w-full break-all p-3 text-xs">
                  {generatedToken}
                </Code>
                <Button
                  size="sm"
                  variant="flat"
                  onClick={() => {
                    if (generatedToken) {
                      navigator.clipboard.writeText(generatedToken);
                    }
                  }}
                  className="w-full"
                >
                  Copy to Clipboard
                </Button>
              </div>

              <Divider />

              <div className="space-y-2">
                <p className="text-xs text-default-600">
                  Now paste the token below to login:
                </p>
                <Input
                  label="API Token"
                  placeholder="Paste your token here"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && token) {
                      handleLogin();
                    }
                  }}
                  disabled={loginMutation.isPending}
                />
                <Button
                  color="primary"
                  onClick={handleLogin}
                  isLoading={loginMutation.isPending}
                  isDisabled={!token}
                  className="w-full"
                >
                  Login
                </Button>
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
