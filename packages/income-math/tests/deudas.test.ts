import { describe, it, expect } from 'vitest'
import { buildDeudasRows, mergeDeudasRows } from '../src/helpers/merge/deudas'
import type { DeudaRow, SituacionData } from '../src/types'
import type { DeudaFileEntry } from '../src/dtos'

const makeRow = (overrides: Partial<DeudaRow> = {}): DeudaRow => ({
  id: 'dc_0',
  institucion: 'Santander',
  tipo_deuda: 'Consumo',
  saldo_deuda_uf: 100,
  saldo_deuda_pesos: 3_000_000,
  monto_cuota: 60_000,
  cuota_estimated: true,
  castigo_pct: 0.05,
  cuotas_pagadas: null,
  cuotas_total: null,
  ...overrides,
})

describe('mergeDeudasRows', () => {
  it('drops file-derived saved rows (with sourceFileId) when fresh is empty — CMF is authority for those', () => {
    const saved = [makeRow({ id: 'dc_0', monto_cuota: 99_000, sourceFileId: 'cmf-1' })]
    expect(mergeDeudasRows(saved, [])).toEqual([])
  })

  it('preserves analyst-added rows (no sourceFileId) when fresh is empty', () => {
    const manual = makeRow({ id: 'dc_0', institucion: 'Banco Manual', monto_cuota: 99_000 })
    expect(mergeDeudasRows([manual], [])).toEqual([manual])
  })

  it('keeps an analyst-added row alongside CMF rows when fresh is non-empty', () => {
    const cmf = makeRow({ id: 'dc_0', institucion: 'Santander', tipo_deuda: 'Consumo', sourceFileId: 'cmf-1' })
    const manual = makeRow({ id: 'dc_9', institucion: 'Banco Manual', tipo_deuda: 'Otro', sourceFileId: undefined })
    const result = mergeDeudasRows([cmf, manual], [cmf])
    expect(result).toHaveLength(2)
    expect(result.map(r => r.institucion)).toEqual(['Santander', 'Banco Manual'])
  })

  it('returns fresh when saved is empty', () => {
    const fresh = [makeRow()]
    expect(mergeDeudasRows([], fresh)).toEqual(fresh)
  })

  it('preserves analyst cuota override across hydrate', () => {
    const saved = [makeRow({ monto_cuota: 75_000, cuota_estimated: false })]
    const fresh = [makeRow({ monto_cuota: 60_000, cuota_estimated: true })]
    const result = mergeDeudasRows(saved, fresh)
    expect(result[0].monto_cuota).toBe(75_000)
    expect(result[0].cuota_estimated).toBe(false)
  })

  it('drops file-derived saved row whose (entidad, tipo) no longer appears in fresh', () => {
    const saved = [
      makeRow({ id: 'dc_0', institucion: 'Santander', tipo_deuda: 'Consumo', sourceFileId: 'cmf-1' }),
      makeRow({ id: 'dc_1', institucion: 'BCI', tipo_deuda: 'Hipotecaria', sourceFileId: 'cmf-1' }),
    ]
    const fresh = [makeRow({ id: 'dc_0', institucion: 'Santander', tipo_deuda: 'Consumo', sourceFileId: 'cmf-1' })]
    const result = mergeDeudasRows(saved, fresh)
    expect(result).toHaveLength(1)
    expect(result[0].institucion).toBe('Santander')
  })
})

const makeBankFile = (overrides: Partial<DeudaFileEntry> = {}): DeudaFileEntry => ({
  id: 'df_0',
  entidad: 'Santander',
  saldo: 5_000_000,
  cuota: 80_000,
  cuotas_pagadas: 10,
  cuotas_totales: 60,
  sourceFileId: 'file-1',
  tipoDeuda: 'consumo',
  moneda: 'CLP',
  ...overrides,
})

