'use client'
// app/(protected)/error.tsx
// Boundary de error para las rutas protegidas: si un módulo o panel falla,
// muestra este fallback en vez de tumbar toda la app. El sidebar sigue intacto.
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error('Error en módulo:', error) }, [error])

  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <div className="w-14 h-14 rounded-full bg-danger-bg flex items-center justify-center text-danger text-2xl font-bold mb-4">!</div>
      <h2 className="text-lg font-bold text-ink mb-1.5">Algo salió mal en este módulo</h2>
      <p className="text-[13px] text-muted max-w-sm mb-5">
        Ocurrió un error al cargar esta sección. Puedes reintentar; el resto de la app sigue funcionando.
      </p>
      <div className="flex gap-2">
        <button onClick={reset} className="px-4 py-2 rounded-lg bg-brand text-white text-[13px] font-bold hover:opacity-90 transition">
          Reintentar
        </button>
        <button onClick={() => { window.location.href = '/dashboard' }} className="px-4 py-2 rounded-lg border border-line text-ink text-[13px] font-semibold hover:bg-canvas transition">
          Ir al inicio
        </button>
      </div>
      {error?.message && (
        <p className="text-[11px] text-muted mt-6 font-mono max-w-md break-words opacity-70">{error.message}</p>
      )}
    </div>
  )
}