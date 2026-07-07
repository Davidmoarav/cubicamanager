'use client'
// components/DescargarEPBtn.tsx
//
// Descarga el PDF de un Estado de Pago con diseño Cubica.
// Carga empresa + logo (base64) antes de renderizar.

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { EstadoPago } from '@/types/estado-pago'

interface Props {
  ep: EstadoPago
  proyecto: { nombre: string; cliente?: string; direccion?: string; contrato_n?: string | number }
}

export default function DescargarEPBtn({ ep, proyecto }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const generar = async () => {
    setLoading(true)
    try {
      const [{ pdf }, { EstadoPagoPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./EstadoPagoPDF'),
      ])

      // 1. Config de empresa
      const empresa = await fetch('/api/empresa').then(r => r.json()).catch(() => null)

      // 2. Logo en base64 (evita problemas de CORS al renderizar)
      let logoUrl: string | null = null
      if (empresa?.logo_path) {
        const { data: { publicUrl } } = supabase.storage.from('empresa-logos').getPublicUrl(empresa.logo_path)
        try {
          const r = await fetch(publicUrl)
          const blob = await r.blob()
          logoUrl = await new Promise<string>(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
        } catch { logoUrl = publicUrl }
      }

      // 3. Detalle del EP (si no viene embebido, lo trae del API)
      let detalle = ep.detalle || []
      if (!detalle.length) {
        const all = await fetch(`/api/estados-pago?proyecto_id=${ep.proyecto_id}`).then(r => r.json()).catch(() => [])
        const full = Array.isArray(all) ? all.find((e: any) => e.id === ep.id) : null
        detalle = full?.detalle || []
      }

      // 4. Generar + descargar
      const blob = await pdf(
        <EstadoPagoPDF ep={ep} proyecto={proyecto} empresa={empresa} logoUrl={logoUrl} detalle={detalle} />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `EP_${ep.numero}_${(proyecto.nombre || 'obra').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Error al generar PDF:', err)
      alert('Error al generar PDF: ' + (err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={generar}
      disabled={loading}
      title="Descargar estado de pago en PDF"
      className={`inline-flex items-center gap-1 px-[10px] py-1 border-none rounded-[5px] text-[11px] font-bold text-white
        ${loading ? 'bg-[#a0aab8] cursor-default opacity-70' : 'bg-brand cursor-pointer opacity-100'}`}
    >
      {loading ? '...' : '↓ PDF'}
    </button>
  )
}