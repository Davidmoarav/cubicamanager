// app/api/parte-diario/route.ts
// Parte diario: horas por trabajador, obra, partida y día. Es el insumo con que
// se reparten los sueldos entre obras (lib/imputacion-sueldos.ts).
//
//   GET ?proyecto_id=X&fecha=YYYY-MM-DD  → filas del día + trabajadores disponibles
//   GET ?proyecto_id=X&resumen=1         → horas y trabajadores por mes
//   PUT { proyecto_id, fecha, filas, base? } → reemplaza las horas de ese día en esa obra;
//        con base (lib/cola-terreno.ts), responde 409 si otra persona ya las cambió
import { createServerSupabase } from '@/lib/supabase-server'
import { guardEscritura, getOwnerId } from '@/lib/roles'
import { ParteDiarioSchema, validar } from '@/lib/validar'
import { traerTodo } from '@/lib/costos-server'
import { reimputarSueldos } from '@/lib/imputacion-sueldos'
import { huellaParte } from '@/lib/cola-terreno'
import { NextResponse, type NextRequest } from 'next/server'

const FECHA = /^\d{4}-\d{2}-\d{2}$/

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const sp = req.nextUrl.searchParams
  const proyectoId = sp.get('proyecto_id')
  if (!proyectoId) return NextResponse.json({ error: 'Falta proyecto_id' }, { status: 400 })

  // ── Resumen mensual ──
  if (sp.get('resumen')) {
    try {
      const filas = await traerTodo<any>((d, h) => supabase.from('parte_diario')
        .select('fecha, horas, empleado_id')
        .eq('proyecto_id', proyectoId).eq('user_id', ownerId).order('id').range(d, h))
      const meses: Record<string, { horas: number; trabajadores: Set<string> }> = {}
      for (const f of filas) {
        const mes = String(f.fecha).slice(0, 7)
        const m = meses[mes] ?? (meses[mes] = { horas: 0, trabajadores: new Set() })
        m.horas += Number(f.horas) || 0
        m.trabajadores.add(f.empleado_id)
      }
      return NextResponse.json(Object.entries(meses)
        .map(([mes, m]) => ({ mes, horas: Math.round(m.horas * 10) / 10, trabajadores: m.trabajadores.size }))
        .sort((a, b) => a.mes.localeCompare(b.mes)))
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? 'Error leyendo el parte diario' }, { status: 500 })
    }
  }

  const fecha = sp.get('fecha')
  if (!fecha || !FECHA.test(fecha)) return NextResponse.json({ error: 'Fecha inválida (YYYY-MM-DD)' }, { status: 400 })

  const [partes, emps] = await Promise.all([
    supabase.from('parte_diario').select('id, empleado_id, partida_id, horas, notas')
      .eq('proyecto_id', proyectoId).eq('fecha', fecha).eq('user_id', ownerId).order('created_at'),
    // Solo lo necesario: el jefe de obra registra horas, pero no ve sueldos
    supabase.from('empleados').select('id, nombre, cargo, proyecto_id, estado')
      .eq('user_id', ownerId).order('nombre'),
  ])
  if (partes.error) return NextResponse.json({ error: partes.error.message }, { status: 500 })
  if (emps.error) return NextResponse.json({ error: emps.error.message }, { status: 500 })

  const conHoras = new Set((partes.data ?? []).map((p: any) => p.empleado_id))
  return NextResponse.json({
    filas: partes.data ?? [],
    empleados: (emps.data ?? []).filter((e: any) => e.estado !== 'inactivo' || conHoras.has(e.id)),
  })
}

