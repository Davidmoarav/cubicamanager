// app/privacidad/page.tsx
// Política de privacidad pública: App Store y Google Play exigen su dirección.
// BORRADOR: completar RESPONSABLE y revisarla con un abogado antes de enviar a las tiendas.
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Política de privacidad · Cubica Manager' }

const RESPONSABLE = {
  nombre: '',
  rut: '',
  direccion: '',
  correo: '',
}
const VIGENCIA = ''

const pendiente = !RESPONSABLE.nombre || !RESPONSABLE.rut || !RESPONSABLE.direccion || !RESPONSABLE.correo || !VIGENCIA
const dato = (valor: string, campo: string) => valor || `[${campo}]`

const Seccion = ({ titulo, children }: { titulo: string; children: React.ReactNode }) => (
  <section className="mb-6">
    <h2 className="text-[15px] font-bold text-ink mb-1.5">{titulo}</h2>
    <div className="text-[14px] leading-relaxed text-ink flex flex-col gap-2">{children}</div>
  </section>
)

export default function PrivacidadPage() {
  return (
    <main className="min-h-screen bg-om-canvas px-5 py-10">
      <div className="max-w-[680px] mx-auto bg-white border border-line rounded-card p-7 shadow-card">
        <h1 className="text-[22px] font-extrabold text-ink mb-1">Política de privacidad</h1>
        <p className="text-[13px] text-muted mb-6">Cubica Manager · Vigente desde {dato(VIGENCIA, 'fecha')}</p>

        {pendiente && (
          <p className="mb-6 text-[12.5px] font-semibold text-warning bg-warning-bg rounded-lg px-3.5 py-2.5">
            Borrador: faltan los datos del responsable.
          </p>
        )}

        <Seccion titulo="Quién es responsable">
          <p>
            {dato(RESPONSABLE.nombre, 'razón social')}, RUT {dato(RESPONSABLE.rut, 'RUT')}, con domicilio en {dato(RESPONSABLE.direccion, 'dirección')}.
            Contacto: {dato(RESPONSABLE.correo, 'correo de contacto')}.
          </p>
        </Seccion>

        <Seccion titulo="Qué datos tratamos">
          <p>Datos de la cuenta: nombre, correo electrónico, contraseña cifrada y rol dentro de la empresa.</p>
          <p>Datos que la empresa registra: obras, presupuestos, clientes, proveedores, facturas, documentos y fotos de obra.</p>
          <p>Datos de trabajadores que la empresa registra: identificación, cargo, horas trabajadas, remuneraciones e información previsional.</p>
          <p>Si la empresa usa el Filtro DS27, datos de las familias que postulan a subsidios: identificación, contacto, tramo del Registro Social de Hogares, integrantes, discapacidad, condición de víctima de prisión política y datos de la vivienda.</p>
          <p>La app usa la cámara y las fotos del teléfono solo cuando la persona decide adjuntar una imagen.</p>
        </Seccion>

        <Seccion titulo="Para qué los usamos">
          <p>Para prestar el servicio: gestionar obras, calcular costos y remuneraciones, emitir informes y dar acceso según el rol de cada persona. No vendemos datos ni los usamos para publicidad.</p>
        </Seccion>

        <Seccion titulo="Con quién los compartimos">
          <p>Con los proveedores que operan el servicio: Supabase (base de datos, autenticación y archivos) y Vercel (publicación de la aplicación). Si la empresa usa el Copiloto de obra, el texto que escribe se envía a un proveedor de inteligencia artificial para generar la respuesta.</p>
          <p>Cuando la empresa comparte un link del portal de cliente, quien tenga ese link puede ver el avance, los estados de pago y los datos bancarios publicados en él, e informar un pago. De ese aviso guardamos quién pagó, el monto, la fecha, la referencia y el comentario.</p>
        </Seccion>

        <Seccion titulo="Datos guardados en el teléfono">
          <p>Para funcionar sin señal, la app guarda en el teléfono una copia de obras, partidas, nombres de trabajadores y partes diarios, además de lo que aún no se envía. La copia se borra al cerrar sesión; lo que aún no se envía se conserva hasta enviarlo o descartarlo.</p>
        </Seccion>

        <Seccion titulo="Cuánto tiempo los conservamos">
          <p>Mientras la cuenta esté activa, y luego durante el tiempo que exijan las obligaciones legales, tributarias o laborales aplicables.</p>
        </Seccion>

        <Seccion titulo="Tus derechos y cómo eliminar tu cuenta">
          <p>
            Para acceder a tus datos, corregirlos, oponerte a su uso o pedir la eliminación de tu cuenta y sus datos, escribe a {dato(RESPONSABLE.correo, 'correo de contacto')}.
            Podemos conservar lo que la ley nos obligue a mantener, e informaremos cuándo se aplica.
          </p>
        </Seccion>

        <Seccion titulo="Cambios">
          <p>Si esta política cambia, publicaremos la nueva versión en esta página con su fecha de vigencia.</p>
        </Seccion>

        <p className="text-[13px] mt-2"><Link href="/auth/login" className="font-semibold text-brand hover:underline">Volver a Cubica Manager</Link></p>
      </div>
    </main>
  )
}
