import type { AuthResponse, User } from '@haruleaf/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fetchMe, logoutRequest } from '@/api/auth';
import { ApiError, getAuthToken, setAuthToken, setUnauthorizedHandler } from '@/api/client';
import { clearToken, loadToken, saveToken } from './tokenStore';

export type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: User }
  | { status: 'unreachable'; message: string };

type AuthContextValue = {
  state: AuthState;
  signIn: (auth: AuthResponse) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (user: User) => void;
  retry: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function clearStoredToken(): Promise<void> {
  try {
    await clearToken();
  } catch {
    // 저장소 삭제 실패는 무시한다. 메모리 상태는 이미 로그아웃이다.
  }
}

// 저장된 토큰으로 세션을 복원한다. 상태를 직접 바꾸지 않고 결과 상태만 돌려준다.
async function restoreSession(): Promise<AuthState> {
  const token = await loadToken();
  if (!token) return { status: 'signedOut' };
  try {
    const { user } = await fetchMe(token);
    setAuthToken(token);
    return { status: 'signedIn', user };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      setAuthToken(null);
      await clearStoredToken();
      return { status: 'signedOut' };
    }
    return {
      status: 'unreachable',
      message: error instanceof ApiError ? error.message : '서버에 연결할 수 없어요.',
    };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    void restoreSession().then((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (auth: AuthResponse) => {
    setAuthToken(auth.token);
    setState({ status: 'signedIn', user: auth.user });
    // 저장 실패 시에도 이번 실행 동안은 로그인 상태를 유지한다(다음 실행 때 다시 로그인).
    await saveToken(auth.token).catch(() => undefined);
  }, []);

  const signOut = useCallback(async () => {
    const token = getAuthToken();
    setAuthToken(null);
    setState({ status: 'signedOut' });
    await clearStoredToken();
    if (token) await logoutRequest(token).catch(() => undefined);
  }, []);

  const setUser = useCallback((user: User) => {
    setState((current) => (current.status === 'signedIn' ? { status: 'signedIn', user } : current));
  }, []);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    void restoreSession().then(setState);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      void signOut();
    });
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const value = useMemo(() => ({ state, signIn, signOut, setUser, retry }), [state, signIn, signOut, setUser, retry]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.');
  return value;
}

/** 로그인 상태면 사용자, 아니면 null(로그아웃 전환 중 잠깐 null일 수 있음). */
export function useCurrentUser(): User | null {
  const { state } = useAuth();
  return state.status === 'signedIn' ? state.user : null;
}
