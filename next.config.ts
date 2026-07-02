import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  devIndicators: false,

  /**
   * allowedDevOrigins / allowedOrigins:
   * Extraímos o hostname dinamicamente da variável de ambiente para que o
   * sistema suporte túneis locais (dev-ragnar) ou produção (Vercel/Docker)
   * sem modificações manuais no código.
   */
  allowedDevOrigins: [
    new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").hostname,
  ],
  // Manual do usuário no standalone (reforço; Dockerfile também copia docs/)
  outputFileTracingIncludes: {
    '/api/ajuda/manual': ['./docs/manual-usuario-ragnar.html'],
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
