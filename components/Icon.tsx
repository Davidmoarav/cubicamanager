// components/Icon.tsx — Íconos SVG monocromos (heredan color/tamaño del padre).
// Reemplazan a los emojis. Uso: <IconEdit className="w-4 h-4" />
import React from 'react'

type P = { className?: string }
const base = (className = 'w-4 h-4') => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
})

export const IconMenu = ({ className }: P) => (
  <svg {...base(className)}><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
)
export const IconEdit = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
)
export const IconTrash = ({ className }: P) => (
  <svg {...base(className)}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
)
export const IconEye = ({ className }: P) => (
  <svg {...base(className)}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>
)
export const IconSearch = ({ className }: P) => (
  <svg {...base(className)}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
)
export const IconMic = ({ className }: P) => (
  <svg {...base(className)}><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>
)
export const IconSend = ({ className }: P) => (
  <svg {...base(className)}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
)
export const IconCamera = ({ className }: P) => (
  <svg {...base(className)}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z"/><circle cx="12" cy="13" r="4"/></svg>
)
export const IconPaperclip = ({ className }: P) => (
  <svg {...base(className)}><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
)
export const IconPlus = ({ className }: P) => (
  <svg {...base(className)}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
)
export const IconStop = ({ className }: P) => (
  <svg {...base(className)}><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
)
