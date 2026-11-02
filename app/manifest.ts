// app/manifest.ts — Permite instalar la app en el teléfono; abre directo en Terreno.
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Cubica Manager',
    short_name: 'Cubica',
    description: 'Sistema de gestión para contratistas',
    start_url: '/terreno',
    display: 'standalone',
    background_color: '#F6F4F1',
    theme_color: '#131C2B',
    icons: [{ src: '/logo.png', sizes: 'any', type: 'image/png' }],
  }
}
