import { useCallback } from 'react';
import { AUTH_TOKEN_KEY } from '../utils/constants';

export function useAuthFetch(tokenKey: string = AUTH_TOKEN_KEY) {
  const authFetch = useCallback((url: string, options: RequestInit = {}) => {
    const token = localStorage.getItem(tokenKey);
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  }, [tokenKey]);

  return authFetch;
}
