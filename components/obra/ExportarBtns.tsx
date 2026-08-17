'use client'
// components/obra/ExportarBtns.tsx — Botones del rail: Descargar PDF (react-pdf)
// y Excel MINVU/DOM (SheetJS). Ambos cargan sus librerías solo al hacer clic.

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Proyecto } from '@/types'
import type { Cliente } from '@/types/cliente'
import type { PartidaProyecto } from '@/types/partida-proyecto'
import { filasMINVU, ANCHOS_MINVU } from '@/lib/minvu'

const limpiar = (s: string) => s.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)

function BtnRail({ onClick, disabled, loading, children, title }: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      className={[
        'w-full py-2.5 rounded-xl border text-[13px] font-bold text-left px-4 transition',
        disabled
          ? 'border-line text-subtle cursor-not-allowed'
          : loading
            ? 'border-om/40 text-om cursor-wait'
            : 'border-line text-ink hover:border-om hover:text-om cursor-pointer',
      ].join(' ')}
    >
      {loading ? '⏳ Generando…' : children}
    </button>
  )
}

export function DescargarPresupuestoPDFBtn({ proyecto, cliente, partidas }: {
  proyecto: Proyecto
  cliente?: Cliente | null
  partidas: PartidaProyecto[]
}) {
  const supabase = createClient()
  const [loading, setLoading] = useState(false)

  const generar = async () => {
    setLoading(true)
    try {
      const [{ pdf }, { PresupuestoObraPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('./PresupuestoObraPDF'),
      ])

      const empresa = await fetch('/api/empresa').then(r => r.json()).catch(() => null)

      let logoUrl: string | null = null
      if (empresa?.logo_path) {
        const { data: { publicUrl } } = supabase.storage.from('empresa-logos').getPublicUrl(empresa.logo_path)
        try {
          const blob = await (await fetch(publicUrl)).blob()
          logoUrl = await new Promise<string>(resolve => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
        } catch { logoUrl = publicUrl }
      }

      const blob = await pdf(
        <PresupuestoObraPDF
          proyecto={proyecto}
          empresa={empresa}
          cliente={cliente}
          partidas={partidas}
          logoUrl={logoUrl}
        />
      ).toBlob()

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Presupuesto_${limpiar(proyecto.nombre)}.pdf`
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
    <BtnRail onClick={generar} loading={loading} disabled={partidas.length === 0}
      title={partidas.length === 0 ? 'Agrega partidas primero' : 'Descargar presupuesto en PDF'}>
      Descargar PDF
    </BtnRail>
  )
}

export function ExportarExcelBtn({ proyecto, partidas }: {
  proyecto: Proyecto
  partidas: PartidaProyecto[]
}) {
  const [loading, setLoading] = useState(false)

  const exportar = async () => {
    setLoading(true)
    try {
      const XLSX = await import('xlsx')
      const filas = filasMINVU(proyecto.nombre, partidas)
      const ws = XLSX.utils.aoa_to_sheet(filas)
      ws['!cols'] = ANCHOS_MINVU
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Presupuesto')
      XLSX.writeFile(wb, `Presupuesto_MINVU_${limpiar(proyecto.nombre)}.xlsx`)
    } catch (err: any) {
      console.error('Error al exportar Excel:', err)
      alert('Error al exportar Excel: ' + (err?.message || err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <BtnRail onClick={exportar} loading={loading} disabled={partidas.length === 0}
      title={partidas.length === 0 ? 'Agrega partidas primero' : 'Exportar formato MINVU/DOM'}>
      Excel MINVU/DOM
    </BtnRail>
  )
}
