import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta corporativa ObraManager
        ink:     '#1a2535',   // texto principal
        muted:   '#6b7a8d',   // texto secundario
        subtle:  '#a0aab8',   // texto terciario
        line:    '#e4e9f0',   // bordes
        line2:   '#d1d9e6',   // bordes más marcados
        canvas:  '#F6F4F1',   // fondo de página (cálido, estilo ObraMaestra)
        brand: {
          DEFAULT: '#E5502A', // coral principal (antes azul #1e6bb8)
          dark:    '#C24019',
          bg:      '#FCEAE3',
        },
        success: { DEFAULT: '#1a7a4a', bg: '#e6f4ed' },
        warning: { DEFAULT: '#b07d1a', bg: '#fef3d7' },
        danger:  { DEFAULT: '#b0401a', bg: '#fdecea' },
        accent:  { DEFAULT: '#534ab7', bg: '#eeedfe' },  // morado (catálogo/EP)
        // Tema "Obra" estilo ObraMaestra (módulo /obra)
        om: {
          DEFAULT: '#E5502A',   // coral principal
          dark:    '#C24019',   // hover / activo
          bg:      '#FCEAE3',   // fondos suaves coral
          ink:     '#131C2B',   // nav superior oscuro
          navline: '#243044',   // bordes sobre nav oscuro
          canvas:  '#F6F4F1',   // fondo cálido de página
        },
      },
      borderRadius: {
        card: '12px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
        pop:  '0 8px 32px rgba(0,0,0,0.18)',
        bar:  '0 -4px 24px rgba(0,0,0,0.10), 0 2px 8px rgba(0,0,0,0.06)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Segoe UI', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
