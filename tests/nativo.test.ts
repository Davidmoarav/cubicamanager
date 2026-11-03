// tests/nativo.test.ts
// Un nombre de documento o de obra no puede romper la ruta del archivo en el teléfono.
import { describe, it, expect } from 'vitest'
import { esNativo, nombreDeArchivo } from '../lib/nativo'

describe('nombre de archivo', () => {
  it('quita lo que no puede ir en una ruta', () => {
    expect(nombreDeArchivo('Obra/Norte: etapa "1"?.pdf')).toBe('Obra_Norte_ etapa _1__.pdf')
    expect(nombreDeArchivo('..\\secreto.pdf')).toBe('.._secreto.pdf')
  })
  it('conserva tildes y espacios', () => {
    expect(nombreDeArchivo('Cotización Ñuñoa.pdf')).toBe('Cotización Ñuñoa.pdf')
  })
  it('nunca queda vacío', () => {
    expect(nombreDeArchivo('   ')).toBe('archivo')
  })
})

describe('plataforma', () => {
  it('fuera de la app nativa se comporta como web', () => {
    expect(esNativo()).toBe(false)
  })
})
