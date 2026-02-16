import { RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HeroUIProvider } from '@heroui/react';
import { router } from './router';
import { useTheme } from './hooks/ui/useTheme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function ThemeProvider({ children }: { children: React.ReactNode }) {
  useTheme();
  return <>{children}</>;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <HeroUIProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </HeroUIProvider>
    </QueryClientProvider>
  );
}
