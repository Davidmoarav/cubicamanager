'use client'
// app/global-error.tsx
// Último recurso: solo se activa si falla el layout raíz. Reemplaza todo el
// documento, por eso usa estilos en línea (Tailwind podría no estar disponible).
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: 'system-ui, -apple-system, sans-serif', display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', margin: 0, background: '#f7f9fb' }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h2 style={{ marginBottom: 8, color: '#1a2535' }}>Algo salió mal</h2>
          <p style={{ color: '#6b7a8d', marginBottom: 20 }}>Ocurrió un error inesperado. Intenta recargar la página.</p>
          <button onClick={reset} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#1e6bb8', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
            Reintentar
          </button>
        </div>
      </body>
    </html>
  )
}