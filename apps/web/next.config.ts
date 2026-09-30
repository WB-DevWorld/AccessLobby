import type { NextConfig } from 'next';
const noStore = { key: 'Cache-Control', value: 'private, no-store, max-age=0' };
const config: NextConfig = {
  output: 'standalone',
  async headers() {
    return ['/auth/:path*', '/account', '/identity', '/contexts/:path*', '/organizations/:path*',
      '/apps/:path*', '/recovery'].map(source => ({ source, headers: [noStore] }));
  },
};
export default config;
