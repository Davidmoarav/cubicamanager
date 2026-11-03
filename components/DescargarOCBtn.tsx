'use client'
// components/DescargarOCBtn.tsx
// Descarga el PDF de una orden de compra. Carga react-pdf y el componente
// solo al hacer clic (no en el bundle inicial). Trae la OC completa por id.

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { avisar } from '@/lib/avisos'
import { guardarArchivo } from '@/lib/nativo'

interface Props {
  orden: any
  proveedores?: any[]
}

export default function DescargarOCBtn({ orden, proveedores }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const generar = async () => {
    setLoading(true)
    try {
      const [{ pdf }, { OrdenCompraPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./OrdenCompraPDF'),
      ])

      // OC completa (con líneas) + empresa
      const [full, empresa] = await Promise.all([
        fetch(`/api/ordenes-compra?id=${orden.id}`).then(r => r.json()).catch(() => orden),
        fetch('/api/empresa').then(r => r.json()).catch(() => null),
      ])

      // Logo en base64 (evita CORS al renderizar)
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

      const proveedor = proveedores?.find(p => p.id === full.proveedor_id) || null

      const blob = await pdf(
        <OrdenCompraPDF orden={full} proveedor={proveedor} empresa={empresa} logoUrl={logoUrl} />
      ).toBlob()

      await guardarArchivo(blob, `OC_${orden?.numero ?? 'orden'}.pdf`)
    } catch (err: any) {
      console.error('Error al generar PDF:', err)
      avisar('Error al generar PDF: ' + (err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={generar}
      disabled={loading}
      title="Descargar orden de compra en PDF"
      className="px-2.5 py-1.5 rounded-md border border-line text-brand text-[12px] font-bold hover:bg-canvas disabled:opacity-60"
    >
      {loading ? '…' : 'PDF'}
    </button>
  )
}