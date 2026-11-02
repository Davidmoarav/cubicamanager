// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Los errores de tipos BLOQUEAN el build (deuda saldada en Fase 3: tsc = 0).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options',        value: 'DENY' },   // anti-clickjacking
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',     value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
      {
        // Sin esto, un service worker corregido podría tardar un día en llegar
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ]
  },
}

export default nextConfig
