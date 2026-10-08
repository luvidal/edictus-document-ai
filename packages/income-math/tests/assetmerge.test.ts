/**
 * Tests for inversiones pre-population pipeline:
 * - buildInversionesRows: converts InversionPrePopRow[] → InversionRow[]
 * - mergeInversiones: merges saved analyst edits with fresh file data
 */

import { describe, it, expect } from 'vitest'
import { buildInversionesRows, mergeInversiones } from '../src/helpers/assetmerge'
import type { InversionPrePopRow } from '../src/dtos'
import type { InversionRow } from '../src/rowtypes'

// ── Fixtures shaped like DAP (time-deposit) documents ──

const santanderPrePop: InversionPrePopRow = {
  id: 'inv_0',
  institucion: 'Santander',
  tipo: 'Fijo',
  monto: 10250000,
  fecha: '03/03/2026',
  sourceFileId: 'file_santander',
}

const scotiaDep1: InversionPrePopRow = {
  id: 'inv_1',
  institucion: 'Scotiabank',
  tipo: 'DAP',
  monto: 15400000,
  fecha: '02/03/2026',
  sourceFileId: 'file_scotia',
}

const scotiaDep2: InversionPrePopRow = {
  id: 'inv_2',
  institucion: 'Scotiabank',
  tipo: 'DAP',
  monto: 31800000,
  fecha: '23/02/2026',
  sourceFileId: 'file_scotia',
}

describe('buildInversionesRows', () => {
  it('converts pre-pop rows to InversionRow[]', () => {
    const rows = buildInversionesRows([santanderPrePop, scotiaDep1, scotiaDep2])
    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      id: 'inv_0',
      institucion: 'Santander',
      tipo: 'Fijo',
      monto: 10250000,
      fecha: '03/03/2026',
      sourceFileId: 'file_santander',
    })
    expect(rows[1].institucion).toBe('Scotiabank')
    expect(rows[2].monto).toBe(31800000)
  })

  it('returns empty array for empty input', () => {
    expect(buildInversionesRows([])).toEqual([])
  })
})

