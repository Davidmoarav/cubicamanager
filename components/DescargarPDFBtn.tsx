'use client'
// components/DescargarPDFBtn.tsx
//
// Descarga el PDF de una Cotización con diseño Cubica.
// Carga empresa + logo (base64) antes de renderizar.

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Cotizacion } from '@/types/cotizaciones'
import type { Cliente } from '@/types/cliente'

interface Props {
  cotizacion: Cotizacion
  cliente?: Cliente | null
}

export default function DescargarPDFBtn({ cotizacion, cliente }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const generar = async () => {
    setLoading(true)
    try {
      // Carga react-pdf y el componente solo al momento de generar (no en el bundle inicial)
      const [{ pdf }, { CotizacionPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./CotizacionPDF'),
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

      // 3. Generar + descargar
      const blob = await pdf(
        <CotizacionPDF cotizacion={cotizacion} cliente={cliente} empresa={empresa} logoUrl={logoUrl} />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const nombre = String(cotizacion?.numero || 'cotizacion').replace(/[^a-zA-Z0-9]/g, '_')
      a.download = `Cotizacion_${nombre}.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Error al generar PDF:', err)   // ← error real, no el síntoma
      alert('Error al generar PDF: ' + (err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={generar}
      disabled={loading}
      title="Descargar cotización en PDF"
      className={`inline-flex items-center gap-1 px-3 py-1.5 border-none rounded-md text-[12px] font-bold text-white
        ${loading ? 'bg-[#a0aab8] cursor-default opacity-70' : 'bg-brand cursor-pointer'}`}
    >
      {loading ? 'Generando…' : '↓ PDF'}
    </button>
  )
}