'use client'
// components/DescargarInformeBtn.tsx
// Descarga el PDF del informe ejecutivo con diseño Cubica.

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface Props {
  data: any
  proximo?: any
}

export default function DescargarInformeBtn({ data, proximo }: Props) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const generar = async () => {
    setLoading(true)
    try {
      const [{ pdf }, { InformePDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./InformePDF'),
      ])

      const empresa = await fetch('/api/empresa').then(r => r.json()).catch(() => null)

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

      const blob = await pdf(
        <InformePDF data={data} proximo={proximo} empresa={empresa} logoUrl={logoUrl} />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const nombre = (data?.proyecto?.nombre || 'proyecto').replace(/[^a-zA-Z0-9]/g, '_')
      a.download = `Informe_Ejecutivo_${nombre}.pdf`
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
      title="Descargar informe ejecutivo en PDF"
      className={`inline-flex items-center gap-1 px-3 py-1.5 border-none rounded-md text-[12px] font-bold text-white
        ${loading ? 'bg-[#a0aab8] cursor-default opacity-70' : 'bg-brand cursor-pointer'}`}
    >
      {loading ? 'Generando…' : '↓ Descargar PDF'}
    </button>
  )
}