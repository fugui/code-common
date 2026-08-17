import { useState, useEffect, useCallback } from 'react';
import { AUTH_TOKEN_KEY } from '../utils/constants';
import type { User } from '../types/user';

export interface UseCurrentUserOptions {
  tokenKey?: string;
  meEndpoint?: string;
  onLogout?: () => void;
}

export function useCurrentUser(options: UseCurrentUserOptions = {}) {
  const {
    tokenKey = AUTH_TOKEN_KEY,
    meEndpoint = '/api/me',
    onLogout,
  } = options;

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadUser = useCallback(() => {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    fetch(meEndpoint)
      .then((res) => {
        if (res.status === 401) {
          localStorage.removeItem(tokenKey);
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        setUser(data || null);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, [tokenKey, meEndpoint]);

  const logout = useCallback(() => {
    localStorage.removeItem(tokenKey);
    setUser(null);
    window.dispatchEvent(new Event('auth-change'));
    if (onLogout) {
      onLogout();
    }
  }, [tokenKey, onLogout]);

  useEffect(() => {
    loadUser();
    window.addEventListener('auth-change', loadUser);
    return () => window.removeEventListener('auth-change', loadUser);
  }, [loadUser]);

  return {
    user,
    loading,
    logout,
    refreshUser: loadUser,
  };
}

export default useCurrentUser;
