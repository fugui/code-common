import { useCallback, useEffect, useRef, useState } from 'react';
import { copyTextWithResult } from '../utils/clipboard';

export type CopyStatus = 'idle' | 'copied' | 'error';

export interface UseCopyToClipboardOptions {
  /** 状态自动复位延时（ms），默认 1800；设为 <= 0 则不自动复位 */
  resetDelay?: number;
  /** 复制成功回调 */
  onSuccess?: (text: string) => void;
  /** 复制失败回调 */
  onError?: (error?: unknown) => void;
}

export interface UseCopyToClipboardReturn {
  status: CopyStatus;
  copied: boolean;
  copy: (text: string) => Promise<boolean>;
  reset: () => void;
}

/**
 * 剪贴板复制状态管理 Hook，自动管理成功/失败状态切换与定时器清理。
 */
export function useCopyToClipboard(
  options: UseCopyToClipboardOptions = {},
): UseCopyToClipboardReturn {
  const { resetDelay = 1800, onSuccess, onError } = options;
  const [status, setStatus] = useState<CopyStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbacksRef = useRef({ onSuccess, onError });
  callbacksRef.current = { onSuccess, onError };

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  const reset = useCallback(() => {
    clearTimer();
    setStatus('idle');
  }, [clearTimer]);

  const copy = useCallback(
    async (text: string): Promise<boolean> => {
      clearTimer();
      const result = await copyTextWithResult(text);
      if (result.ok) {
        setStatus('copied');
        callbacksRef.current.onSuccess?.(text);
      } else {
        setStatus('error');
        callbacksRef.current.onError?.(result.error);
      }

      if (resetDelay > 0) {
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          setStatus('idle');
        }, resetDelay);
      }

      return result.ok;
    },
    [clearTimer, resetDelay],
  );

  return {
    status,
    copied: status === 'copied',
    copy,
    reset,
  };
}
