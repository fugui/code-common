import { useEffect, useRef, useState, useCallback } from 'react';
import type { VersionInfo } from '../types/version';

export interface UseVersionCheckOptions {
  versionUrl?: string;     // 默认 /version.json
  checkInterval?: number;  // 轮询周期，单位毫秒，默认 180000 (3分钟)
  throttleMs?: number;     // 页面切回时的节流周期，默认 30000 (30秒)
  enabled?: boolean;       // 是否启用（默认仅在生产环境或特定配置下启用）
}

export function useVersionCheck(options: UseVersionCheckOptions = {}) {
  const {
    versionUrl = '/version.json',
    checkInterval = 3 * 60 * 1000,
    throttleMs = 30 * 1000,
    enabled = true,
  } = options;

  const initialVersion = useRef<string | null>(null);
  const dismissedVersion = useRef<string | null>(null); // 记录被用户忽略的具体版本指纹
  const lastCheckTimestamp = useRef<number>(0);         // 用于 visibilitychange 节流

  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null);

  const fetchVersion = useCallback(async (): Promise<VersionInfo | null> => {
    try {
      const res = await fetch(`${versionUrl}?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, [versionUrl]);

  const check = useCallback(async () => {
    const data = await fetchVersion();
    if (!data) return;

    const versionFingerprint = `${data.gitHash}_${data.timestamp}`;

    if (!initialVersion.current) {
      initialVersion.current = versionFingerprint;
      return;
    }

    // 检测到版本与启动时版本不一致
    if (initialVersion.current !== versionFingerprint) {
      setLatestVersion(data);
      // 若该新版本未被用户手动点击“稍后提醒”忽略，则弹出通知
      if (dismissedVersion.current !== versionFingerprint) {
        setHasNewVersion(true);
      }
    }
  }, [fetchVersion]);

  // 节流检测（主要用于 visibilitychange 标签页激活）
  const throttledCheck = useCallback(() => {
    const now = Date.now();
    if (now - lastCheckTimestamp.current < throttleMs) {
      return;
    }
    lastCheckTimestamp.current = now;
    void check();
  }, [throttleMs, check]);

  useEffect(() => {
    if (!enabled) return;

    // 1. 初始化检查
    void check();

    // 2. 周期轮询
    const timer = setInterval(() => {
      void check();
    }, checkInterval);

    // 3. 标签页激活时带节流检查
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        throttledCheck();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, checkInterval, check, throttledCheck]);

  const dismiss = () => {
    if (latestVersion) {
      // 记录已忽略的具体版本指纹，后续若有更高版本发布仍会重新提醒
      dismissedVersion.current = `${latestVersion.gitHash}_${latestVersion.timestamp}`;
    }
    setHasNewVersion(false);
  };

  const reload = () => {
    window.location.reload();
  };

  return {
    hasNewVersion,
    latestVersion,
    dismiss,
    reload,
  };
}
