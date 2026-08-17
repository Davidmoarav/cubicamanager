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

  { href: '/proyectos',         label: 'Proyectos',         icon: '◧', section: 'Obra' },
  { href: '/catalogo-partidas', label: 'Catálogo partidas', icon: '📋', section: 'Obra' },
  { href: '/ordenes-compra',    label: 'Órdenes de compra', icon: '🛒', section: 'Obra' },
  { href: '/proveedores',       label: 'Proveedores',       icon: '◦', section: 'Obra' },

  { href: '/finanzas',          label: 'Finanzas',          icon: '◈', section: 'Finanzas' },
  { href: '/facturacion',       label: 'Facturación',       icon: '◻', section: 'Finanzas' },

  { href: '/rrhh',              label: 'RRHH',              icon: '◉', section: 'Personal' },
  { href: '/remuneraciones',    label: 'Remuneraciones',    icon: '💰', section: 'Personal' },

  { href: '/contratos',         label: 'Contratos',         icon: '◫', section: 'Admin' },
  { href: '/usuarios',          label: 'Usuarios y roles',  icon: '👥', section: 'Admin', modulo: 'usuarios' },
  { href: '/auditoria',         label: 'Bitácora',          icon: '🕐', section: 'Admin', modulo: 'auditoria' },
  { href: '/configuracion',     label: 'Configuración',     icon: '⚙', section: 'Admin' },
]

// Qué roles ven cada módulo restringido. El permiso REAL se aplica en el
// servidor (lib/roles.ts); esto solo evita mostrar lo que no corresponde.
export const ACCESO: Record<string, string[]> = {
  '/proyectos':      ['admin', 'jefe_obra'],
  '/facturacion':    ['admin', 'contador'],
  '/finanzas':       ['admin', 'contador'],
  '/remuneraciones': ['admin', 'contador'],
  '/rrhh':           ['admin', 'contador'],
  '/usuarios':       ['admin'],
  '/auditoria':      ['admin'],
}

export function menuPorRol(rol: string): NavItem[] {
  return MENU.filter(m => {
    const permitidos = ACCESO[m.href]
    return !permitidos || permitidos.includes(rol)
  })
}

export const SECCIONES = ['Principal', 'Comercial', 'Obra', 'Finanzas', 'Personal', 'Admin']

export function etiquetaRol(rol?: string): string {
  return rol === 'admin' ? 'Administrador'
    : rol === 'contador' ? 'Contador'
    : rol === 'jefe_obra' ? 'Jefe de obra'
    : ''
}
