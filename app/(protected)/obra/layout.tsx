// app/(protected)/obra/layout.tsx — Espacio de la obra, con la barra de toda la app
export default function ObraLayout({ children }: { children: React.ReactNode }) {
  // pb amplio para no tapar contenido con la CopilotoBar fija
  return <div className="pb-24">{children}</div>
}
