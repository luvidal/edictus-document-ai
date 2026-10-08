import { describe, it, expect } from 'vitest'
import { computeMaxMontoUF, type SimInputs } from '../src/buildsimulacion'
import type { InvestorCaps } from '../src/investortypes'

// Borrower from politicas.numbers: renta 1.000.000, otras deudas 100.000,
// precio 2.000 UF, UF 40.000, 9,5% / 20 años (no seguros — matches the sheet).
const BASE: SimInputs = {
  renta: 1_000_000,
  egresos: 100_000,
  precio: 2_000,
  valorUF: 40_000,
  tasa: 9.5,
}
const PLAZO: number | null = 20

function inv(caps: Partial<InvestorCaps>): InvestorCaps {
  return {
    id: 'i', name: 'Inv',
    max_dividendo_renta: null, max_carga_financiera: null,
    max_deuda_precio_venta: null, max_edad_plazo: null, ...caps,
  }
}
const result = (i: InvestorCaps, s = BASE) => computeMaxMontoUF(i, s, PLAZO)
const max = (i: InvestorCaps, s = BASE) => result(i, s).maxMontoUF

describe('computeMaxMontoUF — análisis inverso', () => {
  it('reproduces the spreadsheet: Inv1 → 689 UF, bound by Div/Renta', () => {
    const r = max(inv({ max_dividendo_renta: 0.25, max_carga_financiera: 0.50, max_deuda_precio_venta: 0.80, max_edad_plazo: 90 }))
    expect(Math.round(r!)).toBe(689) // MIN(689, 1103, 1600)
  })

  it('reproduces the spreadsheet: Inv2 → 827 UF, bound by Div/Renta', () => {
    const r = max(inv({ max_dividendo_renta: 0.30, max_carga_financiera: 0.60, max_deuda_precio_venta: 0.70, max_edad_plazo: 90 }))
    expect(Math.round(r!)).toBe(827) // MIN(827, 1378, 1400)
  })

  it('age is NOT a factor — the max ignores edad+plazo entirely (no edad term in the sheet)', () => {
    // A tight edad cap any borrower would blow must not change the computed max.
    const r = max(inv({ max_dividendo_renta: 0.30, max_carga_financiera: 0.60, max_deuda_precio_venta: 0.75, max_edad_plazo: 1 }))
    expect(Math.round(r!)).toBe(827) // MIN(827, 1378, 1500) — same as with no edad cap
  })

  it('reports the binding ratio (Inv1 → div_renta)', () => {
    const r = result(inv({ max_dividendo_renta: 0.25, max_carga_financiera: 0.50, max_deuda_precio_venta: 0.80, max_edad_plazo: 90 }))
    expect(r.bindingRatio).toBe('div_renta')
  })

  it('a constraint with a missing cap drops out of the MIN, and LTV binds when alone', () => {
    // Only LTV configured → ceiling is purely cap·precio, money ratios ignored.
    const r = result(inv({ max_deuda_precio_venta: 0.70, max_edad_plazo: 90 }))
    expect(r).toEqual({ maxMontoUF: 1400, bindingRatio: 'deuda_precio_venta' }) // 0.70 × 2000
  })

  it('no caps at all → null (renders "—")', () => {
    expect(max(inv({ max_edad_plazo: 90 }))).toBeNull()
  })

  it('missing renta drops Div/Renta & Carga; missing precio drops LTV → null', () => {
    const i = inv({ max_dividendo_renta: 0.25, max_carga_financiera: 0.50, max_deuda_precio_venta: 0.80, max_edad_plazo: 90 })
    const r = computeMaxMontoUF(i, { ...BASE, renta: null, precio: null }, PLAZO)
    expect(r.maxMontoUF).toBeNull()
  })

  it('Carga is exactly 0 at the boundary (egresos == cap·renta)', () => {
    // cap·renta = 0.10·1M = 100k = egresos → headroom 0 → Carga ceiling 0 → MIN 0
    const r = max(inv({ max_carga_financiera: 0.10 }), { ...BASE, egresos: 100_000 })
    expect(r).toBe(0)
  })

  it('Carga goes NEGATIVE (raw, no clamp) when existing debt exceeds the cap', () => {
    // cap·renta 100k − egresos 200k = −100k headroom → negative dividendo → negative monto
    const r = result(inv({ max_carga_financiera: 0.10 }), { ...BASE, egresos: 200_000 })
    expect(r.maxMontoUF).toBeLessThan(0)
    expect(r.bindingRatio).toBe('carga_financiera')
  })
})
