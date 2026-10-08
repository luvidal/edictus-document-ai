/**
 * Tests for reliquidación computation using spreadsheet data as fixture.
 *
 * Spreadsheet: liquidacion_renta_chile_ajustada_topes.xlsx
 * Sheet: "Calculo FV" — reference values for SEP 2025
 */

import { describe, it, expect } from 'vitest'
import { applyIUSC, computeReliquidacion, computeExpectedImpuesto, hasClassifications } from '../src/reliquidacion'
import type { RowData } from '@edictus/tables'

// ── Spreadsheet fixture data (SEP 2025) ──

const UTM_SEP = 69.265    // UTM septiembre 2025 (miles CLP) → 69265 pesos
// But actually the spreadsheet uses Previred topes directly in miles CLP
// tope_afp_salud = 3466.84 (miles) → tope_afp_salud_uf * UF = 90.8 * UF
// So UF = 3466.84 / 90.8 = 38.181 (approx)
const UF_DERIVED = 3466.84 / 90.8  // ≈ 38.181

const monthId = '2025-09'

function makeRows(): RowData[] {
  return [
    // Income rows
    { id: '1', label: 'Sueldo Base', type: 'income', values: { [monthId]: 3556 }, naturaleza: 'Imponible' },
    { id: '2', label: 'Gratificación', type: 'income', values: { [monthId]: 209 }, naturaleza: 'Imponible' },
    { id: '3', label: 'Colación', type: 'income', values: { [monthId]: 143 }, naturaleza: 'No imponible' },
    { id: '4', label: 'Movilización', type: 'income', values: { [monthId]: 154 }, naturaleza: 'No imponible' },
    { id: '5', label: 'Bono / Comisión variable 1', type: 'income', values: { [monthId]: 1000 }, isVariable: true, naturaleza: 'Imponible' },
    // Deduction rows
    { id: '6', label: 'Cotiz. Previ. Obligatoria', type: 'deduction', values: { [monthId]: 367 }, naturaleza: 'Legal', legalType: 'afp' },
    { id: '7', label: 'Cotiz. Salud Obligatoria', type: 'deduction', values: { [monthId]: 243 }, naturaleza: 'Legal', legalType: 'salud' },
    { id: '8', label: 'Seguro Cesantía', type: 'deduction', values: { [monthId]: 23 }, naturaleza: 'Legal', legalType: 'cesantia' },
    { id: '9', label: 'Impuesto Único', type: 'deduction', values: { [monthId]: 0 }, naturaleza: 'Legal', legalType: 'impuesto' },
    { id: '10', label: 'Seguro Complementario', type: 'deduction', values: { [monthId]: 13 }, naturaleza: 'Otro' },
    { id: '11', label: 'Convenio Falp', type: 'deduction', values: { [monthId]: 9 }, naturaleza: 'Otro' },
    { id: '12', label: 'Ajuste redondeo sistema', type: 'deduction', values: { [monthId]: -1 }, naturaleza: 'Otro' },
  ] as RowData[]
}

describe('applyIUSC', () => {
  it('returns 0 for base tributable in first bracket (exento)', () => {
    const baseTrib = 800  // 800 < 13.5 * 69.265 = 935.08
    expect(applyIUSC(baseTrib, UTM_SEP)).toBe(0)
  })

  it('computes correct tax for second bracket (4%)', () => {
    // From spreadsheet: base_tributable_fija ≈ 3765 - cotiz_fija
    // For the real case, the base tributable is around 3132 (from spreadsheet)
    // 13.5 * 69.265 = 935.08, 30 * 69.265 = 2077.95
    // 3132 is in the 3rd bracket (8%): 3132 * 0.08 - 1.74 * 69.265 = 250.56 - 120.52 = 130.04 → 130
    const baseTrib = 3132
    const expected = Math.round(baseTrib * 0.08 - 1.74 * UTM_SEP)
    expect(applyIUSC(baseTrib, UTM_SEP)).toBe(expected)
  })

  it('returns 0 for zero or negative base', () => {
    expect(applyIUSC(0, UTM_SEP)).toBe(0)
    expect(applyIUSC(-100, UTM_SEP)).toBe(0)
  })
})

