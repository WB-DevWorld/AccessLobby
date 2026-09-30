const CRITICAL_PATH = /^\/(?:auth|recovery|account|identity|contexts|organizations|apps)(?:\/|$)/;

export function safeUpdateBoundary(pathname: string, formDirty: boolean) {
  return !CRITICAL_PATH.test(pathname) && !formDirty;
}
