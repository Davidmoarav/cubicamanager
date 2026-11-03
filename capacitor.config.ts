// capacitor.config.ts
// La app de iOS y Android abre el sitio publicado: un despliegue la actualiza sin pasar
// por las tiendas. Cambiar este archivo o los plugins nativos sí exige publicar una versión.
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'cl.casadeleifs.cubica',
  appName: 'Cubica Manager',
  webDir: 'capacitor-www',
  server: {
    url: 'https://cubica.casadeleifs.cl',
    appStartPath: '/terreno',
    errorPath: 'sin-conexion.html',
  },
  ios: {
    contentInset: 'always',
    // Sin dominios propios declarados (WKAppBoundDomains en Info.plist), iOS no activa el
    // service worker dentro de la app y Terreno no abre sin señal
    limitsNavigationsToAppBoundDomains: true,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SystemBars: { insetsHandling: 'native' },
  },
}

export default config