export async function PUT(req: Request) {
  const supabase = await createServerSupabase()
  const ro = await guardEscritura(supabase, 'obra')
  if (ro) return ro
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const ownerId = await getOwnerId(supabase) || user.id

  const v = validar(ParteDiarioSchema, await req.json())
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const { proyecto_id, fecha, filas, base } = v.data

  const clave = (empleadoId: string, partidaId?: string | null) => `${empleadoId}|${partidaId || ''}`
  const nuevas = new Map(filas.map(f => [clave(f.empleado_id, f.partida_id), f]))
  if (nuevas.size !== filas.length) {
    return NextResponse.json({ error: 'Hay un trabajador repetido en la misma partida' }, { status: 400 })
  }

  // ── FK: obra, trabajadores y partidas deben ser de esta organización ──
  const { data: proy } = await supabase
    .from('proyectos').select('id').eq('id', proyecto_id).eq('user_id', ownerId).maybeSingle()
  if (!proy) return NextResponse.json({ error: 'Proyecto no encontrado' }, { status: 404 })

  const empleadoIds = [...new Set(filas.map(f => f.empleado_id))]
  if (empleadoIds.length > 0) {
    const { data: emps } = await supabase
      .from('empleados').select('id').eq('user_id', ownerId).in('id', empleadoIds)
    if ((emps ?? []).length !== empleadoIds.length) {
      return NextResponse.json({ error: 'Trabajador no encontrado' }, { status: 404 })
    }
  }
  const partidaIds = [...new Set(filas.map(f => f.partida_id).filter(Boolean))] as string[]
  if (partidaIds.length > 0) {
    const { data: parts } = await supabase.from('partidas_proyecto').select('id')
      .eq('user_id', ownerId).eq('proyecto_id', proyecto_id).in('id', partidaIds)
    if ((parts ?? []).length !== partidaIds.length) {
      return NextResponse.json({ error: 'La partida no pertenece a esta obra' }, { status: 400 })
    }
  }

  const { data: delDia, error: eDia } = await supabase
    .from('parte_diario').select('id, proyecto_id, empleado_id, partida_id, horas')
    .eq('user_id', ownerId).eq('fecha', fecha)
  if (eDia) return NextResponse.json({ error: eDia.message }, { status: 500 })

  // ── Otra persona lo cambió. Si ya es igual a lo enviado, es un reintento: sigue ──
  if (typeof base === 'string') {
    const huella = huellaParte((delDia ?? []).filter((p: any) => p.proyecto_id === proyecto_id))
    if (huella !== base && huella !== huellaParte(filas)) {
      return NextResponse.json({ error: 'Otra persona cambió el parte de este día' }, { status: 409 })
    }
  }

  // ── Un trabajador no puede sumar más de 24 horas en el día, entre todas las obras ──

  const horasDia: Record<string, number> = {}
  for (const f of filas) horasDia[f.empleado_id] = (horasDia[f.empleado_id] || 0) + f.horas
  for (const p of delDia ?? []) {
    if (p.proyecto_id !== proyecto_id && horasDia[p.empleado_id] !== undefined) {
      horasDia[p.empleado_id] += Number(p.horas) || 0
    }
  }
  if (Object.values(horasDia).some(h => h > 24)) {
    return NextResponse.json({ error: 'Un trabajador supera las 24 horas del día, sumando todas las obras' }, { status: 400 })
  }

  // ── Aplicar diferencias: actualiza e inserta antes de borrar ──
  const actuales = (delDia ?? []).filter((p: any) => p.proyecto_id === proyecto_id)
  const obsoletas: string[] = []
  const vigentes = new Map<string, any>()
  for (const p of actuales) {
    const k = clave(p.empleado_id, p.partida_id)
    if (!nuevas.has(k) || vigentes.has(k)) obsoletas.push(p.id)
    else vigentes.set(k, p)
  }

  for (const [k, f] of nuevas) {
    const fila = { horas: f.horas, notas: f.notas || null }
    const existente = vigentes.get(k)
    const { error } = existente
      ? await supabase.from('parte_diario').update(fila).eq('id', existente.id).eq('user_id', ownerId)
      : await supabase.from('parte_diario').insert({
          ...fila, proyecto_id, fecha,
          empleado_id: f.empleado_id, partida_id: f.partida_id || null, user_id: ownerId,
        })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (obsoletas.length > 0) {
    const { error } = await supabase.from('parte_diario').delete().in('id', obsoletas).eq('user_id', ownerId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── Las liquidaciones ya generadas se reparten de nuevo con las horas actuales ──
  const afectados = [...new Set([...empleadoIds, ...actuales.map((p: any) => p.empleado_id)])]
  try {
    await reimputarSueldos(supabase, ownerId, afectados, fecha.slice(0, 7))
  } catch (e: any) {
    return NextResponse.json({ ok: true, aviso: `Las horas quedaron guardadas, pero no se pudo reimputar el sueldo: ${e?.message ?? 'error'}` })
  }
  return NextResponse.json({ ok: true })
}
