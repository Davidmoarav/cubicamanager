// lib/nav.ts
// Menú de navegación compartido por la barra superior (AppTopNav) y el
// drawer móvil (Sidebar). Fuente única de verdad para no duplicar items ni roles.

export interface NavItem {
  href: string
  label: string
  icon: string
  section: string
  modulo?: string
}

export const MENU: NavItem[] = [
  { href: '/dashboard',         label: 'Dashboard',         icon: '⊞', section: 'Principal' },

  { href: '/cotizaciones',      label: 'Cotizaciones',      icon: '◐', section: 'Comercial' },
  { href: '/clientes',          label: 'Clientes',          icon: '◍', section: 'Comercial' },

  { href: '/proyectos',         label: 'Obras',             icon: '◧', section: 'Obra' },
  { href: '/terreno',           label: 'Terreno',           icon: '📍', section: 'Obra' },
  { href: '/catalogo-partidas', label: 'Catálogo partidas', icon: '📋', section: 'Obra' },
  { href: '/ordenes-compra',    label: 'Órdenes de compra', icon: '🛒', section: 'Obra' },
  { href: '/proveedores',       label: 'Proveedores',       icon: '◦', section: 'Obra' },

  { href: '/finanzas',          label: 'Finanzas',          icon: '◈', section: 'Finanzas' },
  { href: '/facturacion',       label: 'Facturación',       icon: '◻', section: 'Finanzas' },
  { href: '/reportes',          label: 'Reportes por obra', icon: '📊', section: 'Finanzas' },

  { href: '/rrhh',              label: 'RRHH',              icon: '◉', section: 'Personal' },
  { href: '/remuneraciones',    label: 'Remuneraciones',    icon: '💰', section: 'Personal' },

  { href: '/filtro',            label: 'Filtro DS27',       icon: '▤', section: 'Postulaciones' },

  { href: '/contratos',         label: 'Contratos',         icon: '◫', section: 'Admin' },
  { href: '/usuarios',          label: 'Usuarios y roles',  icon: '👥', section: 'Admin', modulo: 'usuarios' },
  { href: '/auditoria',         label: 'Bitácora',          icon: '🕐', section: 'Admin', modulo: 'auditoria' },
  { href: '/configuracion',     label: 'Configuración',     icon: '⚙', section: 'Admin' },
]

// Qué roles ven cada módulo restringido. El permiso REAL se aplica en el
// servidor (lib/roles.ts); esto solo evita mostrar lo que no corresponde.
export const ACCESO: Record<string, string[]> = {
  '/proyectos':      ['admin', 'jefe_obra'],
  '/terreno':        ['admin', 'jefe_obra'],
  '/reportes':       ['admin', 'contador'],
  '/facturacion':    ['admin', 'contador'],
  '/finanzas':       ['admin', 'contador'],
  '/remuneraciones': ['admin', 'contador'],
  '/rrhh':           ['admin', 'contador'],
  '/usuarios':       ['admin'],
  '/auditoria':      ['admin'],
  '/filtro':         ['admin', 'jefe_obra'],   // datos sensibles de postulantes (RSH, salud)
}

// Rutas cuyos datos el servidor niega por rol: sin permiso se ven vacías, no bloqueadas.
// Proyectos y Terreno no están: el contador las ve en solo lectura.
const RUTAS_PROTEGIDAS = ['/reportes', '/facturacion', '/finanzas', '/remuneraciones', '/rrhh', '/usuarios', '/auditoria', '/filtro']

const protegidaDe = (pathname: string) =>
  RUTAS_PROTEGIDAS.find(r => pathname === r || pathname.startsWith(`${r}/`))

export const rutaProtegida = (pathname: string) => !!protegidaDe(pathname)

export function rutaPermitida(pathname: string, rol: string): boolean {
  const ruta = protegidaDe(pathname)
  return !ruta || ACCESO[ruta].includes(rol)
}

// El contador ve estas pantallas, pero el servidor le rechaza los cambios
const SOLO_LECTURA_CONTADOR = ['/proyectos', '/obra', '/terreno', '/cotizaciones', '/clientes', '/catalogo-partidas', '/ordenes-compra', '/proveedores', '/contratos']

export function avisoSoloLectura(pathname: string, rol: string): string | null {
  const en = (r: string) => pathname === r || pathname.startsWith(`${r}/`)
  if (rol === 'contador' && SOLO_LECTURA_CONTADOR.some(en)) return 'Tu rol puede ver esta sección, pero no modificarla.'
  if (rol && rol !== 'admin' && en('/configuracion')) return 'Solo el administrador puede cambiar los datos de la empresa. Tu perfil sí puedes editarlo.'
  return null
}

export function menuPorRol(rol: string): NavItem[] {
  return MENU.filter(m => {
    const permitidos = ACCESO[m.href]
    return !permitidos || permitidos.includes(rol)
  })
}

export const SECCIONES = ['Principal', 'Comercial', 'Obra', 'Finanzas', 'Personal', 'Postulaciones', 'Admin']

export function etiquetaRol(rol?: string): string {
  return rol === 'admin' ? 'Administrador'
    : rol === 'contador' ? 'Contador'
    : rol === 'jefe_obra' ? 'Jefe de obra'
    : ''
}
