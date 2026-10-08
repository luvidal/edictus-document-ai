import { describe, it, expect } from 'vitest'
import { hydrateState } from '../src/helpers/hydrate'
import type { DeudaRow, InversionRow, SituacionData } from '../src/types'

const savedDeuda: DeudaRow = {
  id: 'dc_0',
  institucion: 'Banco Estado',
  tipo_deuda: 'Consumo',
  saldo_deuda_uf: 34.45,
  saldo_deuda_pesos: 1_371_174,
  monto_cuota: 68_559,
  cuota_estimated: true,
  castigo_pct: 0.05,
  cuotas_pagadas: null,
  cuotas_total: null,
  sourceFileId: 'cmf-file-id',
  cuota_source_file_id: '__respaldos__',
}

const baseLazy: Partial<SituacionData> = {
  situacion: { deudas: [savedDeuda] },
  // Peripheral fields all undefined — this is what compute returns in lazy mode.
  informe_deuda: undefined,
  padron_vehiculos: undefined,
  avaluo_fiscales: undefined,
  inversiones_files: undefined,
  balance_files: undefined,
}

describe('hydrateState — lazy fetch', () => {
  it('preserves saved deudas instead of nuking them when informe_deuda is not loaded', () => {
    const state = hydrateState(baseLazy as SituacionData, 39_800)
    expect(state.deudas).toHaveLength(1)
    expect(state.deudas[0].institucion).toBe('Banco Estado')
    // Critical: no save payload for deudas — otherwise the auto-save would
    // PATCH `deudas: []` to the DB before the second hydrate (post sections
    // fetch) can rebuild from CMF.
    expect(state.savePayload?.deudas).toBeUndefined()
  })

  it('preserves saved vehiculos/inversiones/balances/propiedades in lazy mode', () => {
    const state = hydrateState(baseLazy as SituacionData, 39_800)
    expect(state.savePayload?.vehiculos).toBeUndefined()
    expect(state.savePayload?.inversiones).toBeUndefined()
    expect(state.savePayload?.balances).toBeUndefined()
    expect(state.savePayload?.propiedades).toBeUndefined()
  })
})

/**
 * Characterization: refetch-after-unlink drops the corresponding rows.
 *
 * When an analyst unlinks a CMF (informe_deuda) file, the next refetch returns
 * an empty `entries: []`. Because CMF is the sole row authority for deudas,
 * `mergeDeudasRows` must collapse the saved rows to `[]` so the UI matches the
 * empty server state.
 *
 * For the other asset tables (inversiones, vehiculos, propiedades, balances),
 * the unlink rule is "drop saved rows whose `sourceFileId` is no longer in the
 * fresh file list" — covered by `pruneAndMergeBySource`.
 */
describe('hydrateState — file unlink drops corresponding rows', () => {
  it('drops saved deudas when CMF is unlinked (fresh entries empty)', () => {
    const result: Partial<SituacionData> = {
      situacion: {
        deudas: [{
          id: 'dc_0',
          institucion: 'Banco Estado',
          tipo_deuda: 'Consumo',
          saldo_deuda_uf: 34.45,
          saldo_deuda_pesos: 1_371_174,
          monto_cuota: 68_559,
          cuota_estimated: true,
          castigo_pct: 0.05,
          cuotas_pagadas: null,
          cuotas_total: null,
          sourceFileId: 'cmf-old-file',
        } as DeudaRow],
      },
      // CMF unlinked → informe_deuda is null/empty entries
      informe_deuda: null,
      padron_vehiculos: [],
      avaluo_fiscales: [],
      inversiones_files: [],
      balance_files: [],
      socios_entries: [],
    }
    const state = hydrateState(result as SituacionData, 39_800)
    // CMF is sole row authority — fresh empty ⇒ result empty.
    expect(state.deudas).toEqual([])
    // The merge must mark this as a save target so the autosave clears the DB.
    expect(state.savePayload?.deudas).toEqual([])
  })

  it('drops saved inversiones whose sourceFileId is no longer linked', () => {
    const savedInversion: InversionRow = {
      id: 'inv_0',
      institucion: 'Banco Falabella',
      tipo: 'Deposito a Plazo',
      monto: 5_000_000,
      fecha: '2025-08-01',
      sourceFileId: 'inv-file-OLD',
    } as InversionRow

    const result: Partial<SituacionData> = {
      situacion: { inversiones: [savedInversion] },
      // Full mode (not lazy) — every peripheral field present.
      informe_deuda: null,
      padron_vehiculos: [],
      avaluo_fiscales: [],
      inversiones_files: [], // file unlinked
      balance_files: [],
      socios_entries: [],
    }

    const state = hydrateState(result as SituacionData, 39_800)
    expect(state.inversiones).toEqual([])
    expect(state.savePayload?.inversiones).toEqual([])
  })

  it('keeps analyst-added rows (no sourceFileId) when their files would otherwise be unlinked', () => {
    // Manual rows with no sourceFileId are analyst-added — they survive a
    // file-unlink refetch because they were never tied to a file.
    const manual: InversionRow = {
      id: 'inv_manual',
      institucion: 'Cuenta Externa',
      tipo: 'Cuenta Corriente',
      monto: 1_000_000,
      fecha: '',
    } as InversionRow

    const result: Partial<SituacionData> = {
      situacion: { inversiones: [manual] },
      informe_deuda: null,
      padron_vehiculos: [],
      avaluo_fiscales: [],
      inversiones_files: [],
      balance_files: [],
      socios_entries: [],
    }

    const state = hydrateState(result as SituacionData, 39_800)
    expect(state.inversiones).toHaveLength(1)
    expect(state.inversiones[0].id).toBe('inv_manual')
  })
})

