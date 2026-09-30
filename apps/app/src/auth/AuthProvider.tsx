import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { clearToken, loadToken, saveToken } from './tokenStore';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;
    loadToken().then((token) => {
      if (!active) return;
      setAuthToken(token);
      setStatus(token ? 'signedIn' : 'signedOut');
    });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (token: string) => {
    await saveToken(token);
    setAuthToken(token);
    setStatus('signedIn');
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setAuthToken(null);
    setStatus('signedOut');
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo(() => ({ status, signIn, signOut }), [status, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  return value;
}