const makeSituacion = (overrides: Partial<SituacionData> = {}): SituacionData => ({
  rows: [],
  boletaRows: [],
  vehiculos: [],
  inversiones: [],
  propiedades: [],
  balances: [],
  deudas: [],
  informe_deuda: null,
  deuda_files: null,
  ...overrides,
} as unknown as SituacionData)

describe('buildDeudasRows', () => {
  it('returns [] when both CMF and bank docs are empty', () => {
    expect(buildDeudasRows(makeSituacion(), null)).toEqual([])
  })

  it('falls back to bank docs as rows when CMF is empty — empty data must not swallow real data', () => {
    const data = makeSituacion({
      informe_deuda: { entries: [] } as unknown as SituacionData['informe_deuda'],
      deuda_files: [
        makeBankFile({ id: 'df_0', entidad: 'Santander', tipoDeuda: 'hipotecario', moneda: 'UF', saldo: 4643.85, cuota: 28.9, sourceFileId: 'hipo-1' }),
        makeBankFile({ id: 'df_1', entidad: 'Itaú', tipoDeuda: 'consumo', saldo: 8_239_453, cuota: 1_410_503, sourceFileId: 'cons-1' }),
      ],
    })
    const rows = buildDeudasRows(data, 39_000)
    expect(rows).toHaveLength(2)
    expect(rows[0].institucion).toBe('Santander')
    expect(rows[0].tipo_deuda).toBe('Hipotecaria')
    expect(rows[0].saldo_deuda_pesos).toBe(Math.round(4643.85 * 39_000))
    expect(rows[0].monto_cuota).toBe(Math.round(28.9 * 39_000))
    expect(rows[0].cuota_estimated).toBe(false)
    expect(rows[0].cuota_source_file_id).toBe('hipo-1')
    expect(rows[1].institucion).toBe('Itaú')
    expect(rows[1].tipo_deuda).toBe('Consumo')
    expect(rows[1].monto_cuota).toBe(1_410_503)
  })

  it('falls back to bank docs even when bank cuota is missing — estimates from saldo × castigo', () => {
    const data = makeSituacion({
      informe_deuda: { entries: [] } as unknown as SituacionData['informe_deuda'],
      deuda_files: [makeBankFile({ cuota: null, saldo: 2_000_000 })],
    })
    const rows = buildDeudasRows(data, null)
    expect(rows).toHaveLength(1)
    expect(rows[0].cuota_estimated).toBe(true)
    expect(rows[0].monto_cuota).toBe(100_000)
    expect(rows[0].castigo_pct).toBe(0.05)
  })

  it('keeps CMF as row authority when CMF has entries — bank docs only enrich', () => {
    const data = makeSituacion({
      informe_deuda: {
        entries: [{ entidad: 'Santander', tipo: 'Consumo', vigente: 5_000_000, sourceFileId: 'cmf-1' }],
      } as unknown as SituacionData['informe_deuda'],
      deuda_files: [makeBankFile({ entidad: 'Itaú', tipoDeuda: 'consumo' })],
    })
    const rows = buildDeudasRows(data, null)
    expect(rows).toHaveLength(1)
    expect(rows[0].institucion).toBe('Santander')
    expect(rows[0].cuota_source_file_id).toBe('__respaldos__')
  })

  it('applies the passed castigo to estimated CMF rows (per-company overlay), not a hardcoded 0.05', () => {
    const data = makeSituacion({
      informe_deuda: {
        entries: [{ entidad: 'Santander', tipo: 'Consumo', vigente: 5_000_000, sourceFileId: 'cmf-1' }],
      } as unknown as SituacionData['informe_deuda'],
      deuda_files: [],
    })
    const rows = buildDeudasRows(data, null, 0.10)
    expect(rows[0].cuota_estimated).toBe(true)
    expect(rows[0].castigo_pct).toBe(0.10)
    expect(rows[0].monto_cuota).toBe(500_000) // 5_000_000 × 0.10, not × 0.05
  })
})