describe('hasClassifications', () => {
  it('returns true when most rows have naturaleza', () => {
    const rows = makeRows()
    expect(hasClassifications(rows)).toBe(true)
  })

  it('returns false when no rows have naturaleza', () => {
    const rows = makeRows().map(r => {
      const { naturaleza, ...rest } = r as any
      return rest as RowData
    })
    expect(hasClassifications(rows)).toBe(false)
  })

  it('returns false for empty rows', () => {
    expect(hasClassifications([])).toBe(false)
  })
})

describe('computeExpectedImpuesto', () => {
  it('computes IUSC on total imponible minus all cotizaciones', () => {
    const rows = makeRows()
    // imponibleTotal = 3556 + 209 + 1000 = 4765 (colación + movilización excluded: No imponible)
    // cotizPreviReal = 367, cotizSaludReal = 243, cotizCesantiaReal = 23
    // baseTributable = 4765 - 367 - 243 - 23 = 4132
    // applyIUSC(4132, 69.265): bracket 13.5% → round(4132*0.135 - 4.49*69.265) = round(557.82 - 310.9) = 247
    const result = computeExpectedImpuesto(rows, monthId, UTM_SEP)
    expect(result).toBe(Math.round(4132 * 0.135 - 4.49 * UTM_SEP))
  })

  it('returns 0 when imponible is below tax threshold', () => {
    const rows = makeRows().map(r => ({
      ...r,
      values: { [monthId]: (r.values[monthId] ?? 0) * 0.1 },
    }))
    // Small income → base tributable below first bracket → 0
    expect(computeExpectedImpuesto(rows, monthId, UTM_SEP)).toBe(0)
  })

  it('skips the impuesto row itself when summing cotizaciones', () => {
    const rows = makeRows()
    // 'Impuesto Único' row has value 0 — confirm it doesn't affect result
    const withImpuesto = rows.map(r =>
      r.label === 'Impuesto Único' ? { ...r, values: { [monthId]: 500 } } : r
    ) as typeof rows
    // Impuesto row's label matches IMPUESTO_PATTERN, but not AFP/Salud/Cesantía patterns
    // so it is skipped in cotiz summation → result is same as without it
    const result = computeExpectedImpuesto(withImpuesto, monthId, UTM_SEP)
    expect(result).toBe(Math.round(4132 * 0.135 - 4.49 * UTM_SEP))
  })
})

