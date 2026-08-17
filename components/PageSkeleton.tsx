// components/PageSkeleton.tsx
// Silueta genérica (header + métricas + tabla) que se muestra durante la
// transición de navegación, para que cambiar de módulo se sienta instantáneo.
export default function PageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="h-7 w-52 bg-[#EDE7E0] rounded-lg" />
        <div className="h-9 w-32 bg-[#EDE7E0] rounded-lg" />
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[0, 1, 2].map(i => (
          <div key={i} className="bg-white border border-line rounded-card p-5">
            <div className="h-3 w-24 bg-[#eef2f6] rounded mb-3" />
            <div className="h-6 w-24 bg-[#EDE7E0] rounded" />
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div className="bg-white border border-line rounded-card p-5">
        <div className="h-4 w-full bg-[#eef2f6] rounded mb-4" />
        {[0, 1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex gap-4 py-3 border-t border-[#eef2f6]">
            <div className="h-4 flex-1 bg-[#F1ECE6] rounded" />
            <div className="h-4 w-28 bg-[#F1ECE6] rounded" />
            <div className="h-4 w-20 bg-[#F1ECE6] rounded" />
            <div className="h-4 w-16 bg-[#F1ECE6] rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}