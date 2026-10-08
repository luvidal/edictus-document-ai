import { describe, it, expect } from 'vitest'
import { getDoctypesMap, getDoctype, getDoctypeIds, isRecurring, doctypesCatalog } from './index'
import { getMultiPartConfig, getMultiPartDocTypeIds } from './multipart/index'

describe('@edictus/doctypes catalog', () => {
  it('loads the bundled catalog directly — no configure() needed', () => {
    const map = getDoctypesMap()
    expect(getDoctypeIds().length).toBeGreaterThan(10)
    expect(map['cedula-identidad']).toBeTruthy()
  })

  it('expands fields and instructions for a doctype', () => {
    const dt = getDoctype('cedula-identidad')
    expect(dt?.freq).toBe('once')
    expect(dt?.parts).toEqual(['Frente', 'Revés'])
    expect(typeof dt?.instructions).toBe('string')
    expect(dt?.internalFields instanceof Set).toBe(true)
  })

  it('resolves multipart config (Frente/Revés → front/back)', () => {
    expect(getMultiPartConfig('cedula-identidad')?.parts.map(p => p.id)).toEqual(['front', 'back'])
    expect(getMultiPartDocTypeIds()).toContain('cedula-identidad')
  })

  it('exposes the raw catalog (classifier blocks intact) for satellite injection', () => {
    const raw = doctypesCatalog['cedula-identidad'] as any
    expect(raw.classifier).toBeTruthy()
    expect(Array.isArray(raw.classifier.useWhen)).toBe(true)
    expect(Array.isArray(raw.classifier.tieBreaker)).toBe(true)
  })

  it('isRecurring reflects freq', () => {
    expect(isRecurring('cedula-identidad')).toBe(false)
  })
})
