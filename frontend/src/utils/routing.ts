/**
 * Helper to compute absolute navigation paths that dynamically prefix BASE_PATH
 * only when running in embedded portal mode.
 */
export function appNavigatePath(path: string, basePath: string = ''): string {
  const isEmbeddedMode = !!(window as any).__POWERED_BY_PORTAL__;
  if (isEmbeddedMode) {
    return basePath + path;
  }
  return path;
}
