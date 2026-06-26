'use client'
// app/(protected)/facturacion/page.tsx — v3 con tipo venta/compra + neto/IVA + importador SII

import { useState, useEffect, useCallback } from 'react'
import { Badge, Btn, FormInput, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th, fmt, fmtM } from '@/components/ui'
import ImportadorSII from '@/components/ImportadorSII'
import ResumenBoletas from '@/components/ResumenBoletas'

const EMPTY: any = { numero:'', cliente:'', proyecto:'', tipo:'venta', doc_tipo:'factura', factura_ref:'', neto:0, iva:0, monto:0, emision:'', vencimiento:'', estado:'pendiente' }

export default function FacturacionPage() {
  const [items, setItems]   = useState<any[]>([])
  const [clientes, setClientes]       = useState<any[]>([])
  const [proveedores, setProveedores] = useState<any[]>([])
  const [proyectos, setProyectos]     = useState<any[]>([])
  const [modal, setModal]   = useState(false)
  const [form, setForm]     = useState<any>({})
  const [filtro, setFiltro] = useState('todos')
  const [tipoFiltro, setTipoFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')           // buscar en el listado
  const [orden, setOrden] = useState('fecha_desc')        // ordenar listado
  const [buscarFactura, setBuscarFactura] = useState('')  // buscar factura para asociar nota
  const [mostrarOtroCliente, setMostrarOtroCliente] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [resF, resC, resPr, resPy] = await Promise.all([
      fetch('/api/facturas').then(r => r.json()).catch(() => []),
      fetch('/api/clientes').then(r => r.json()).catch(() => []),
      fetch('/api/proveedores').then(r => r.json()).catch(() => []),
      fetch('/api/proyectos').then(r => r.json()).catch(() => []),
    ])
    setItems(Array.isArray(resF) ? resF : [])
    setClientes(Array.isArray(resC) ? resC : [])
    setProveedores(Array.isArray(resPr) ? resPr : [])
    setProyectos(Array.isArray(resPy) ? resPy : [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const upd = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  // Al cambiar el neto, calcular IVA y total automáticamente
  const updNeto = (v: any) => {
    const neto = Number(v) || 0
    const iva = Math.round(neto * 0.19)
    setForm((f: any) => ({ ...f, neto, iva, monto: neto + iva }))
  }

  // Al elegir la factura que la nota modifica, hereda tipo y cliente
  const onSelectFacturaRef = (facturaId: string) => {
    const fac = items.find(f => f.id === facturaId)
    if (!fac) { setForm((f: any) => ({ ...f, factura_ref: '' })); return }
    setForm((f: any) => ({
      ...f,
      factura_ref: facturaId,
      tipo: fac.tipo || 'venta',
      cliente: fac.cliente,
      proyecto: fac.proyecto || '',
    }))
  }

  const save = async () => {
    if (!form.cliente || form.cliente === '__otro__') { alert('Selecciona o escribe el nombre'); return }
    // Si es nota, la factura asociada es obligatoria
    if (form.doc_tipo !== 'factura' && !form.factura_ref) {
      alert('Debes seleccionar la factura que esta nota modifica')
      return
    }
    setSaving(true)
    const periodo = form.emision ? form.emision.slice(0, 7) : new Date().toISOString().slice(0, 7)
    // Las fechas vacías deben ir como null (Postgres rechaza '' en columnas date)
    const payload = {
      ...form,
      neto: Number(form.neto),
      iva: Number(form.iva),
      monto: Number(form.monto),
      emision: form.emision || null,
      vencimiento: form.vencimiento || null,
      proyecto: form.proyecto || null,
      numero: form.numero || null,
      factura_ref: form.factura_ref || null,
      periodo,
    }
    const res = await fetch('/api/facturas', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('No se pudo guardar: ' + (err.error || 'error desconocido') +
        '\n\nSi menciona "doc_tipo" o "factura_ref", ejecuta el SQL 14_notas_credito_debito.sql en Supabase.')
      return
    }
    await load(); setModal(false); setBuscarFactura(''); setMostrarOtroCliente(false)
  }

  const setEstado = async (id: string, estado: string) => {
    await fetch('/api/facturas', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, estado }) })
    await load()
  }

  const del = async (id: string) => {
    if (!confirm('¿Eliminar factura?')) return
    await fetch('/api/facturas', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    await load()
  }

  let filtered = items
  if (tipoFiltro !== 'todos') filtered = filtered.filter(i => (i.tipo || 'venta') === tipoFiltro)
  if (filtro !== 'todos')     filtered = filtered.filter(i => i.estado === filtro)
  // Búsqueda por texto (cliente, número, proyecto)
  if (busqueda.trim()) {
    const q = busqueda.toLowerCase().trim()
    filtered = filtered.filter(i =>
      (i.cliente || '').toLowerCase().includes(q) ||
      (i.numero || '').toLowerCase().includes(q) ||
      (i.proyecto || '').toLowerCase().includes(q)
    )
  }
  // Ordenamiento
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

  const ventas = items.filter(f => (f.tipo || 'venta') === 'venta')
  const compras = items.filter(f => f.tipo === 'compra')
  const cobrado   = ventas.filter(f=>f.estado==='pagada').reduce((s,f)=>s+(f.monto||0),0)
  const pendiente = ventas.filter(f=>f.estado==='pendiente').reduce((s,f)=>s+(f.monto||0),0)
  const totalCompras = compras.reduce((s,f)=>s+(f.monto||0),0)

  // Facturas filtradas para asociar a una nota (con buscador)
  const facturasParaNota = items
    .filter(f => (f.doc_tipo || 'factura') === 'factura')
    .filter(f => {
      if (!buscarFactura.trim()) return true
      const q = buscarFactura.toLowerCase().trim()
      return (f.cliente || '').toLowerCase().includes(q) ||
             (f.numero || '').toLowerCase().includes(q)
    })
    .slice(0, 50)  // límite para no renderizar miles

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <SectionTitle>Facturación</SectionTitle>
          <p className="text-sm text-muted mt-1">Ventas, compras e IVA</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <ImportadorSII onImported={load} />
          <ResumenBoletas onSaved={load} />
          <Btn onClick={() => { setForm({ ...EMPTY, doc_tipo:'nota_credito', emision: new Date().toISOString().split('T')[0] }); setModal(true) }}
            style={{ background:'#fdecea', borderColor:'#f5c6c2', color:'#b0401a', fontWeight:700 }}>+ Nota crédito/débito</Btn>
          <Btn variant="primary" onClick={() => { setForm({ ...EMPTY, emision: new Date().toISOString().split('T')[0] }); setModal(true) }}>+ Nueva factura</Btn>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label="Ventas cobradas"  value={fmtM(cobrado)}   sub="Facturas pagadas"    subColor="#1a7a4a" />
        <MetricCard label="Por cobrar"       value={fmtM(pendiente)} sub="Ventas pendientes"   subColor="#b07d1a" />
        <MetricCard label="Compras (gastos)" value={fmtM(totalCompras)} sub="Facturas de proveedores" subColor="#1e6bb8" />
      </div>

      {/* Filtro tipo */}
      <div className="inline-flex gap-1 p-1 bg-white border border-line rounded-xl mb-3 shadow-card">
        {[['todos','Todas'],['venta','Ventas'],['compra','Compras']].map(([k,l]) => (
          <button key={k} onClick={() => setTipoFiltro(k)}
            className={`px-3.5 py-1.5 rounded-lg text-[13px] font-bold transition
              ${tipoFiltro===k ? 'bg-accent text-white shadow-sm' : 'text-muted hover:bg-canvas'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Filtro estado */}
      <div className="inline-flex gap-1 p-1 bg-white border border-line rounded-xl mb-5 shadow-card flex-wrap">
        {['todos','pagada','pendiente','vencida'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className={`px-3 py-1 rounded-lg text-[12px] font-semibold transition
              ${filtro===f ? 'bg-brand text-white shadow-sm' : 'text-muted hover:bg-canvas'}`}>
            {f==='todos'?'Todos los estados': f==='pagada'?'Pagadas': f==='pendiente'?'Pendientes':'Vencidas'}
          </button>
        ))}
      </div>

      {/* Búsqueda + ordenamiento */}
      <div className="flex gap-2 mb-5 flex-wrap items-center">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[14px]">🔍</span>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por cliente, número o proyecto…"
            className="input-base pl-9 w-full" />
        </div>
        <select value={orden} onChange={e => setOrden(e.target.value)}
          className="input-base cursor-pointer" style={{ width: 'auto', minWidth: 180 }}>
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

      <div className="bg-white border border-line rounded-2xl p-5 shadow-card overflow-x-auto">
        {loading
          ? <p style={{ color:'#6b7a8d', textAlign:'center', padding:40 }}>Cargando...</p>
          : filtered.length === 0
          ? <p style={{ color:'#6b7a8d', textAlign:'center', padding:40 }}>Sin facturas en este filtro</p>
          : (
          <Table>
            <thead><tr>
              <Th>Tipo</Th><Th>N°</Th><Th>Cliente / Proveedor</Th><Th>Neto</Th><Th>IVA</Th><Th>Total</Th><Th>Emisión</Th><Th>Estado</Th><Th></Th>
            </tr></thead>
            <tbody>
              {filtered.map(f => (
                <tr key={f.id}>
                  <Td>
                    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:4, textAlign:'center',
                        background: f.tipo === 'compra' ? '#eeedfe' : '#e6f4ed',
                        color: f.tipo === 'compra' ? '#534ab7' : '#1a7a4a' }}>
                        {f.tipo === 'compra' ? 'COMPRA' : 'VENTA'}
                      </span>
                      {(f.doc_tipo === 'nota_credito' || f.doc_tipo === 'nota_debito') && (
                        <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:4, textAlign:'center',
                          background: f.doc_tipo === 'nota_credito' ? '#fdecea' : '#fef3d7',
                          color: f.doc_tipo === 'nota_credito' ? '#b0401a' : '#b07d1a' }}>
                          {f.doc_tipo === 'nota_credito' ? '➖ N.CRÉDITO' : '➕ N.DÉBITO'}
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td><span style={{ fontFamily:'monospace', fontWeight:700, color:'#1e6bb8', fontSize:12 }}>{f.numero||'—'}</span></Td>
                  <Td style={{ fontWeight:600 }}>{f.cliente}{f.proyecto && <div style={{ fontSize:10, color:'#6b7a8d' }}>{f.proyecto}</div>}</Td>
                  <Td>{fmt(f.neto || 0)}</Td>
                  <Td style={{ color:'#6b7a8d' }}>{fmt(f.iva || 0)}</Td>
                  <Td style={{ fontWeight:700 }}>{fmt(f.monto || 0)}</Td>
                  <Td style={{ color:'#6b7a8d', fontSize:11 }}>{f.emision||'—'}</Td>
                  <Td><Badge estado={f.estado} tipo="factura" /></Td>
                  <Td>
                    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                      <select value={f.estado} onChange={e => setEstado(f.id, e.target.value)}
                        style={{ fontSize:11, padding:'3px 6px', border:'1px solid #d1d9e6', borderRadius:5, cursor:'pointer' }}>
                        <option value="pendiente">Pendiente</option>
                        <option value="pagada">Pagada</option>
                        <option value="vencida">Vencida</option>
                      </select>
                      <button onClick={() => del(f.id)} style={{ background:'#fdecea', color:'#b0401a', border:'none', borderRadius:5, width:24, height:24, cursor:'pointer', fontWeight:700 }}>✕</button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>

      {modal && (
        <Modal title={form.doc_tipo === 'nota_credito' ? 'Nueva nota de crédito' : form.doc_tipo === 'nota_debito' ? 'Nueva nota de débito' : 'Nueva factura'} onClose={() => { setModal(false); setBuscarFactura(''); setMostrarOtroCliente(false) }}>
          {/* Tipo de documento: factura / NC / ND */}
          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#6b7a8d', marginBottom:6 }}>Documento</label>
            <div style={{ display:'flex', gap:8 }}>
              {[
                { k:'factura',      label:'🧾 Factura',     c:'#1e6bb8', bg:'#e8f1fb' },
                { k:'nota_credito', label:'➖ Nota crédito', c:'#b0401a', bg:'#fdecea' },
                { k:'nota_debito',  label:'➕ Nota débito',  c:'#1a7a4a', bg:'#e6f4ed' },
              ].map(d => (
                <button key={d.k} onClick={() => upd('doc_tipo', d.k)}
                  style={{ flex:1, padding:'9px', borderRadius:8, border:'1.5px solid', cursor:'pointer', fontSize:12, fontWeight:700,
                    borderColor: form.doc_tipo===d.k?d.c:'#d1d9e6', background: form.doc_tipo===d.k?d.bg:'#fff', color: form.doc_tipo===d.k?d.c:'#6b7a8d' }}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Si es nota, elegir la factura que modifica (OBLIGATORIO, con buscador) */}
          {form.doc_tipo !== 'factura' && (
            <div style={{ marginBottom:14, background:'#fafbfc', border:'1px solid #e4e9f0', borderRadius:8, padding:12 }}>
              <label className="label-base">Factura que modifica esta nota *</label>

              {/* Si ya hay una seleccionada, mostrarla */}
              {form.factura_ref ? (
                <div className="flex items-center justify-between bg-white border border-brand rounded-lg px-3 py-2 mb-2">
                  <div className="text-[13px]">
                    {(() => {
                      const fac = items.find(f => f.id === form.factura_ref)
                      return fac ? <span><strong>{fac.numero || 's/n'}</strong> · {fac.cliente} · {fmt(fac.monto)}</span> : 'Factura seleccionada'
                    })()}
                  </div>
                  <button onClick={() => { setForm((f:any) => ({ ...f, factura_ref: '' })); setBuscarFactura('') }}
                    className="text-[12px] text-danger font-semibold ml-2">Cambiar</button>
                </div>
              ) : (
                <>
                  {/* Buscador */}
                  <div className="relative mb-2">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[13px]">🔍</span>
                    <input value={buscarFactura} onChange={e => setBuscarFactura(e.target.value)}
                      placeholder="Buscar por número o cliente…" autoFocus
                      className="input-base pl-9 w-full" />
                  </div>
                  {/* Resultados */}
                  <div className="max-h-[180px] overflow-y-auto border border-line rounded-lg bg-white">
                    {facturasParaNota.length === 0
                      ? <div className="text-center text-[12px] text-muted py-4">
                          {buscarFactura ? 'Sin resultados' : 'No hay facturas registradas'}
                        </div>
                      : facturasParaNota.map(f => (
                        <button key={f.id} onClick={() => onSelectFacturaRef(f.id)}
                          className="w-full text-left px-3 py-2 hover:bg-canvas border-b border-[#f0f4f8] last:border-0 transition">
                          <div className="text-[13px] font-semibold text-ink">{f.numero || 's/n'} · {f.cliente}</div>
                          <div className="text-[11px] text-muted">{fmt(f.monto)} · {f.tipo === 'compra' ? 'compra' : 'venta'} · {f.emision || 's/f'}</div>
                        </button>
                      ))}
                  </div>
                  {items.filter(f => (f.doc_tipo || 'factura') === 'factura').length > 50 && (
                    <p className="text-[10px] text-muted mt-1">Mostrando primeras 50. Usa el buscador para encontrar una específica.</p>
                  )}
                </>
              )}

              <p style={{ fontSize:11, color:'#6b7a8d', marginTop:6 }}>
                {form.doc_tipo === 'nota_credito'
                  ? 'La nota de crédito REBAJA el IVA de esta factura.'
                  : 'La nota de débito AUMENTA el IVA de esta factura.'}
              </p>
            </div>
          )}

          <div style={{ marginBottom:14 }}>
            <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#6b7a8d', marginBottom:6 }}>Tipo</label>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => upd('tipo', 'venta')}
                style={{ flex:1, padding:'10px', borderRadius:8, border:'1.5px solid', cursor:'pointer', fontSize:13, fontWeight:700,
                  borderColor: form.tipo==='venta'?'#1a7a4a':'#d1d9e6', background: form.tipo==='venta'?'#e6f4ed':'#fff', color: form.tipo==='venta'?'#1a7a4a':'#6b7a8d' }}>
                📤 Venta (emitida)
              </button>
              <button onClick={() => upd('tipo', 'compra')}
                style={{ flex:1, padding:'10px', borderRadius:8, border:'1.5px solid', cursor:'pointer', fontSize:13, fontWeight:700,
                  borderColor: form.tipo==='compra'?'#534ab7':'#d1d9e6', background: form.tipo==='compra'?'#eeedfe':'#fff', color: form.tipo==='compra'?'#534ab7':'#6b7a8d' }}>
                📥 Compra (recibida)
              </button>
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {/* Selector de cliente o proveedor según el tipo */}
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
                value={form.proyecto || ''}
                onChange={e => upd('proyecto', e.target.value)}
                className="input-base cursor-pointer">
                <option value="">— Sin proyecto —</option>
                {proyectos.map((p: any) => (
                  <option key={p.id} value={p.nombre}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <FormInput label="N° Factura" value={form.numero||''} onChange={v=>upd('numero',v)} />
            <div></div>
            <FormInput label="Monto NETO (CLP)" value={form.neto||''} onChange={updNeto} type="number" />
            <div>
              <label style={{ display:'block', fontSize:12, fontWeight:600, color:'#6b7a8d', marginBottom:4 }}>IVA (19%) — automático</label>
              <div style={{ padding:'8px 11px', background:'#f0f4f8', border:'1px solid #d1d9e6', borderRadius:7, fontSize:13, fontWeight:600 }}>{fmt(form.iva || 0)}</div>
            </div>
            <div style={{ gridColumn:'1/-1', padding:'10px 14px', background:'#e8f1fb', borderRadius:8, display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:13, fontWeight:600, color:'#0c447c' }}>Total (con IVA)</span>
              <span style={{ fontSize:15, fontWeight:800, color:'#1e6bb8' }}>{fmt(form.monto || 0)}</span>
            </div>
            <FormInput label="Fecha emisión" value={form.emision||''} onChange={v=>upd('emision',v)} type="date" />
            <FormInput label="Vencimiento" value={form.vencimiento||''} onChange={v=>upd('vencimiento',v)} type="date" />
            <FormSelect label="Estado" value={form.estado||'pendiente'} onChange={v=>upd('estado',v)}
              options={[{value:'pendiente',label:'Pendiente'},{value:'pagada',label:'Pagada'},{value:'vencida',label:'Vencida'}]} />
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:14 }}>
            <Btn onClick={() => { setModal(false); setBuscarFactura(''); setMostrarOtroCliente(false) }}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving?'Guardando...':'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}