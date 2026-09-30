// Only the reviewed, read-only home route is a safe activation boundary.
export const PWA_UPDATE_SAFE_PATH = '/';

export function safeUpdateBoundary(pathname: string, formDirty: boolean) {
  return pathname === PWA_UPDATE_SAFE_PATH && !formDirty;
}
