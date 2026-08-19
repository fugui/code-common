/**
 * 在触发熔断冷却（防止死循环刷新）时展示直观的手动刷新引导面板
 */
function showChunkErrorFallbackUI(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById('chunk-error-fallback-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'chunk-error-fallback-panel';
  panel.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.65);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  `;

  panel.innerHTML = `
    <div style="background: #ffffff; padding: 24px 32px; border-radius: 8px; max-width: 420px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.2);">
      <div style="font-size: 36px; margin-bottom: 12px; line-height: 1;">⚠️</div>
      <h3 style="margin: 0 0 8px; font-size: 16px; color: #1f2937; font-weight: 600;">页面资源加载异常</h3>
      <p style="margin: 0 0 20px; font-size: 13px; color: #6b7280; line-height: 1.5;">
        检测到部分静态资源已更新或网络连接不稳定。为防止异常重复发生，已暂停自动重试，请点击下方按钮重新加载。
      </p>
      <button id="chunk-reload-btn" style="background: #1677ff; color: #ffffff; border: none; padding: 8px 24px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer;">
        手动刷新页面
      </button>
    </div>
  `;

  document.body.appendChild(panel);
  document.getElementById('chunk-reload-btn')?.addEventListener('click', () => {
    window.location.reload();
  });
}

/**
 * 针对 Vite 动态导入失败 (preload error) 及 Chunk 加载异常的自动重载与熔断兜底
 */
export function setupChunkErrorReloader(): void {
  if (typeof window === 'undefined') return;

  const RELOAD_KEY = 'app_auto_reload_timestamp';
  const COOLDOWN_MS = 15 * 1000; // 15秒熔断冷却

  const handleChunkLoadFailure = (reason: unknown): void => {
    console.warn('[ChunkLoader] 检测到静态资源 Chunk 加载失败，准备自动刷新...', reason);

    const now = Date.now();
    const lastReloadStr = sessionStorage.getItem(RELOAD_KEY);
    const lastReload = lastReloadStr ? parseInt(lastReloadStr, 10) : 0;

    // 熔断保护：如果 15 秒内刚刚自动重载过，说明并非由于发版引起（可能是断网或服务宕机），停止重载并弹窗提示
    if (now - lastReload < COOLDOWN_MS) {
      console.error('[ChunkLoader] 自动刷新处于冷却期，停止自动重载以防死循环。');
      showChunkErrorFallbackUI();
      return;
    }

    sessionStorage.setItem(RELOAD_KEY, now.toString());
    window.location.reload();
  };

  // 1. Vite 原生预加载错误事件
  window.addEventListener('vite:preloadError', (event) => {
    handleChunkLoadFailure(event);
  });

  // 2. 捕获动态 import 失败或 Module Federation 远程脚本网络错误
  window.addEventListener('unhandledrejection', (event) => {
    let errorMsg = '';
    if (event.reason instanceof Error) {
      errorMsg = event.reason.message;
    } else if (typeof event.reason === 'string') {
      errorMsg = event.reason;
    } else if (event.reason && typeof event.reason === 'object' && 'message' in event.reason) {
      errorMsg = String((event.reason as { message: unknown }).message);
    }

    if (
      errorMsg.includes('Failed to fetch dynamically imported module') ||
      errorMsg.includes('Loading chunk') ||
      errorMsg.includes('error loading dynamically imported module') ||
      errorMsg.includes('Failed to load module script')
    ) {
      handleChunkLoadFailure(event.reason);
    }
  });
}
