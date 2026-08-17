'use client'
// app/(protected)/configuracion/page.tsx

import { useState, useEffect, useCallback, useRef } from 'react'
import { Btn, FormInput, Modal, SectionTitle } from '@/components/ui'
import PerfilPanel from '@/components/PerfilPanel'
import useSWR from 'swr'
import { fetcher } from '@/lib/fetcher'
import { createClient } from '@/lib/supabase'
import type { EmpresaConfig } from '@/types/empresa'

export default function ConfiguracionPage() {
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const { data: miRol } = useSWR<any>('/api/mi-rol', fetcher)
  const esAdmin = miRol?.rol === 'admin'
  const [tab, setTab]           = useState<'empresa' | 'perfil'>('empresa')
  const [form, setForm]         = useState<EmpresaConfig>({})
  const [logoUrl, setLogoUrl]   = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg]           = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  // ─── Cargar config + URL pública del logo ────────────────
  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/empresa')
    const data = await res.json()
    if (data && !data.error) {
      setForm(data)
      if (data.logo_path) {
        const { data: { publicUrl } } = supabase.storage.from('empresa-logos').getPublicUrl(data.logo_path)
        setLogoUrl(publicUrl)
      }
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])

  const upd = (k: keyof EmpresaConfig, v: any) => setForm(f => ({ ...f, [k]: v }))

  // ─── Subir logo a Storage ────────────────────────────────
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validación
    if (file.size > 2 * 1024 * 1024) {
      setMsg({ kind: 'error', text: 'El logo no puede pesar más de 2 MB' })
      return
    }
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type)) {
      setMsg({ kind: 'error', text: 'Solo se aceptan PNG, JPG, WEBP o SVG' })
      return
    }

    setUploading(true)
    setMsg(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploading(false); return }

    // Carpeta del DUEÑO de la organización (un admin invitado no es el dueño)
    let ownerId = user.id
    try {
      const rol = await (await fetch('/api/mi-rol')).json()
      if (rol?.owner_id) ownerId = rol.owner_id
    } catch {}

    // Ruta: {owner_id}/logo.{ext}  — sobrescribe el anterior
    const ext  = file.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${ownerId}/logo.${ext}`

    // Subir el ArrayBuffer con contentType explícito: evita el error
    // "No content provided" que ocurre al pasar un File directo en algunos navegadores.
    const buffer = await file.arrayBuffer()
    if (buffer.byteLength === 0) {
      setMsg({ kind: 'error', text: 'El archivo está vacío o no se pudo leer. Intenta con otro.' })
      setUploading(false)
      return
    }

    const { error: upErr } = await supabase.storage
      .from('empresa-logos')
      .upload(path, buffer, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type || `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      })

    if (upErr) {
      setMsg({ kind: 'error', text: 'Error al subir logo: ' + upErr.message })
      setUploading(false)
      return
    }

    // Actualizar logo_path en la BD
    const newForm = { ...form, logo_path: path }
    setForm(newForm)

    await fetch('/api/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm),
    })

    // Refrescar URL pública (con cache-buster)
    const { data: { publicUrl } } = supabase.storage.from('empresa-logos').getPublicUrl(path)
    setLogoUrl(publicUrl + '?t=' + Date.now())
    setUploading(false)
    setMsg({ kind: 'ok', text: 'Logo actualizado correctamente' })
  }

  const removeLogo = async () => {
    if (!form.logo_path) return
    if (!confirm('¿Eliminar el logo actual?')) return

    await supabase.storage.from('empresa-logos').remove([form.logo_path])
    const newForm = { ...form, logo_path: '' }
    setForm(newForm)
    setLogoUrl(null)
    await fetch('/api/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newForm),
    })
  }

  // ─── Guardar datos ───────────────────────────────────────
  const save = async () => {
    setSaving(true)
    setMsg(null)

    const res = await fetch('/api/empresa', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (!res.ok) {
      const { error } = await res.json()
      setMsg({ kind: 'error', text: 'Error al guardar: ' + error })
    } else {
      setMsg({ kind: 'ok', text: 'Configuración guardada correctamente' })
    }
    setSaving(false)
  }

  if (loading) return <p className="text-muted p-5">Cargando...</p>

  return (
    <div className="max-w-[860px]">
      <SectionTitle>Configuración</SectionTitle>

      {/* Pestañas */}
      <div className="flex gap-1 mb-5 border-b border-line">
        {([['empresa', 'Empresa'], ['perfil', 'Mi perfil']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 text-[13px] font-semibold border-b-2 -mb-px transition ${
              tab === k ? 'border-brand text-brand' : 'border-transparent text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'perfil' ? <PerfilPanel /> : !esAdmin ? (
        <div className="bg-white border border-line rounded-card p-8 text-center shadow-card">
          <p className="text-muted text-[14px]">Solo el administrador puede editar los datos de la empresa.</p>
        </div>
      ) : (
      <>
      <p className="text-[13px] text-muted mb-6">
        Estos datos aparecerán en tus cotizaciones, facturas y reportes PDF.
      </p>

      {/* ── BANNER MSG ── */}
      {msg && (
        <div className={`px-4 py-3 rounded-lg mb-[18px] text-[13px] border ${
          msg.kind === 'ok'
            ? 'bg-success-bg text-success border-[#b9e0c9]'
            : 'bg-danger-bg text-danger border-[#f5c6c2]'
        }`}>
          {msg.text}
        </div>
      )}

      {/* ─── LOGO ─── */}
      <div className="bg-white border border-line rounded-card p-6 shadow-card mb-5">
        <div className="text-[14px] font-bold text-[#1a2535] mb-3.5">Logo de la empresa</div>

        <div className="flex items-center gap-6">
          {/* Preview */}
          <div className="w-40 h-40 border border-dashed border-[#d1d9e6] rounded-[10px] bg-[#FBFAF9] flex items-center justify-center shrink-0 overflow-hidden">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="max-w-[90%] max-h-[90%] object-contain" />
              : <div className="text-[12px] text-[#a0aab8] text-center p-3">Sin logo<br/>Sube uno aquí</div>}
          </div>

          {/* Controles */}
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={handleLogoUpload} className="hidden" />

            <div className="flex gap-2 mb-3 flex-wrap">
              <Btn variant="primary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Subiendo...' : (logoUrl ? 'Cambiar logo' : 'Subir logo')}
              </Btn>
              {logoUrl && <Btn variant="danger" onClick={removeLogo}>Quitar logo</Btn>}
            </div>

            <ul className="text-[12px] text-muted pl-[18px] leading-7">
              <li>Formatos: PNG, JPG, WEBP, SVG</li>
              <li>Tamaño máximo: 2 MB</li>
              <li>Recomendado: 400×400 px o fondo transparente (PNG)</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ─── DATOS DE LA EMPRESA ─── */}
      <div className="bg-white border border-line rounded-card p-6 shadow-card mb-5">
        <div className="text-[14px] font-bold text-[#1a2535] mb-3.5">Datos legales y comerciales</div>

        <div className="grid grid-cols-2 gap-3.5">
          <FormInput label="Razón social"        value={form.razon_social || ''} onChange={v => upd('razon_social', v)} placeholder="Ej: Constructora Ejemplo SpA" />
          <FormInput label="RUT"                 value={form.rut || ''}          onChange={v => upd('rut', v)}          placeholder="76.123.456-7" />
          <div className="col-span-2">
            <FormInput label="Giro"              value={form.giro || ''}         onChange={v => upd('giro', v)}         placeholder="Comercialización de materiales de construcción y servicios" />
          </div>
          <div className="col-span-2">
            <FormInput label="Dirección"         value={form.direccion || ''}    onChange={v => upd('direccion', v)}    placeholder="Av. 1 Sur 1234" />
          </div>
          <FormInput label="Comuna"              value={form.comuna || ''}       onChange={v => upd('comuna', v)}       placeholder="Ej: Santiago" />
          <FormInput label="Ciudad"              value={form.ciudad || ''}       onChange={v => upd('ciudad', v)}       placeholder="Ej: Santiago" />
          <FormInput label="Teléfono"            value={form.telefono || ''}     onChange={v => upd('telefono', v)}     placeholder="+56 71 222 3333" />
          <FormInput label="Email"               value={form.email || ''}        onChange={v => upd('email', v)}        placeholder="contacto@empresa.cl" type="email" />
          <div className="col-span-2">
            <FormInput label="Sitio web"         value={form.sitio_web || ''}    onChange={v => upd('sitio_web', v)}    placeholder="https://www.tuempresa.cl" />
          </div>
        </div>
      </div>

      {/* ─── PERSONALIZACIÓN PDF ─── */}
      <div className="bg-white border border-line rounded-card p-6 shadow-card mb-5">
        <div className="text-[14px] font-bold text-[#1a2535] mb-3.5">Personalización de documentos PDF</div>

        <div className="grid grid-cols-[180px_1fr] gap-3.5 items-center">
          <label className="text-[12px] font-semibold text-muted">Color principal</label>
          <div className="flex items-center gap-[10px]">
            <input type="color" value={form.color_primario || '#E5502A'}
              onChange={e => upd('color_primario', e.target.value)}
              className="w-[50px] h-9 border border-[#d1d9e6] rounded-[6px] cursor-pointer" />
            <input value={form.color_primario || '#E5502A'}
              onChange={e => upd('color_primario', e.target.value)}
              className="w-[120px] px-[11px] py-2 border border-[#d1d9e6] rounded-[7px] text-[13px] font-mono" />
            <span className="text-[12px] text-muted">Se usa en títulos y bordes del PDF</span>
          </div>
        </div>

        <div className="mt-3.5">
          <FormInput label="Notas / términos al pie del PDF (opcional)"
            value={form.notas_pdf || ''}
            onChange={v => upd('notas_pdf', v)}
            placeholder="Ej: Cotización válida por 30 días. No incluye instalación salvo indicación expresa." />
        </div>
      </div>

      {/* ─── ACCIONES ─── */}
      <div className="flex gap-[10px] justify-end mt-[18px]">
        <Btn variant="primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </Btn>
      </div>
      </>
      )}
    </div>
  )
}