describe('hydrateState — full fetch', () => {
  it('runs the deudas merge once informe_deuda is loaded (CMF rebuilds rows)', () => {
    const fullResult: Partial<SituacionData> = {
      situacion: { deudas: [] },
      informe_deuda: {
        fileId: 'cmf-file-id',
        rut: '11.111.111-1',
        nombre: 'X',
        deuda_total: 1_371_174,
        fecha_informe: '2026-02-17',
        entries: [{
          id: 'deuda_0',
          entidad: 'Banco Estado',
          tipo: 'Consumo',
          deuda_total: 1_371_174,
          vigente: 1_371_174,
          sourceFileId: 'cmf-file-id',
        }],
      },
      padron_vehiculos: [],
      avaluo_fiscales: [],
      inversiones_files: [],
      balance_files: [],
      socios_entries: [],
    }
    const state = hydrateState(fullResult as SituacionData, 39_800)
    expect(state.deudas).toHaveLength(1)
    expect(state.deudas[0].institucion).toBe('Banco Estado')
  })
})

describe('hydrateState — per-company report-default overlay (rides in the payload)', () => {
  const withPolicy = (policy: Partial<SituacionData>): Partial<SituacionData> => ({
    situacion: { deudas: [], propiedades: [] },
    informe_deuda: {
      fileId: 'f', rut: '1-9', nombre: 'X', deuda_total: 1_000_000, fecha_informe: '2026-02-17',
      entries: [{ id: 'd0', entidad: 'Banco Estado', tipo: 'Consumo', deuda_total: 1_000_000, vigente: 1_000_000, sourceFileId: 'f' }],
    },
    avaluo_fiscales: [{ direccion: 'Calle 1', comuna: 'Ñuñoa', valor_pesos: 10_000_000 } as unknown as NonNullable<SituacionData['avaluo_fiscales']>[number]],
    padron_vehiculos: [], inversiones_files: [], balance_files: [], socios_entries: [],
    ...policy,
  })

  it('stamps company factor_avaluo + castigo from the payload into propiedades and estimated deudas', () => {
    const state = hydrateState(withPolicy({ factor_avaluo: 3, castigo_lineas_tc: 0.10 }) as SituacionData, 39_800)
    expect(state.propiedades[0].factor_avaluo).toBe(3)
    expect(state.propiedades[0].valor_pesos).toBe(30_000_000) // 10M × 3
    expect(state.deudas[0].castigo_pct).toBe(0.10)
    expect(state.deudas[0].monto_cuota).toBe(100_000) // 1M × 0.10
  })

  it('falls back to the historical globals (2 / 0.05) when the payload omits policy', () => {
    const state = hydrateState(withPolicy({}) as SituacionData, 39_800)
    expect(state.propiedades[0].valor_pesos).toBe(20_000_000) // 10M × 2
    expect(state.deudas[0].monto_cuota).toBe(50_000) // 1M × 0.05
  })
})

describe('hydrateState — UF fallback when client UF is null', () => {
  const fullResultWithCmf = (uf?: number): Partial<SituacionData> => ({
    situacion: { deudas: [] },
    ...(uf != null ? { uf } : {}),
    informe_deuda: {
      fileId: 'cmf-file-id', rut: '11.111.111-1', nombre: 'X',
      deuda_total: 1_371_174, fecha_informe: '2026-02-17',
      entries: [{
        id: 'deuda_0', entidad: 'Banco Estado', tipo: 'Consumo',
        deuda_total: 1_371_174, vigente: 1_371_174, sourceFileId: 'cmf-file-id',
      }],
    },
    padron_vehiculos: [], avaluo_fiscales: [], inversiones_files: [],
    balance_files: [], socios_entries: [],
  })

  it('seeds saldo_deuda_uf from server result.uf when the client ufValue is still null', () => {
    // useUFValue(ufDate) is null until its async fetch resolves and the titular
    // hydrate does not re-run when it lands; the server already ships uf.
    const state = hydrateState(fullResultWithCmf(39_800) as SituacionData, null)
    expect(state.deudas).toHaveLength(1)
    expect(state.deudas[0].saldo_deuda_uf).toBeCloseTo(34.45, 2)
  })

  it('prefers the client ufValue over result.uf when both are present', () => {
    // Server uf=1 (wrong), client uf=39_800 (right) → client wins.
    const state = hydrateState(fullResultWithCmf(1) as SituacionData, 39_800)
    expect(state.deudas[0].saldo_deuda_uf).toBeCloseTo(34.45, 2)
  })

  it('blanks UF only when both client ufValue and server result.uf are absent', () => {
    const state = hydrateState(fullResultWithCmf(undefined) as SituacionData, null)
    expect(state.deudas[0].saldo_deuda_uf).toBeNull()
  })
})
