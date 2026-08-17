'use client'
// components/obra/ComprasTab.tsx — Pestaña Compras (Fase 3).
// Plan de compra: materiales del presupuesto → mejor oferta por proveedor
// (proveedor_productos) → borradores de OC reales en el módulo existente.

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import Link from 'next/link'
import type { Proyecto, Proveedor } from '@/types'
import type { PartidaProyecto } from '@/types/partida-proyecto'
import { fmt } from '@/lib/format'
import { generarPlanCompra, type GrupoProveedor, type ProductoProv } from '@/lib/plancompra'

const IVA = 0.19

function Stat({ label, valor, coral = false }: { label: string; valor: string; coral?: boolean }) {
  return (
    <div className="flex-1 min-w-[130px] bg-white rounded-card border border-line shadow-card px-4 py-3">
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-muted">{label}</div>
      <div className={['text-[18px] font-extrabold mt-0.5', coral ? 'text-om' : 'text-ink'].join(' ')}>{valor}</div>
    </div>
  )
}

export default function ComprasTab({ proyecto, partidas }: {
  proyecto: Proyecto
  partidas: PartidaProyecto[]
}) {
  const { data: productos } = useSWR<ProductoProv[]>('/api/proveedor-productos')
  const { data: proveedores } = useSWR<Proveedor[]>('/api/proveedores')
  const [creando, setCreando] = useState<string>('')            // proveedor_id en curso
  const [creadas, setCreadas] = useState<Record<string, number>>({}) // proveedor_id → numero OC
  const [error, setError] = useState('')

  const listaProd = Array.isArray(productos) ? productos : []
  const listaProv = Array.isArray(proveedores) ? proveedores : []

  const plan = useMemo(
    () => generarPlanCompra(
      partidas.map(p => ({
        id: p.id, parent_id: p.parent_id, orden: p.orden,
        descripcion: p.descripcion, unidad: p.unidad,
        cantidad: Number(p.cantidad) || 0,
        precio_unitario: Number(p.precio_unitario) || 0,
        es_grupo: p.es_grupo,
      })),
      listaProd,
      listaProv.map(p => ({ id: p.id, nombre: p.nombre })),
    ),
    [partidas, listaProd, listaProv]
  )

  const crearOC = async (g: GrupoProveedor) => {
    setCreando(g.proveedor_id)
    setError('')
    try {
      const res = await fetch('/api/ordenes-compra', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          proveedor_id: g.proveedor_id,
          proveedor: g.proveedor,
          proyecto_id: proyecto.id,
          proyecto: proyecto.nombre,
          estado: 'borrador',
          notas: 'Generada por el Copiloto de Obra — Plan de compra',
          lineas: g.items.map(i => ({
            material: i.producto,
            unidad: i.unidad,
            cantidad: i.cantidad,
            precio_unitario: i.precio_proveedor,
          })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'No se pudo crear la OC')
      setCreadas(prev => ({ ...prev, [g.proveedor_id]: data.numero }))
    } catch (e: any) {
      setError(e?.message ?? 'Error creando la orden de compra')
    } finally {
      setCreando('')
    }
  }

  // ─── Onboarding: sin productos de proveedor cargados ───
  if (listaProd.length === 0) {
    return (
      <div className="bg-white rounded-card border border-dashed border-line2 p-10 text-center">
        <div className="inline-block px-3 py-1 rounded-full bg-om-bg text-om text-[11px] font-extrabold uppercase tracking-wide mb-3">
          Plan de compra
        </div>
        <div className="text-[16px] font-extrabold text-ink">Carga catálogos de tus proveedores</div>
        <p className="text-[13px] text-muted mt-1.5 max-w-[460px] mx-auto">
          El plan de compra busca el mejor precio de cada material en los catálogos de tus
          proveedores. Aún no tienes productos cargados: súbelos por CSV en el módulo de proveedores
          y esta pestaña armará la ruta de compra sola.
        </p>
        <Link
          href="/proveedores"
          className="inline-block mt-4 px-4 py-2 rounded-xl bg-om hover:bg-om-dark text-white text-[13px] font-bold transition"
        >
          Ir a Proveedores →
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex flex-wrap gap-3">
        <Stat label="Materiales" valor={String(plan.resumen.materiales)} />
        <Stat label="Con oferta de proveedor" valor={`${plan.resumen.conOferta}/${plan.resumen.materiales}`} />
        <Stat label="Total plan (neto)" valor={fmt(plan.resumen.netoPlan)} />
        <Stat label="Ahorro estimado" valor={fmt(plan.resumen.ahorro)} coral />
      </div>

      {error && <p className="text-[12.5px] text-danger font-semibold">{error}</p>}

      {/* Un card por proveedor */}
      {plan.porProveedor.map(g => {
        const numeroOC = creadas[g.proveedor_id]
        return (
          <div key={g.proveedor_id} className="bg-white rounded-card border border-line shadow-card overflow-hidden">
            <div className="px-5 py-3.5 flex flex-wrap items-center gap-3 border-b border-line bg-canvas/50">
              <span className="w-9 h-9 rounded-xl bg-om text-white font-extrabold flex items-center justify-center text-[15px]">
                {g.proveedor.charAt(0).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-extrabold text-ink text-[14.5px]">{g.proveedor}</div>
                <div className="text-[12px] text-muted">
                  {g.items.length} material{g.items.length === 1 ? '' : 'es'}
                  {g.ahorro > 0 && <span className="text-om font-bold"> · ahorras {fmt(g.ahorro)}</span>}
                </div>
              </div>
              {numeroOC ? (
                <Link
                  href="/ordenes-compra"
                  className="px-3.5 py-2 rounded-xl bg-success-bg text-success text-[12.5px] font-extrabold"
                >
                  OC N°{numeroOC} creada →
                </Link>
              ) : (
                <button
                  onClick={() => crearOC(g)}
                  disabled={creando !== ''}
                  className={[
                    'px-3.5 py-2 rounded-xl text-white text-[12.5px] font-bold transition',
                    creando === g.proveedor_id ? 'bg-om/40 cursor-wait' : 'bg-om hover:bg-om-dark',
                  ].join(' ')}
                >
                  {creando === g.proveedor_id ? 'Creando…' : 'Crear borrador de OC'}
                </button>
              )}
            </div>

            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-muted">
                  <th className="px-5 py-2 font-bold">Material</th>
                  <th className="px-2 py-2 font-bold text-right w-16">Cant.</th>
                  <th className="px-2 py-2 font-bold w-14">Un.</th>
                  <th className="px-2 py-2 font-bold text-right w-24">$ Proveedor</th>
                  <th className="px-2 py-2 font-bold text-right w-24 hidden sm:table-cell">$ Presup.</th>
                  <th className="px-5 py-2 font-bold text-right w-24">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map(i => (
                  <tr key={i.partida_id} className="border-t border-line">
                    <td className="px-5 py-2">
                      <div className="text-ink">{i.producto}</div>
                      {i.producto !== i.material && (
                        <div className="text-[11px] text-subtle">por: {i.material}</div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-muted">{i.cantidad}</td>
                    <td className="px-2 py-2 text-muted">{i.unidad}</td>
                    <td className="px-2 py-2 text-right font-bold text-ink">{fmt(i.precio_proveedor)}</td>
                    <td className="px-2 py-2 text-right text-subtle line-through hidden sm:table-cell">
                      {i.precio_presupuesto > i.precio_proveedor ? fmt(i.precio_presupuesto) : ''}
                    </td>
                    <td className="px-5 py-2 text-right font-bold text-ink">{fmt(i.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line2 bg-canvas/40">
                  <td colSpan={3} className="px-5 py-2.5 font-extrabold text-ink text-right">
                    Neto {fmt(g.neto)} · IVA {fmt(Math.round(g.neto * IVA))}
                  </td>
                  <td colSpan={3} className="px-5 py-2.5 font-extrabold text-om text-right text-[13.5px]">
                    Total {fmt(g.neto + Math.round(g.neto * IVA))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )
      })}

      {/* Sin oferta */}
      {plan.sinOferta.length > 0 && (
        <div className="bg-white rounded-card border border-line shadow-card p-5">
          <div className="text-[13px] font-extrabold text-ink mb-2">
            Sin oferta de proveedor ({plan.sinOferta.length})
          </div>
          <ul className="space-y-1">
            {plan.sinOferta.map(s => (
              <li key={s.partida_id} className="text-[12.5px] text-muted">
                • {s.material} <span className="text-subtle">({s.cantidad} {s.unidad})</span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-subtle mt-3">
            Carga estos productos en el catálogo de tus{' '}
            <Link href="/proveedores" className="text-om font-bold">proveedores</Link>{' '}
            para cotizarlos automáticamente.
          </p>
        </div>
      )}

      {plan.noComprables > 0 && (
        <p className="text-[12px] text-subtle">
          {plan.noComprables} partida{plan.noComprables === 1 ? '' : 's'} de mano de obra / servicios
          quedaron fuera del plan (no se compran a proveedor).
        </p>
      )}
    </div>
  )
}
