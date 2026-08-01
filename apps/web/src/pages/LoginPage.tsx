import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Database, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function LoginPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const meta = useQuery({ queryKey: ['meta'], queryFn: api.meta });

  const login = useMutation({
    mutationFn: () => api.login(password),
    onSuccess: () => {
      toast.success('Signed in');
      navigate('/');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    if (meta.data?.authMode === 'none') navigate('/');
  }, [meta.data?.authMode, navigate]);

  if (meta.data?.authMode === 'none') {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-xl">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-fg)]">
            <Database className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold">Sign in to Vast</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Enter the admin password</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            login.mutate();
          }}
          className="space-y-3"
        >
          <Input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
          />
          <Button className="w-full" type="submit" disabled={login.isPending || !password}>
            {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Continue
          </Button>
        </form>
      </div>
    </div>
  );
}
