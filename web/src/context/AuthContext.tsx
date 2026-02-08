import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api, AuthError } from '../api';
import type { WebUser } from '../types';

interface AuthState {
  user: WebUser | null;
  loading: boolean;
  login: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<WebUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (credential: string) => {
    const { user } = await api.auth.loginWithGoogle(credential);
    setUser(user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (e) {
      if (!(e instanceof AuthError)) throw e;
    }
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
