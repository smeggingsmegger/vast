import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { HomePage } from '@/pages/HomePage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ConnectionPage } from '@/pages/ConnectionPage';
import { DatabasePage } from '@/pages/DatabasePage';
import { DocumentsPage } from '@/pages/DocumentsPage';
import { ScriptShellPage } from '@/pages/ScriptShellPage';
import { LoginPage } from '@/pages/LoginPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route index element={<HomePage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="c/:cid" element={<ConnectionPage />} />
            <Route path="c/:cid/shell" element={<ScriptShellPage />} />
            <Route path="c/:cid/db/:db" element={<DatabasePage />} />
            <Route path="c/:cid/db/:db/col/:col" element={<DocumentsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
        <CommandPalette />
      </BrowserRouter>
      <Toaster theme="system" position="bottom-right" toastOptions={{ className: 'font-sans' }} />
    </QueryClientProvider>
  );
}