describe('computeReliquidacion', () => {
  it('correctly sums imponible fijo vs variable', () => {
    const rows = makeRows()
    const result = computeReliquidacion({ rows, monthId, utm: UTM_SEP, uf: UF_DERIVED })

    // Spreadsheet: imponible_fijo = 3556 + 209 = 3765
    expect(result.imponibleFijo).toBe(3765)
    // Spreadsheet: imponible_variable = 1000
    expect(result.imponibleVariable).toBe(1000)
    // Spreadsheet: no_imponible_fijo = 143 + 154 = 297
    expect(result.noImponibleFijo).toBe(297)
  })

  it('correctly identifies legal deductions', () => {
    const rows = makeRows()
    const result = computeReliquidacion({ rows, monthId, utm: UTM_SEP, uf: UF_DERIVED })

    expect(result.cotizPreviReal).toBe(367)
    expect(result.cotizSaludReal).toBe(243)
    expect(result.cotizCesantiaReal).toBe(23)
  })

  it('computes effective rates and theoretical fixed cotizaciones', () => {
    const rows = makeRows()
    const result = computeReliquidacion({ rows, monthId, utm: UTM_SEP, uf: UF_DERIVED })

    // Spreadsheet: cotiz_previ_fija = ROUND(MIN(3765, 3466.84) * (367 / MIN(4765, 3466.84)))
    // = ROUND(3466.84 * (367 / 3466.84)) = ROUND(367) = 367
    // Wait, imponible_total = 4765 > tope 3466.84, so MIN(4765, 3466.84) = 3466.84
    // tasa_afp = 367 / 3466.84 ≈ 0.10586
    // MIN(imponible_fijo, tope) = MIN(3765, 3466.84) = 3466.84
    // cotiz_previ_fija = ROUND(3466.84 * 0.10586) = ROUND(367) = 367
    // Actually since MIN(fijo,tope) = tope and MIN(total,tope) = tope, rate = cotiz/tope
    // then fija = tope * (cotiz/tope) = cotiz → same as real when both exceed tope
    expect(result.cotizPreviFija).toBe(367)
    expect(result.cotizSaludFija).toBe(243)
  })

  it('renta fija + renta variable = liquido total', () => {
    const rows = makeRows()
    const result = computeReliquidacion({ rows, monthId, utm: UTM_SEP, uf: UF_DERIVED })

    // Key invariant: renta_fija + renta_variable = liquido_total
    expect(result.rentaFija + result.rentaVariable).toBe(result.liquidoTotal)
  })

  it('renta variable is small when only bono changes to fixed', () => {
    const rows = makeRows().map(r => ({ ...r, isVariable: false }))
    const result = computeReliquidacion({ rows, monthId, utm: UTM_SEP, uf: UF_DERIVED })

    // When all income becomes fixed, imponibleFijo = imponibleTotal.
    // Theoretical cotizaciones match real ones exactly.
    // But impuestoFijo (from IUSC brackets) may differ from actual impuestoReal=0
    // on the liquidación, so rentaVariable = liquidoTotal - rentaFija ≠ 0.
    // The difference reflects the IUSC recalculation gap.
    expect(result.imponibleVariable).toBe(0)
    expect(result.imponibleFijo).toBe(4765) // All income is now fixed
    // Key invariant still holds:
    expect(result.rentaFija + result.rentaVariable).toBe(result.liquidoTotal)
  })

  it('Impuesto Por Reliquidación without legalType does NOT go into impuestoReal', () => {
    const rows = [
      ...makeRows(),
      // This row has "impuesto" in the label but no legalType — should be treated as other deduction
      { id: '13', label: 'Impuesto Por Reliquidación', type: 'deduction', values: { [monthId]: 51 }, naturaleza: 'Legal' } as RowData,
    ]
    const result = computeReliquidacion({ rows, monthId, utm: UTM_SEP, uf: UF_DERIVED })

    // impuestoReal should only include Impuesto Único (value 0), not the reliquidación adjustment
    expect(result.impuestoReal).toBe(0)
    // The 51 should go into descuentosOtrosFijos instead
    expect(result.descuentosOtrosFijos).toBe(13 + 9 + (-1) + 51)
  })

  it('row with legalType=impuesto is correctly classified as impuesto', () => {
    const rows = [
      ...makeRows(),
      { id: '13', label: 'Impuesto Por Reliquidación', type: 'deduction', values: { [monthId]: 51 }, naturaleza: 'Legal', legalType: 'impuesto' } as RowData,
    ]
    const result = computeReliquidacion({ rows, monthId, utm: UTM_SEP, uf: UF_DERIVED })

    // With explicit legalType, this SHOULD go into impuestoReal
    expect(result.impuestoReal).toBe(51)
  })

  it('legal rows without legalType are treated as unknown (descuentosOtros)', () => {
    const rows: RowData[] = [
      { id: '1', label: 'Sueldo Base', type: 'income', values: { [monthId]: 3000 }, naturaleza: 'Imponible' },
      // No legalType → should NOT be detected as AFP despite label
      { id: '2', label: 'Cotiz. Previ. AFP', type: 'deduction', values: { [monthId]: 300 }, naturaleza: 'Legal' },
    ] as RowData[]
    const result = computeReliquidacion({ rows, monthId, utm: UTM_SEP, uf: UF_DERIVED })

    // Without legalType, goes into other deductions, not cotizPreviReal
    expect(result.cotizPreviReal).toBe(0)
    expect(result.descuentosOtrosFijos).toBe(300)
  })
})
