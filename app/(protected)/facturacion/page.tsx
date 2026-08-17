'use client'
// app/(protected)/facturacion/page.tsx — v3 con tipo venta/compra + neto/IVA + importador SII

import { useState, useEffect, useCallback } from 'react'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { Badge, Btn, FormInput, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th, fmt, fmtM } from '@/components/ui'
import ImportadorSII from '@/components/ImportadorSII'
import { IconSearch } from '@/components/Icon'
import ResumenBoletas from '@/components/ResumenBoletas'

const EMPTY: any = { numero:'', cliente:'', proyecto:'', proyecto_id:'', tipo:'venta', doc_tipo:'factura', factura_ref:'', neto:0, iva:0, monto:0, emision:'', vencimiento:'', estado:'pendiente' }

export default function FacturacionPage() {
  const [periodoSel, setPeriodoSel] = useState(new Date().toISOString().slice(0, 7))
  const { data: items = [], isLoading, mutate } = useSWR<any[]>(`/api/facturas?periodo=${periodoSel}`, fetcher)
  const { data: clientes = [] } = useSWR<any[]>('/api/clientes', fetcher)
  const { data: proveedores = [] } = useSWR<any[]>('/api/proveedores', fetcher)
  const { data: proyectos = [] } = useSWR<any[]>('/api/proyectos', fetcher)
  const [modal, setModal]             = useState(false)
  const [form, setForm]               = useState<any>({})
  const [filtro, setFiltro]           = useState('todos')
  const [tipoFiltro, setTipoFiltro]   = useState('todos')
  const [busqueda, setBusqueda]       = useState('')
  const [orden, setOrden]             = useState('fecha_desc')
  const [buscarFactura, setBuscarFactura]           = useState('')
  const [refFolio, setRefFolio]                     = useState('')   // folio de la factura referenciada (solo display)
  // Búsqueda server-side de facturas para referenciar desde una nota (cross-período)
  const { data: facturasBuscadas = [] } = useSWR<any[]>(
    buscarFactura.trim().length >= 1 ? `/api/facturas?doc_tipo=factura&buscar=${encodeURIComponent(buscarFactura.trim())}` : null,
    fetcher,
  )
  const [mostrarOtroCliente, setMostrarOtroCliente] = useState(false)
  const [saving, setSaving]   = useState(false)


  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const updNeto = (v: any) => {
    const neto = Number(v) || 0
    const iva = Math.round(neto * 0.19)
    setForm((f: any) => ({ ...f, neto, iva, monto: neto + iva }))
  }

  const onSelectFacturaRef = (facturaId: string) => {
    const fac = facturasBuscadas.find(f => f.id === facturaId)
    if (!fac) { setForm((f: any) => ({ ...f, factura_ref: '' })); setRefFolio(''); return }
    setRefFolio(fac.numero || '')
    setForm((f: any) => ({
      ...f,
      factura_ref: fac.id,
      tipo: fac.tipo || 'venta',
      cliente: fac.cliente,
      proyecto: fac.proyecto || '',
      proyecto_id: fac.proyecto_id || '',
    }))
  }

  const cerrarModal = () => { setModal(false); setBuscarFactura(''); setRefFolio(''); setMostrarOtroCliente(false) }

  const save = async () => {
    if (!form.cliente || form.cliente === '__otro__') { alert('Selecciona o escribe el nombre'); return }
    if (form.doc_tipo !== 'factura' && !form.factura_ref) {
      alert('Debes seleccionar la factura que esta nota modifica')
      return
    }
    setSaving(true)
    const periodo = form.emision ? form.emision.slice(0, 7) : new Date().toISOString().slice(0, 7)
    const payload = {
      ...form,
      neto: Number(form.neto),
      iva: Number(form.iva),
      monto: Number(form.monto),
      emision: form.emision || null,
      vencimiento: form.vencimiento || null,
      proyecto: form.proyecto || null,
      proyecto_id: form.proyecto_id || null,
      numero: form.numero || null,
      factura_ref: form.factura_ref || null,
      periodo,
    }
    const res = await fetch('/api/facturas', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('No se pudo guardar: ' + (err.error || 'error desconocido') +
        '\n\nSi menciona "doc_tipo" o "factura_ref", ejecuta el SQL 14_notas_credito_debito.sql en Supabase.')
      return
    }
    await mutate(); cerrarModal()
  }

  const setEstado = async (id: string, estado: string) => {
    await fetch('/api/facturas', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estado }) })
    await mutate()
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar factura?')) return
    await fetch('/api/facturas', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await mutate()
  }

  let filtered = items
  if (tipoFiltro !== 'todos') filtered = filtered.filter(i => (i.tipo || 'venta') === tipoFiltro)
  if (filtro !== 'todos')     filtered = filtered.filter(i => i.estado === filtro)
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase().trim()
    filtered = filtered.filter(i =>
      (i.cliente  || '').toLowerCase().includes(q) ||
      (i.numero   || '').toLowerCase().includes(q) ||
      (i.proyecto || '').toLowerCase().includes(q)
    )
  }
  filtered = [...filtered].sort((a, b) => {
    switch (orden) {
      case 'fecha_asc':  return (a.emision || '').localeCompare(b.emision || '')
      case 'fecha_desc': return (b.emision || '').localeCompare(a.emision || '')
      case 'monto_desc': return (b.monto || 0) - (a.monto || 0)
      case 'monto_asc':  return (a.monto || 0) - (b.monto || 0)
      case 'cliente':    return (a.cliente || '').localeCompare(b.cliente || '')
      default: return 0
    }
  })

  // Efecto con signo: las notas de CRÉDITO restan (rebajan la factura), las de débito suman
  const efecto       = (f: any) => ((f.doc_tipo === 'nota_credito' ? -1 : 1) * (f.monto || 0))
  const ventas       = items.filter(f => (f.tipo || 'venta') === 'venta')
  const compras      = items.filter(f => f.tipo === 'compra')
  const cobrado      = ventas.filter(f => f.estado === 'pagada').reduce((s, f) => s + efecto(f), 0)
  const pendiente    = ventas.filter(f => f.estado === 'pendiente').reduce((s, f) => s + efecto(f), 0)
  const totalCompras = compras.reduce((s, f) => s + efecto(f), 0)

  // Resultados del buscador server-side (ya vienen filtrados por doc_tipo=factura + término)
  const facturasParaNota = facturasBuscadas

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <SectionTitle>Facturación</SectionTitle>
          <p className="text-sm text-muted mt-1">Ventas, compras e IVA</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportadorSII onImported={mutate} />
          <ResumenBoletas onSaved={mutate} />
          <Btn
            onClick={() => { setForm({ ...EMPTY, doc_tipo: 'nota_credito', emision: new Date().toISOString().split('T')[0] }); setModal(true) }}
            style={{ background: '#fdecea', borderColor: '#f5c6c2', color: '#b0401a', fontWeight: 700 }}>
            + Nota crédito/débito
          </Btn>
          <Btn variant="primary" onClick={() => { setForm({ ...EMPTY, emision: new Date().toISOString().split('T')[0] }); setModal(true) }}>
            + Nueva factura
          </Btn>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Ventas cobradas"  value={fmtM(cobrado)}      sub="Facturas pagadas"        subColor="#1a7a4a" />
        <MetricCard label="Por cobrar"       value={fmtM(pendiente)}    sub="Ventas pendientes"       subColor="#b07d1a" />
        <MetricCard label="Compras (gastos)" value={fmtM(totalCompras)} sub="Facturas de proveedores" subColor="#E5502A" />
      </div>

      {/* Selector de período */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <label className="text-[13px] font-semibold text-ink">Período:</label>
        <input type="month" value={periodoSel} onChange={e => setPeriodoSel(e.target.value)}
          className="input-base !mb-0 !py-1.5 w-[170px]" />
        <span className="text-[12px] text-muted">Se muestran las facturas de este mes. Los totales de arriba también son del mes.</span>
      </div>

      {/* Filtro tipo */}
      <div className="inline-flex gap-1 p-1 bg-white border border-line rounded-xl mb-3 shadow-card">
        {[['todos', 'Todas'], ['venta', 'Ventas'], ['compra', 'Compras']].map(([k, l]) => (
          <button key={k} onClick={() => setTipoFiltro(k)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition ${tipoFiltro === k ? 'bg-accent text-white shadow-sm' : 'text-muted hover:bg-canvas'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Filtro estado */}
      <div className="inline-flex gap-1 p-1 bg-white border border-line rounded-xl mb-5 shadow-card flex-wrap">
        {['todos', 'pagada', 'pendiente', 'vencida'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition ${filtro === f ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-canvas'}`}>
            {f === 'todos' ? 'Todos los estados' : f === 'pagada' ? 'Pagadas' : f === 'pendiente' ? 'Pendientes' : 'Vencidas'}
          </button>
        ))}
      </div>

      {/* Búsqueda + ordenamiento */}
      <div className="flex gap-2 mb-5 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><IconSearch className="w-4 h-4" /></span>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, número o proyecto…"
            className="input-base pl-9 w-full" />
        </div>
        <select value={orden} onChange={e => setOrden(e.target.value)}
          className="input-base cursor-pointer min-w-[180px] w-auto">
          <option value="fecha_desc">Más recientes primero</option>
          <option value="fecha_asc">Más antiguas primero</option>
          <option value="monto_desc">Mayor monto</option>
          <option value="monto_asc">Menor monto</option>
          <option value="cliente">Cliente (A-Z)</option>
        </select>
        {(busqueda || orden !== 'fecha_desc') && (
          <button onClick={() => { setBusqueda(''); setOrden('fecha_desc') }}
            className="text-[12px] text-muted hover:text-ink px-2">Limpiar</button>
        )}
      </div>

      {/* Contador de resultados */}
      <div className="text-[12px] text-muted mb-2">
        {filtered.length} {filtered.length === 1 ? 'documento' : 'documentos'}
        {busqueda && ` · filtrando "${busqueda}"`}
      </div>

      <div className="bg-white border border-line rounded-card p-5 shadow-card overflow-x-auto">
        {isLoading
          ? <p className="text-muted text-center py-10">Cargando...</p>
          : filtered.length === 0
          ? <p className="text-muted text-center py-10">Sin facturas en este filtro</p>
          : (
          <Table>
            <thead><tr>
              <Th>Tipo</Th><Th>N°</Th><Th>Cliente / Proveedor</Th><Th>Neto</Th><Th>IVA</Th><Th>Total</Th><Th>Emisión</Th><Th>Estado</Th><Th></Th>
            </tr></thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}>
                  <Td>
                    <div className="flex flex-col gap-0.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded text-center ${f.tipo === 'compra' ? 'bg-accent-bg text-accent' : 'bg-success-bg text-success'}`}>
                        {f.tipo === 'compra' ? 'COMPRA' : 'VENTA'}
                      </span>
                      {(f.doc_tipo === 'nota_credito' || f.doc_tipo === 'nota_debito' || f.doc_tipo === 'boleta') && (
                        <span className={`text-[9px] font-bold px-1.5 py-px rounded text-center ${f.doc_tipo === 'nota_credito' ? 'bg-danger-bg text-danger' : f.doc_tipo === 'nota_debito' ? 'bg-warning-bg text-warning' : 'bg-canvas text-muted'}`}>
                          {f.doc_tipo === 'nota_credito' ? 'N.CRÉDITO' : f.doc_tipo === 'nota_debito' ? 'N.DÉBITO' : 'BOLETA'}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <span className="font-mono font-bold text-brand text-[12px]">{f.numero || '—'}</span>
                  </Td>
                  <Td>
                    <span className="font-semibold">{f.cliente}</span>
                    {f.proyecto && <div className="text-[10px] text-muted">{f.proyecto}</div>}
                  </Td>
                  <Td>{fmt(f.neto || 0)}</Td>
                  <Td><span className="text-muted">{fmt(f.iva || 0)}</span></Td>
                  <Td><span className="font-bold">{fmt(f.monto || 0)}</span></Td>
                  <Td><span className="text-muted text-[11px]">{f.emision || '—'}</span></Td>
                  <Td><Badge estado={f.estado} tipo="factura" /></Td>
                  <Td>
                    <div className="flex gap-1 items-center">
                      <select value={f.estado} onChange={e => setEstado(f.id, e.target.value)}
                        className="text-[11px] px-1.5 py-0.5 border border-line2 rounded-[5px] cursor-pointer bg-white">
                        <option value="pendiente">Pendiente</option>
                        <option value="pagada">Pagada</option>
                        <option value="vencida">Vencida</option>
                      </select>
                      <button onClick={() => del(f.id)}
                        className="bg-danger-bg text-danger border-0 rounded-[5px] w-6 h-6 cursor-pointer font-bold flex items-center justify-center">
                        ✕
                      </button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {modal && (
        <Modal
          title={form.doc_tipo === 'nota_credito' ? 'Nueva nota de crédito' : form.doc_tipo === 'nota_debito' ? 'Nueva nota de débito' : 'Nueva factura'}
          onClose={cerrarModal}>

          {/* Tipo de documento: factura / NC / ND */}
          <div className="mb-3.5">
            <label className="label-base">Documento</label>
            <div className="flex gap-2">
              {[
                { k: 'factura',      label: 'Factura',     active: 'border-brand bg-[#FCEAE3] text-brand' },
                { k: 'nota_credito', label: 'Nota crédito', active: 'border-danger bg-danger-bg text-danger' },
                { k: 'nota_debito',  label: 'Nota débito',  active: 'border-success bg-success-bg text-success' },
              ].map(d => (
                <button key={d.k} onClick={() => upd('doc_tipo', d.k)}
                  className={`flex-1 p-2.5 rounded-lg border-[1.5px] cursor-pointer text-[12px] font-bold transition ${form.doc_tipo === d.k ? d.active : 'border-line2 bg-white text-muted'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Si es nota, elegir la factura que modifica */}
          {form.doc_tipo !== 'factura' && (
            <div className="mb-3.5 bg-canvas border border-line rounded-lg p-3">
              <label className="label-base">Factura que modifica esta nota *</label>

              {form.factura_ref ? (
                <div className="flex items-center justify-between bg-white border border-brand rounded-lg px-3 py-2 mb-2">
                  <div className="text-[13px]">
                    Factura {refFolio ? <>N° <strong>{refFolio}</strong></> : 'asociada'}{form.cliente ? <> · {form.cliente}</> : null}
                  </div>
                  <button onClick={() => { setForm((f: any) => ({ ...f, factura_ref: '' })); setRefFolio(''); setBuscarFactura('') }}
                    className="text-[12px] text-danger font-semibold ml-2">Cambiar</button>
                </div>
              ) : (
                <>
                  <div className="relative mb-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"><IconSearch className="w-4 h-4" /></span>
                    <input value={buscarFactura} onChange={e => setBuscarFactura(e.target.value)}
                      placeholder="Buscar por número o cliente…" autoFocus
                      className="input-base pl-9 w-full" />
                  </div>
                  <div className="max-h-[180px] overflow-y-auto border border-line rounded-lg bg-white">
                    {facturasParaNota.length === 0
                      ? <div className="text-center text-[12px] text-muted py-4">
                          {buscarFactura.trim() ? 'Sin resultados' : 'Escribe para buscar una factura…'}
                        </div>
                      : facturasParaNota.map(f => (
                        <button key={f.id} onClick={() => onSelectFacturaRef(f.id)}
                          className="w-full text-left px-3 py-2 hover:bg-canvas border-b border-[#F1ECE6] last:border-0 transition">
                          <div className="text-[13px] font-semibold text-ink">{f.numero || 's/n'} · {f.cliente}</div>
                          <div className="text-[11px] text-muted">{fmt(f.monto)} · {f.tipo === 'compra' ? 'compra' : 'venta'} · {f.emision || 's/f'}</div>
                        </button>
                      ))}
                  </div>
                </>
              )}

              <p className="text-[11px] text-muted mt-1.5">
                {form.doc_tipo === 'nota_credito'
                  ? 'La nota de crédito REBAJA el IVA de esta factura.'
                  : 'La nota de débito AUMENTA el IVA de esta factura.'}
              </p>
            </div>
          )}

          {/* Venta / Compra */}
          <div className="mb-3.5">
            <label className="label-base">Tipo</label>
            <div className="flex gap-2">
              <button onClick={() => upd('tipo', 'venta')}
                className={`flex-1 py-2.5 rounded-lg border-[1.5px] cursor-pointer text-[13px] font-bold transition ${form.tipo === 'venta' ? 'border-success bg-success-bg text-success' : 'border-line2 bg-white text-muted'}`}>
                Venta (emitida)
              </button>
              <button onClick={() => upd('tipo', 'compra')}
                className={`flex-1 py-2.5 rounded-lg border-[1.5px] cursor-pointer text-[13px] font-bold transition ${form.tipo === 'compra' ? 'border-accent bg-accent-bg text-accent' : 'border-line2 bg-white text-muted'}`}>
                Compra (recibida)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Selector de cliente o proveedor */}
            <div className="mb-3">
              <label className="label-base">{form.tipo === 'compra' ? 'Proveedor' : 'Cliente'}</label>
              <select
                value={mostrarOtroCliente ? '__otro__' : (form.cliente || '')}
                onChange={e => {
                  if (e.target.value === '__otro__') {
                    setMostrarOtroCliente(true)
                    upd('cliente', '')
                  } else {
                    setMostrarOtroCliente(false)
                    upd('cliente', e.target.value)
                  }
                }}
                className="input-base cursor-pointer">
                <option value="">— Seleccionar {form.tipo === 'compra' ? 'proveedor' : 'cliente'} —</option>
                {(form.tipo === 'compra' ? proveedores : clientes).map((c: any) => {
                  const nombre = c.razon_social || c.nombre
                  return <option key={c.id} value={nombre}>{nombre}</option>
                })}
                <option value="__otro__">+ Otro (escribir manual)</option>
              </select>
              {mostrarOtroCliente && (
                <input autoFocus placeholder={`Nombre del ${form.tipo === 'compra' ? 'proveedor' : 'cliente'}`}
                  className="input-base mt-2" value={form.cliente || ''}
                  onChange={e => upd('cliente', e.target.value)} />
              )}
            </div>

            {/* Selector de proyecto */}
            <div className="mb-3">
              <label className="label-base">Proyecto (opcional)</label>
              <select
                value={form.proyecto_id || ''}
                onChange={e => {
                  const id = e.target.value
                  const pr = proyectos.find((p: any) => p.id === id)
                  setForm((f: any) => ({ ...f, proyecto_id: id, proyecto: pr?.nombre || '' }))
                }}
                className="input-base cursor-pointer">
                <option value="">— Sin proyecto —</option>
                {proyectos.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.nombre}</option>
                ))}
              </select>
            </div>

            <FormInput label="N° Factura" value={form.numero || ''} onChange={v => upd('numero', v)} />
            <div />

            <FormInput label="Monto NETO (CLP)" value={form.neto || ''} onChange={updNeto} type="number" />
            <div>
              {/* Editable: documentos exentos o parcialmente exentos llevan IVA ≠ 19% */}
              <FormInput label="IVA (auto 19%, editable)" value={form.iva ?? ''} type="number"
                onChange={v => { const iva = Number(v) || 0; setForm((f: any) => ({ ...f, iva, monto: (Number(f.neto) || 0) + iva })) }} />
              <p className="text-[10px] text-muted -mt-2">Déjalo en 0 si el documento es exento</p>
            </div>

            <div className="col-span-2 px-3.5 py-2.5 bg-[#FCEAE3] rounded-lg flex justify-between items-center">
              <span className="text-[13px] font-semibold text-[#0c447c]">Total (con IVA)</span>
              <span className="text-[15px] font-extrabold text-brand">{fmt(form.monto || 0)}</span>
            </div>

            <FormInput label="Fecha emisión" value={form.emision || ''} onChange={v => upd('emision', v)} type="date" />
            <FormInput label="Vencimiento"   value={form.vencimiento || ''} onChange={v => upd('vencimiento', v)} type="date" />
            <FormSelect label="Estado" value={form.estado || 'pendiente'} onChange={v => upd('estado', v)}
              options={[{ value: 'pendiente', label: 'Pendiente' }, { value: 'pagada', label: 'Pagada' }, { value: 'vencida', label: 'Vencida' }]} />
          </div>

          <div className="flex gap-2 justify-end mt-3.5">
            <Btn onClick={cerrarModal}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}