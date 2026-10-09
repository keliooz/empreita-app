import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // postgres e pdf-lib rodam no servidor Node; não precisam ser empacotados.
  serverExternalPackages: ['postgres', 'pdf-lib', '@electric-sql/pglite'],
  poweredByHeader: false,
};

export default nextConfig;
