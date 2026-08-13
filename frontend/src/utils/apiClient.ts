import { AUTH_TOKEN_KEY } from './constants';

export interface ApiFetchOptions extends RequestInit {
  bodyData?: any;
}

export function createApiClient(getBaseUrl: () => string, tokenKey: string = AUTH_TOKEN_KEY) {
  const apiFetch = async (endpoint: string, options: ApiFetchOptions = {}) => {
    const token = localStorage.getItem(tokenKey);
    
    const headers: HeadersInit = {
      ...(options.bodyData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    const config: RequestInit = {
      ...options,
      headers
    };

    if (options.bodyData) {
      config.body = JSON.stringify(options.bodyData);
    }

    const url = `${getBaseUrl()}${endpoint}`;
    const response = await fetch(url, config);

    if (response.status === 204) {
      return null;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || '请求失败，请稍后重试');
    }

    return data;
  };

  return { apiFetch };
}