describe('mergeInversiones', () => {
  const freshRows: InversionRow[] = [
    { id: 'inv_0', institucion: 'Santander', tipo: 'Fijo', monto: 10250000, fecha: '03/03/2026', sourceFileId: 'file_santander' },
    { id: 'inv_1', institucion: 'Scotiabank', tipo: 'DAP', monto: 15400000, fecha: '02/03/2026', sourceFileId: 'file_scotia' },
  ]

  it('returns fresh rows when no saved data', () => {
    const result = mergeInversiones([], freshRows)
    expect(result.rows).toEqual(freshRows)
    expect(result.changed).toBe(true)
  })

  it('returns saved rows when no fresh data', () => {
    const saved: InversionRow[] = [
      { id: 'inv_0', institucion: 'Santander', tipo: 'Fijo', monto: 10250000, fecha: '03/03/2026' },
    ]
    const result = mergeInversiones(saved, [])
    expect(result.rows).toEqual(saved)
    expect(result.changed).toBe(false)
  })

  it('prefers saved row (analyst edits) when sourceFileId matches fresh', () => {
    const saved: InversionRow[] = [
      { id: 'saved_0', institucion: 'Santander', tipo: 'Fijo', monto: 99999999, fecha: '03/03/2026', sourceFileId: 'file_santander' },
    ]
    const result = mergeInversiones(saved, freshRows)
    expect(result.rows).toHaveLength(2)
    // Saved Santander row wins (analyst-edited monto preserved)
    expect(result.rows[0].id).toBe('saved_0')
    expect(result.rows[0].monto).toBe(99999999)
    // Fresh Scotia row appended
    expect(result.rows[1].institucion).toBe('Scotiabank')
    expect(result.changed).toBe(true)
  })

  it('stamps sourceFileId onto legacy saved rows via content key (migration path)', () => {
    // Saved rows from before the sourceFileId stamp — match by institucion+tipo+monto
    const saved: InversionRow[] = [
      { id: 'saved_0', institucion: 'Santander', tipo: 'Fijo', monto: 10250000, fecha: '03/03/2026' },
      { id: 'saved_1', institucion: 'Scotiabank', tipo: 'DAP', monto: 15400000, fecha: '02/03/2026' },
    ]
    const result = mergeInversiones(saved, freshRows)
    expect(result.rows).toHaveLength(2)
    // Saved content preserved but now carries sourceFileId from fresh
    expect(result.rows[0].sourceFileId).toBe('file_santander')
    expect(result.rows[1].sourceFileId).toBe('file_scotia')
    // changed=true because sourceFileId is new
    expect(result.changed).toBe(true)
  })

  it('handles both empty', () => {
    const result = mergeInversiones([], [])
    expect(result.rows).toEqual([])
    expect(result.changed).toBe(false)
  })

  it('preserves analyst-added rows not in fresh data', () => {
    const saved: InversionRow[] = [
      { id: 'manual_0', institucion: 'BCI', tipo: 'Fondo Mutuo', monto: 5000000, fecha: '' },
    ]
    const result = mergeInversiones(saved, freshRows)
    expect(result.rows).toHaveLength(3)
    // Fresh rows come first, analyst-added rows appended
    expect(result.rows[0].institucion).toBe('Santander')
    expect(result.rows[1].institucion).toBe('Scotiabank')
    expect(result.rows[2].institucion).toBe('BCI') // analyst-added row preserved
    expect(result.changed).toBe(true)
  })

  it('drops a saved row whose sourceFileId is no longer in fresh', () => {
    // A Scotia row saved from a previous upload whose file has since been unlinked.
    const saved: InversionRow[] = [
      { id: 'saved_0', institucion: 'Santander', tipo: 'Fijo', monto: 10250000, fecha: '03/03/2026', sourceFileId: 'file_santander' },
      { id: 'saved_1', institucion: 'Scotiabank', tipo: 'DAP', monto: 15400000, fecha: '02/03/2026', sourceFileId: 'file_scotia_old' },
    ]
    const onlySantander: InversionRow[] = [freshRows[0]]
    const result = mergeInversiones(saved, onlySantander)
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].institucion).toBe('Santander')
    expect(result.changed).toBe(true)
  })

  it('preserves analyst edits across multiple rows sharing one sourceFileId', () => {
    // One DAP file produces 3 depositos (same sourceFileId). Analyst edits the
    // middle row's monto. On next hydrate, positional bucket match preserves
    // every saved row — including the edited one — without collapsing them.
    const fileId = 'file_scotia'
    const saved: InversionRow[] = [
      { id: 'saved_0', institucion: 'Scotiabank', tipo: 'DAP', monto: 15400000, fecha: '02/03/2026', sourceFileId: fileId },
      { id: 'saved_1', institucion: 'Scotiabank', tipo: 'DAP', monto: 99999999, fecha: '23/02/2026', sourceFileId: fileId }, // analyst-edited
      { id: 'saved_2', institucion: 'Scotiabank', tipo: 'DAP', monto: 42000000, fecha: '10/02/2026', sourceFileId: fileId },
    ]
    const fresh: InversionRow[] = [
      { id: 'inv_0', institucion: 'Scotiabank', tipo: 'DAP', monto: 15400000, fecha: '02/03/2026', sourceFileId: fileId },
      { id: 'inv_1', institucion: 'Scotiabank', tipo: 'DAP', monto: 31800000, fecha: '23/02/2026', sourceFileId: fileId },
      { id: 'inv_2', institucion: 'Scotiabank', tipo: 'DAP', monto: 42000000, fecha: '10/02/2026', sourceFileId: fileId },
    ]
    const result = mergeInversiones(saved, fresh)
    expect(result.rows).toHaveLength(3)
    expect(result.rows[0].id).toBe('saved_0')
    expect(result.rows[1].id).toBe('saved_1')
    expect(result.rows[1].monto).toBe(99999999) // analyst edit preserved
    expect(result.rows[2].id).toBe('saved_2')
  })
})
