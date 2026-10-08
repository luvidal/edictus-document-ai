/**
 * Pure-function tests for the Políticas de Crédito builder. No DB, no React.
 */

import { describe, it, expect } from 'vitest'
import type { SummaryRow } from '@edictus/tables'
import type { InvestorCaps } from '../src/investortypes'
import { buildPoliticas } from '../src/buildpoliticas'

function inv(over: Partial<InvestorCaps>): InvestorCaps {
  return {
    id: over.id ?? 'inv-' + over.name,
    name: over.name ?? 'Anon',
    max_dividendo_renta: over.max_dividendo_renta ?? null,
    max_carga_financiera: over.max_carga_financiera ?? null,
    max_deuda_precio_venta: over.max_deuda_precio_venta ?? null,
    max_edad_plazo: over.max_edad_plazo ?? null,
  }
}

function indicadores(over: Partial<Record<'div_renta' | 'carga_financiera' | 'deuda_precio_venta', [number | null, number | null]>>): SummaryRow[] {
  const rows: SummaryRow[] = []
  if (over.div_renta) rows.push({ label: 'Div', values: over.div_renta as number[], type: 'data', fieldKey: 'div_renta', format: 'percent' })
  if (over.carga_financiera) rows.push({ label: 'CF', values: over.carga_financiera as number[], type: 'data', fieldKey: 'carga_financiera', format: 'percent' })
  if (over.deuda_precio_venta) rows.push({ label: 'D/P', values: over.deuda_precio_venta as number[], type: 'data', fieldKey: 'deuda_precio_venta', format: 'percent' })
  return rows
}

