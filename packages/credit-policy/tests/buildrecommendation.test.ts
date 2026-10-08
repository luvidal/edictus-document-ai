import { describe, it, expect } from 'vitest'
import { buildRecommendation } from '../src/buildrecommendation'
import type { PolicyRow, PolicyCell, PolicyRatio, PolicyRowStatus } from '../src/buildpoliticas'

const cell = (ratio: PolicyRatio, clientValue: number | null, cap: number | null, state: PolicyCell['state']): PolicyCell =>
  ({ ratio, clientValue, cap, state })

function row(name: string, status: PolicyRowStatus, cells: PolicyCell[], maxMontoUF: number | null, bindingRatio: PolicyRow['bindingRatio'] = null): PolicyRow {
  return { investorId: name, investorName: name, status, cells, marginSum: 0, failingCount: 0, maxMontoUF, bindingRatio }
}

// Income ratios at the requested loan: Div/Renta 5%, Carga 49% (a high-debt sample profile).
const pass = (ratio: PolicyRatio, cv: number, cap: number) => cell(ratio, cv, cap, 'pass')
const fail = (ratio: PolicyRatio, cv: number, cap: number) => cell(ratio, cv, cap, 'fail')

const compliant = (name: string, max: number) => row(name, 'compliant', [
  pass('div_renta', 0.05, 0.25), pass('carga_financiera', 0.49, 0.50),
  pass('deuda_precio_venta', 0.80, 0.80), pass('edad_plazo', 68, 80),
], max)

// Short on Carga only (LTV + Edad pass) → salary-solvable.
const cargaShort = (name: string, cargaCap: number, max: number) => row(name, 'noncompliant', [
  pass('div_renta', 0.05, 0.30), fail('carga_financiera', 0.49, cargaCap),
  pass('deuda_precio_venta', 0.80, 0.90), pass('edad_plazo', 68, 70),
], max, 'carga_financiera')

// Short on Carga AND LTV → structural; salary can't fix LTV.
const ltvShort = (name: string, max: number) => row(name, 'noncompliant', [
  pass('div_renta', 0.05, 0.20), fail('carga_financiera', 0.49, 0.45),
  fail('deuda_precio_venta', 0.80, 0.70), pass('edad_plazo', 68, 80),
], max, 'carga_financiera')

describe('buildRecommendation', () => {
  it('returns null without rows or a requested loan', () => {
    expect(buildRecommendation([], 1000, 8000)).toBeNull()
    expect(buildRecommendation([compliant('Pepe', 8000)], 1000, null)).toBeNull()
  })

  it('covers: lists the investors that approve the full loan, no salary path', () => {
    const rec = buildRecommendation([compliant('Pepe', 8000), cargaShort('Diego', 0.48, 6710)], 1000, 8000)!
    expect(rec.covers).toEqual(['Pepe'])
    expect(rec.sueldoExtra).toBeNull()
  })

  it('short: picks the cheapest salary-solvable investor (skips LTV-blocked rows)', () => {
    const rec = buildRecommendation([cargaShort('Diego', 0.48, 6710), ltvShort('Pedro', 1864)], 1000, 8000)!
    expect(rec.covers).toEqual([])
    // Diego: renta × (0.49/0.48 − 1) ≈ 20.8; Pedro excluded (LTV fail).
    expect(rec.sueldoExtra?.investor).toBe('Diego')
    expect(Math.round(rec.sueldoExtra!.clp)).toBe(21)
    expect(rec.deudaMaxima).toEqual({ uf: 6710, investor: 'Diego' })
  })

  it('short with two salary-solvable investors: the closer cap costs less salary', () => {
    const rec = buildRecommendation([cargaShort('Diego', 0.48, 6710), cargaShort('Ana', 0.40, 3000)], 1000, 8000)!
    expect(rec.sueldoExtra?.investor).toBe('Diego') // 0.49/0.48 cheaper than 0.49/0.40
  })

  it('structural-only block (LTV) → no salary path, falls back to the cheaper-house number', () => {
    const rec = buildRecommendation([ltvShort('Pedro', 1864)], 1000, 8000)!
    expect(rec.sueldoExtra).toBeNull()
    expect(rec.deudaMaxima).toEqual({ uf: 1864, investor: 'Pedro' })
  })

  it('deudaMaxima is the single best Máx across investors (even when negative)', () => {
    const rec = buildRecommendation([cargaShort('Camilo', 0.40, -6143), cargaShort('Diego', 0.48, 1988)], 1000, 8000)!
    expect(rec.deudaMaxima).toEqual({ uf: 1988, investor: 'Diego' })
  })
})
