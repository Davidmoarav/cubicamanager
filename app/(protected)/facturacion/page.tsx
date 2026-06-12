'use client'
// app/(protected)/facturacion/page.tsx — v2 con tipo venta/compra + neto/IVA

import { useState, useEffect, useCallback } from 'react'
import { Badge, Btn, FormInput, FormSelect, MetricCard, Modal, SectionTitle, Table, Td, Th, fmt, fmtM } from '@/components/ui'

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
    await load(); setModal(false)
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

  const ventas = items.filter(f => (f.tipo || 'venta') === 'venta')
  const compras = items.filter(f => f.tipo === 'compra')
  const cobrado   = ventas.filter(f=>f.estado==='pagada').reduce((s,f)=>s+(f.monto||0),0)
  const pendiente = ventas.filter(f=>f.estado==='pendiente').reduce((s,f)=>s+(f.monto||0),0)
  const totalCompras = compras.reduce((s,f)=>s+(f.monto||0),0)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <SectionTitle>Facturación</SectionTitle>
          <p className="text-sm text-muted mt-1">Ventas, compras e IVA</p>
        </div>
        <div className="flex gap-2">
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
        <Modal title={form.doc_tipo === 'nota_credito' ? 'Nueva nota de crédito' : form.doc_tipo === 'nota_debito' ? 'Nueva nota de débito' : 'Nueva factura'} onClose={() => setModal(false)}>
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

          {/* Si es nota, elegir la factura que modifica (OBLIGATORIO) */}
          {form.doc_tipo !== 'factura' && (
            <div style={{ marginBottom:14, background:'#fafbfc', border:'1px solid #e4e9f0', borderRadius:8, padding:12 }}>
              <label className="label-base">Factura que modifica esta nota *</label>
              <select value={form.factura_ref || ''} onChange={e => onSelectFacturaRef(e.target.value)} className="input-base cursor-pointer">
                <option value="">— Selecciona la factura —</option>
                {items.filter(f => (f.doc_tipo || 'factura') === 'factura').map(f => (
                  <option key={f.id} value={f.id}>
                    {f.numero || 's/n'} · {f.cliente} · {fmt(f.monto)} ({f.tipo === 'compra' ? 'compra' : 'venta'})
                  </option>
                ))}
              </select>
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
                value={form.cliente || ''}
                onChange={e => upd('cliente', e.target.value)}
                className="input-base cursor-pointer">
                <option value="">— Seleccionar {form.tipo === 'compra' ? 'proveedor' : 'cliente'} —</option>
                {(form.tipo === 'compra' ? proveedores : clientes).map((c: any) => {
                  const nombre = c.razon_social || c.nombre
                  return <option key={c.id} value={nombre}>{nombre}</option>
                })}
                <option value="__otro__">+ Otro (escribir manual)</option>
              </select>
              {form.cliente === '__otro__' && (
                <input autoFocus placeholder={`Nombre del ${form.tipo === 'compra' ? 'proveedor' : 'cliente'}`}
                  className="input-base mt-2" value=""
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
            <Btn onClick={() => setModal(false)}>Cancelar</Btn>
            <Btn variant="primary" onClick={save} disabled={saving}>{saving?'Guardando...':'Guardar'}</Btn>
          </div>
        </Modal>
      )}
    </div>
  )
}
