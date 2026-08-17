import { AUTH_TOKEN_KEY } from './constants';

export interface FetchInterceptorOptions {
  tokenKey?: string;
  appPrefix?: string;
  onAuthError?: () => void;
  onTokenRefresh?: (newToken: string) => void;
}

let isInterceptorInstalled = false;
const registeredPrefixes = new Set<string>(['shield', 'pipeline', 'pdm', 'proto']);

/**
 * setupFetchInterceptor 安装全局 fetch 拦截器：
 * 1. 在微前端模式下，自动识别子系统路由环境并重写相对 /api 请求为 /{prefix}/api/...；
 * 2. 自动防止已携带前缀或绝对路径的请求发生二次拼接（幂等性保障）；
 * 3. 为所有 /api 请求自动注入 Bearer Token；
 * 4. 自动捕获响应头中的 X-Refresh-Token 进行无感续期；
 * 5. 拦截 401 状态码，自动清理本地登录态并触发 auth-change 事件；
 * 6. 支持 Portal 内部代理与跨域请求旁路。
 */
export function setupFetchInterceptor(options: FetchInterceptorOptions = {}) {
  if (options.appPrefix) {
    const clean = options.appPrefix.replace(/^\/+|\/+$/g, '');
    if (clean) registeredPrefixes.add(clean);
  }

  if (isInterceptorInstalled) {
    return;
  }
  isInterceptorInstalled = true;

  const {
    tokenKey = AUTH_TOKEN_KEY,
    onAuthError,
    onTokenRefresh,
  } = options;

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    let [resource, config] = args;
    let url = typeof resource === 'string'
      ? resource
      : (resource instanceof Request ? resource.url : (resource instanceof URL ? resource.href : String(resource)));

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

    const isEmbeddedMode = !!(window as any).__POWERED_BY_PORTAL__;

    // 微前端模式下，如果处于子应用路由中，自动补全 API 前缀
    if (isEmbeddedMode) {
      const pathname = window.location.pathname;
      let activePrefix: string | null = null;
      for (const prefix of registeredPrefixes) {
        if (pathname === `/${prefix}` || pathname.startsWith(`/${prefix}/`)) {
          activePrefix = `/${prefix}`;
          break;
        }
      }

      if (activePrefix) {
        // 仅当 url 以 /api 或 /api/ 开头（未带子应用前缀）时进行重写
        if (url.startsWith('/api/') || url === '/api') {
          const newUrl = `${activePrefix}${url}`;
          url = newUrl;
          if (typeof resource === 'string') {
            resource = newUrl;
          } else if (resource instanceof Request) {
            resource = new Request(newUrl, resource);
          } else if (resource instanceof URL) {
            resource = new URL(newUrl, resource.origin);
          }
        }
      }
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
