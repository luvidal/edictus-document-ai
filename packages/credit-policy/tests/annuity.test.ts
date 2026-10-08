import { describe, it, expect } from 'vitest'
import { calcDividendo, calcMaxMonto } from '../src/annuity'

describe('calcDividendo — PMT', () => {
  it('computes the monthly payment for a standard loan', () => {
    // 1000 UF, 20 años, 9,5% anual.
    const d = calcDividendo(9.5, 20, 1000)!
    expect(Math.round(d * 100) / 100).toBe(d) // already rounded to 2 decimals
    expect(d).toBeGreaterThan(0)
  })

  it('returns undefined when any input is missing', () => {
    expect(calcDividendo(undefined, 20, 1000)).toBeUndefined()
    expect(calcDividendo(9.5, undefined, 1000)).toBeUndefined()
    expect(calcDividendo(9.5, 20, undefined)).toBeUndefined()
  })

  it('returns undefined for a zero rate / plazo / monto (degenerate)', () => {
    expect(calcDividendo(0, 20, 1000)).toBeUndefined()
    expect(calcDividendo(9.5, 0, 1000)).toBeUndefined()
    expect(calcDividendo(9.5, 20, 0)).toBeUndefined()
  })
})

describe('calcMaxMonto — PV inverse', () => {
  it('round-trips calcDividendo within 2-decimal rounding tolerance', () => {
    // Both functions round to 2 decimals, so PV(PMT(monto)) recovers monto only
    // up to the rounding of the intermediate dividendo — not bit-exact.
    const monto = 1000
    const d = calcDividendo(9.5, 20, monto)!
    const back = calcMaxMonto(9.5, 20, d)!
    expect(Math.abs(back - monto)).toBeLessThan(1)
  })

  it('returns undefined when any input is missing', () => {
    expect(calcMaxMonto(undefined, 20, 5)).toBeUndefined()
    expect(calcMaxMonto(9.5, undefined, 5)).toBeUndefined()
    expect(calcMaxMonto(9.5, 20, undefined)).toBeUndefined()
  })

  it('returns undefined for a zero rate / plazo (degenerate)', () => {
    expect(calcMaxMonto(0, 20, 5)).toBeUndefined()
    expect(calcMaxMonto(9.5, 0, 5)).toBeUndefined()
  })

  it('a NEGATIVE dividendo yields a NEGATIVE monto (raw, no clamp)', () => {
    const m = calcMaxMonto(9.5, 20, -5)!
    expect(m).toBeLessThan(0)
  })
})
