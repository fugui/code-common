export type CopyMethod = 'clipboard-api' | 'exec-command' | 'none';

export interface CopyTextResult {
  ok: boolean;
  method: CopyMethod;
  error?: unknown;
}

function focusSafely(el: HTMLElement | null): void {
  if (!el || typeof el.focus !== 'function') {
    return;
  }
  try {
    el.focus({ preventScroll: true });
  } catch {
    try {
      el.focus();
    } catch {
      // 忽略不支持 focus 或元素不可聚焦引发的异常
    }
  }
}

/**
 * 复制纯文本到系统剪贴板（优先 Clipboard API，非安全上下文或受限环境自动降级为只读 textarea + execCommand）。
 */
export async function copyTextWithResult(text: string): Promise<CopyTextResult> {
  let lastError: unknown;
  const isSecureContext =
    typeof window === 'undefined' || window.isSecureContext !== false;

  if (
    isSecureContext &&
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function'
  ) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true, method: 'clipboard-api' };
    } catch (err) {
      lastError = err;
    }
  }

  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    typeof document.execCommand !== 'function'
  ) {
    return { ok: false, method: 'none', error: lastError };
  }

  const container = document.body ?? document.documentElement;
  if (!container) {
    return { ok: false, method: 'none', error: lastError };
  }

  const previousActiveElement =
    (document.activeElement as HTMLElement | null) ?? null;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;
  // 保持离屏且不设 inset/bottom，避免触发全屏遮罩检查并防止页面滚动跳动
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '-9999px';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.padding = '0';
  textarea.style.border = 'none';
  textarea.style.outline = 'none';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';

  try {
    container.appendChild(textarea);
    focusSafely(textarea);
    textarea.select();
    if (typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(0, text.length);
    }
    const ok = document.execCommand('copy');
    if (ok) {
      return { ok: true, method: 'exec-command' };
    }
    return { ok: false, method: 'none', error: lastError };
  } catch (err) {
    return { ok: false, method: 'none', error: err ?? lastError };
  } finally {
    if (typeof textarea.remove === 'function') {
      textarea.remove();
    } else {
      textarea.parentNode?.removeChild(textarea);
    }
    focusSafely(previousActiveElement);
  }
}

/**
 * 复制纯文本（兼容 HTTPS Clipboard API 与内网 HTTP 降级方案）。
 */
export async function copyTextSafe(text: string): Promise<boolean> {
  const result = await copyTextWithResult(text);
  return result.ok;
}
