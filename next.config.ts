import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,

  /**
   * allowedDevOrigins / allowedOrigins:
   * Hostname a partir de NEXT_PUBLIC_APP_URL (túnel local ou host do app).
   * Cutover huginflow.com na P6 — não altera hosts de produção aqui.
   */
  allowedDevOrigins: [
    new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").hostname,
  ],
  // Manual: rename do arquivo HTML na P4
  outputFileTracingIncludes: {
    '/api/ajuda/manual': ['./docs/manual-usuario-huginflow.html'],
    '/api/ajuda/img/*': ['./docs/manual/img/**/*'],
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").hostname,
        "localhost:3000",
        "127.0.0.1:3000",
      ]
    },
  },

  /**
   * Redirecionamentos legados de /dashboard para /cockpit
   */
  async redirects() {
    return [
      {
        source: '/dashboard/:path*',
        destination: '/cockpit/:path*',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