describe('buildPoliticas', () => {
  it('marks a fully-passing investor as compliant', () => {
    const rows = buildPoliticas(
      [inv({ name: 'A', max_dividendo_renta: 0.3, max_carga_financiera: 0.5, max_deuda_precio_venta: 0.95, max_edad_plazo: 80 })],
      indicadores({ div_renta: [0.2, 0.18], carga_financiera: [0.3, 0.25], deuda_precio_venta: [0.85, null] }),
      40,
      [35],
      25,
    )
    expect(rows[0].status).toBe('compliant')
    expect(rows[0].cells.map(c => c.state)).toEqual(['pass', 'pass', 'pass', 'pass'])
  })

  it('a single failing ratio flips the row to noncompliant', () => {
    const rows = buildPoliticas(
      [inv({ name: 'A', max_dividendo_renta: 0.1, max_carga_financiera: 0.5, max_deuda_precio_venta: 0.95, max_edad_plazo: 80 })],
      indicadores({ div_renta: [0.2, 0.18], carga_financiera: [0.3, 0.25], deuda_precio_venta: [0.85, null] }),
      40,
      [35],
      25,
    )
    expect(rows[0].status).toBe('noncompliant')
    expect(rows[0].failingCount).toBe(1)
  })

  it('missing cap renders missing-cap and does NOT count as a pass', () => {
    const rows = buildPoliticas(
      [inv({ name: 'A', max_dividendo_renta: 0.3 /* others null */ })],
      indicadores({ div_renta: [0.2, 0.18], carga_financiera: [0.3, 0.25], deuda_precio_venta: [0.85, null] }),
      40,
      [35],
      25,
    )
    expect(rows[0].status).toBe('incomplete')
    expect(rows[0].cells.map(c => c.state)).toEqual(['pass', 'missing-cap', 'missing-cap', 'missing-cap'])
  })

  it('a null codebtor age makes the edad_plazo cell missing-value (never silently dropped)', () => {
    const rows = buildPoliticas(
      [inv({ name: 'A', max_dividendo_renta: 0.3, max_carga_financiera: 0.5, max_deuda_precio_venta: 0.95, max_edad_plazo: 70 })],
      indicadores({ div_renta: [0.2, 0.18], carga_financiera: [0.3, 0.25], deuda_precio_venta: [0.85, null] }),
      40,
      [null, 30],
      25,
    )
    expect(rows[0].cells[3].state).toBe('missing-value')
    expect(rows[0].status).toBe('incomplete')
  })

  it('edad_plazo uses worst (oldest) person + plazo', () => {
    const rows = buildPoliticas(
      [inv({ name: 'A', max_dividendo_renta: 0.3, max_carga_financiera: 0.5, max_deuda_precio_venta: 0.95, max_edad_plazo: 70 })],
      indicadores({ div_renta: [0.2, 0.18], carga_financiera: [0.3, 0.25], deuda_precio_venta: [0.85, null] }),
      55,
      [30, 60],
      25,
    )
    // 60 + 25 = 85 > 70 → fail
    expect(rows[0].cells[3].state).toBe('fail')
    expect(rows[0].cells[3].clientValue).toBe(85)
  })

  it('missing client value (no plazo) keeps every cell from missing-value not from pass', () => {
    const rows = buildPoliticas(
      [inv({ name: 'A', max_dividendo_renta: 0.3, max_carga_financiera: 0.5, max_deuda_precio_venta: 0.95, max_edad_plazo: 70 })],
      indicadores({ div_renta: [null, null], carga_financiera: [null, null], deuda_precio_venta: [null, null] }),
      55,
      [30],
      null,
    )
    expect(rows[0].cells.every(c => c.state === 'missing-value')).toBe(true)
    expect(rows[0].status).toBe('incomplete')
  })

  // buildPoliticas reads each ratio by `fieldKey`, so it is agnostic to which
  // array a row came from. In the host the `deuda_precio_venta` row lives in the
  // carved-out `deuda_garantia` subsection (a SEPARATE array from the main
  // indicadoresRows); the call site concatenates both before calling this. If it
  // only fed one array, the Deuda/Precio cell would silently be `missing-value`.
  it('reads deuda_precio_venta from a row supplied in a separate concatenated array', () => {
    const mainRows = indicadores({ div_renta: [0.2, 0.18], carga_financiera: [0.3, 0.25] })
    const deudaGarantiaRows = indicadores({ deuda_precio_venta: [1000 / 1200, null] })
    expect(mainRows.find(r => r.fieldKey === 'deuda_precio_venta')).toBeUndefined()

    const rows = buildPoliticas(
      [inv({ name: 'A', max_dividendo_renta: 1, max_carga_financiera: 1, max_deuda_precio_venta: 0.9, max_edad_plazo: 80 })],
      [...mainRows, ...deudaGarantiaRows],
      40,
      [],
      25,
    )
    // monto/precio = 1000/1200 ≈ 0.833, cap 0.9 → pass (would be 'missing-value' if the array were dropped).
    const dpv = rows[0].cells.find(c => c.ratio === 'deuda_precio_venta')!
    expect(dpv.state).toBe('pass')
    expect(dpv.clientValue).toBeCloseTo(1000 / 1200)
  })

  it('sort tiers: compliant → incomplete → noncompliant (never mixed)', () => {
    const investors = [
      inv({ id: 'a', name: 'Noncompliant1', max_dividendo_renta: 0.1, max_carga_financiera: 0.5, max_deuda_precio_venta: 0.95, max_edad_plazo: 80 }),
      inv({ id: 'b', name: 'Compliant1',    max_dividendo_renta: 0.3, max_carga_financiera: 0.5, max_deuda_precio_venta: 0.95, max_edad_plazo: 80 }),
      inv({ id: 'c', name: 'Incomplete1' /* missing caps */ }),
      inv({ id: 'd', name: 'Compliant2',    max_dividendo_renta: 0.5, max_carga_financiera: 0.5, max_deuda_precio_venta: 0.95, max_edad_plazo: 90 }),
    ]
    const rows = buildPoliticas(
      investors,
      indicadores({ div_renta: [0.2, 0.18], carga_financiera: [0.3, 0.25], deuda_precio_venta: [0.85, null] }),
      40,
      [35],
      25,
    )
    expect(rows.map(r => r.status)).toEqual(['compliant', 'compliant', 'incomplete', 'noncompliant'])
    // Compliant tier sub-sorted by margin desc: Compliant2 has larger margins.
    expect(rows[0].investorName).toBe('Compliant2')
    expect(rows[1].investorName).toBe('Compliant1')
  })
})
