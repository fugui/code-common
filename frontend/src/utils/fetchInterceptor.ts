import { AUTH_TOKEN_KEY } from './constants';

export interface FetchInterceptorOptions {
  tokenKey?: string;
  appPrefix?: string;
  onAuthError?: () => void;
  onTokenRefresh?: (newToken: string) => void;
}

let isInterceptorInstalled = false;

/**
 * setupFetchInterceptor 安装全局 fetch 拦截器：
 * 1. 为所有 /api 请求自动注入 Bearer Token；
 * 2. 自动捕获响应头中的 X-Refresh-Token 进行无感续期；
 * 3. 拦截 401 状态码，自动清理本地登录态并触发 auth-change 事件；
 * 4. 支持微前端集成模式下的请求旁路。
 */
export function setupFetchInterceptor(options: FetchInterceptorOptions = {}) {
  if (isInterceptorInstalled) {
    return;
  }
  isInterceptorInstalled = true;

  const {
    tokenKey = AUTH_TOKEN_KEY,
    appPrefix,
    onAuthError,
    onTokenRefresh,
  } = options;

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    let [resource, config] = args;
    const url = resource.toString();

    // 检查是否为 Portal 代理请求，以旁路子应用的拦截器
    let isPortalRequest = false;
    if (config && config.headers) {
      if (config.headers instanceof Headers) {
        isPortalRequest = config.headers.get('x-portal-request') === 'true';
      } else if (Array.isArray(config.headers)) {
        isPortalRequest = config.headers.some(
          ([k, v]) => k.toLowerCase() === 'x-portal-request' && v === 'true'
        );
      } else {
        const hdrs = config.headers as Record<string, string>;
        for (const k of Object.keys(hdrs)) {
          if (k.toLowerCase() === 'x-portal-request' && hdrs[k] === 'true') {
            isPortalRequest = true;
            break;
          }
        }
      }
    }

    if (isPortalRequest) {
      return originalFetch(resource, config);
    }

    // 微前端嵌入模式下，若当前访问路径不属于子应用前缀，则旁路拦截
    const isEmbeddedMode = !!(window as any).__POWERED_BY_PORTAL__;
    if (isEmbeddedMode && appPrefix && !window.location.pathname.startsWith(appPrefix)) {
      return originalFetch(...args);
    }

    const token = localStorage.getItem(tokenKey);

    let res: Response;
    if (token && url.includes('/api')) {
      const defaultHeaders: any = config?.headers || {};
      res = await originalFetch(resource, {
        ...config,
        headers: {
          ...defaultHeaders,
          Authorization: `Bearer ${token}`,
        },
      });
    } else {
      res = await originalFetch(resource, config);
    }

    // 处理无感 Token 自动续期
    if (res.ok && url.includes('/api')) {
      const newToken = res.headers.get('X-Refresh-Token');
      if (newToken) {
        localStorage.setItem(tokenKey, newToken);
        if (onTokenRefresh) {
          onTokenRefresh(newToken);
        }
        window.dispatchEvent(new Event('auth-change'));
      }
    }

    // 拦截 401 Unauthorized 状态（仅针对系统的 /api 请求）
    if (res.status === 401 && url.includes('/api')) {
      localStorage.removeItem(tokenKey);
      if (onAuthError) {
        onAuthError();
      }
      window.dispatchEvent(new Event('auth-change'));
    }

    return res;
  };
}
