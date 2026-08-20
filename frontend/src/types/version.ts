export interface VersionInfo {
  appName: string;
  version: string;
  gitHash: string;
  buildTime: string;
  timestamp: number;
}

export interface VitePreloadErrorEvent extends Event {
  payload?: Error;
}

declare global {
  interface WindowEventMap {
    'vite:preloadError': VitePreloadErrorEvent;
  }
}
