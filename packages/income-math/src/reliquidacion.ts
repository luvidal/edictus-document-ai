/**
 * Reliquidación de renta: computes theoretical Renta Fija and Renta Variable
 * by splitting cotizaciones and IUSC tax between fixed and variable income.
 *
 * Uses the effective-rate method: derives AFP/Salud/Cesantía rates from
 * actual deductions on the liquidación, then applies them to the fixed
 * income portion capped at legal topes.
 */

import type { RowData } from '@edictus/tables'
import type { Naturaleza, LegalType } from './types'
import globalComplementario from './data/globalcomplementario.json'
import previred from './data/previred.json'

// ── Types ──────────────────────────────────────────────────

interface ReliquidacionInput {
  rows: RowData[]
  monthId: string
  utm: number   // UTM for this period (pesos, e.g. 69265)
  uf: number    // UF for this period (pesos, e.g. 39800)
}

export interface ReliquidacionResult {
  rentaFija: number
  rentaVariable: number
  // Intermediates
  imponibleFijo: number
  imponibleVariable: number
  noImponibleFijo: number
  noImponibleVariable: number
  cotizPreviReal: number
  cotizSaludReal: number
  cotizCesantiaReal: number
  cotizPreviFija: number
  cotizSaludFija: number
  cotizCesantiaFija: number
  baseTributableFija: number
  impuestoReal: number
  impuestoFijo: number
  descuentosOtrosFijos: number
  descuentosOtrosVariables: number
  liquidoTotal: number
}

// ── Helpers ────────────────────────────────────────────────

const isAddType = (type: string) => type === 'add' || type === 'income'

/** Get naturaleza from RowData (stored directly or in meta) */
function getNaturaleza(row: RowData): Naturaleza | undefined {
  return (row as any).naturaleza as Naturaleza | undefined
}

/** Get legalType from RowData — no fallback, rows must have it set explicitly */
function getLegalType(row: RowData): LegalType | undefined {
  return (row as any).legalType as LegalType | undefined
}

export const IMPUESTO_PATTERN = /impuesto|2da\s*cat|segunda\s*cat/i

// ── IUSC (Impuesto Único de Segunda Categoría) ────────────

interface Tramo {
  desde: number
  hasta: number | null
  tasa: number
  rebaja: number
}

const tramos: Tramo[] = globalComplementario.tramos

/**
 * Apply monthly IUSC tax brackets.
 * Thresholds are in UTM (same numeric values as UTA annual table,
 * but multiplied by UTM instead of UTA for monthly calculation).
 */
export function applyIUSC(baseTributable: number, utm: number): number {
  if (baseTributable <= 0 || utm <= 0) return 0

  for (const tramo of tramos) {
    const hasta = tramo.hasta != null ? tramo.hasta * utm : Infinity

    if (baseTributable < hasta) {
      const impuesto = baseTributable * tramo.tasa - tramo.rebaja * utm
      return Math.round(Math.max(0, impuesto))
    }
  }

  // Last bracket (open-ended)
  const last = tramos[tramos.length - 1]
  const impuesto = baseTributable * last.tasa - last.rebaja * utm
  return Math.round(Math.max(0, impuesto))
}

// ── Main computation ───────────────────────────────────────

/**
 * Check if rows have classification data (naturaleza) for reliquidación.
 * Returns false for legacy data without AI classifications.
 */
export function hasClassifications(rows: RowData[]): boolean {
  const dataRows = rows.filter(r => !r.isGroup && !r.deletedAt)
  if (dataRows.length === 0) return false
  // At least half the rows should have naturaleza for meaningful computation
  const withNaturaleza = dataRows.filter(r => getNaturaleza(r))
  return withNaturaleza.length >= dataRows.length * 0.5
}

/**
 * Compute reliquidación for a single month.
 * Splits net income into fixed and variable portions using the
 * effective-rate method for cotizaciones and IUSC tax.
 */
export function computeReliquidacion(input: ReliquidacionInput): ReliquidacionResult {
  const { rows, monthId, utm, uf } = input
  const topeAfpPesos = previred.tope_afp_salud_uf * uf
  const topeCesantiaPesos = previred.tope_cesantia_uf * uf

  // ── Step 1: Classify and sum rows ──
  let imponibleFijo = 0
  let imponibleVariable = 0
  let noImponibleFijo = 0
  let noImponibleVariable = 0
  let cotizPreviReal = 0
  let cotizSaludReal = 0
  let cotizCesantiaReal = 0
  let impuestoReal = 0
  let descuentosOtrosFijos = 0
  let descuentosOtrosVariables = 0

  for (const row of rows) {
    if (row.isGroup || row.deletedAt) continue
    const value = row.values[monthId]
    if (value == null) continue

    const nat = getNaturaleza(row)
    const isVar = !!row.isVariable

    if (isAddType(row.type)) {
      // Income rows
      if (nat === 'No imponible') {
        if (isVar) noImponibleVariable += value
        else noImponibleFijo += value
      } else {
        // Default to Imponible for income without classification
        if (isVar) imponibleVariable += value
        else imponibleFijo += value
      }
    } else {
      // Deduction rows
      if (nat === 'Legal') {
        const lt = getLegalType(row)
        switch (lt) {
          case 'afp': cotizPreviReal += value; break
          case 'salud': cotizSaludReal += value; break
          case 'cesantia': cotizCesantiaReal += value; break
          case 'impuesto': impuestoReal += value; break
          default:
            // Unknown legal — treat as other deduction
            if (isVar) descuentosOtrosVariables += value
            else descuentosOtrosFijos += value
        }
      } else {
        // Otro or unclassified deduction
        if (isVar) descuentosOtrosVariables += value
        else descuentosOtrosFijos += value
      }
    }
  }

  const imponibleTotal = imponibleFijo + imponibleVariable

  // ── Step 2: Effective rates ──
  const baseAfp = Math.min(imponibleTotal, topeAfpPesos)
  const baseCesantia = Math.min(imponibleTotal, topeCesantiaPesos)

  const tasaAfp = baseAfp > 0 ? cotizPreviReal / baseAfp : 0
  const tasaSalud = baseAfp > 0 ? cotizSaludReal / baseAfp : 0
  const tasaCesantia = baseCesantia > 0 ? cotizCesantiaReal / baseCesantia : 0

  // ── Step 3: Theoretical fixed cotizaciones ──
  const cotizPreviFija = Math.round(Math.min(imponibleFijo, topeAfpPesos) * tasaAfp)
  const cotizSaludFija = Math.round(Math.min(imponibleFijo, topeAfpPesos) * tasaSalud)
  const cotizCesantiaFija = Math.round(Math.min(imponibleFijo, topeCesantiaPesos) * tasaCesantia)

  // ── Step 4: Fixed taxable base + IUSC ──
  const baseTributableFija = imponibleFijo - cotizPreviFija - cotizSaludFija - cotizCesantiaFija
  const impuestoFijo = applyIUSC(baseTributableFija, utm)

  // ── Step 5: Renta fija reliquidada ──
  const rentaFija = imponibleFijo + noImponibleFijo
    - cotizPreviFija - cotizSaludFija - cotizCesantiaFija
    - impuestoFijo
    - descuentosOtrosFijos

  // ── Step 6: Renta variable = líquido total - renta fija ──
  const totalIngresos = imponibleTotal + noImponibleFijo + noImponibleVariable
  const totalDescuentos = cotizPreviReal + cotizSaludReal + cotizCesantiaReal
    + impuestoReal + descuentosOtrosFijos + descuentosOtrosVariables
  const liquidoTotal = totalIngresos - totalDescuentos
  const rentaVariable = liquidoTotal - rentaFija

  return {
    rentaFija,
    rentaVariable,
    imponibleFijo,
    imponibleVariable,
    noImponibleFijo,
    noImponibleVariable,
    cotizPreviReal,
    cotizSaludReal,
    cotizCesantiaReal,
    cotizPreviFija,
    cotizSaludFija,
    cotizCesantiaFija,
    baseTributableFija,
    impuestoReal,
    impuestoFijo,
    descuentosOtrosFijos,
    descuentosOtrosVariables,
    liquidoTotal,
  }
}

// ── Impuesto recalculation ────────────────────────────────

/**
 * Compute the expected Impuesto Único (IUSC) for a month based on current
 * row values. Used to auto-update the impuesto row when income changes.
 *
 * baseTributable = imponibleTotal - cotizPreviReal - cotizSaludReal - cotizCesantiaReal
 * impuesto = applyIUSC(baseTributable, utm)
 */
export function computeExpectedImpuesto(rows: RowData[], monthId: string, utm: number): number {
  let imponibleTotal = 0
  let cotizPreviReal = 0
  let cotizSaludReal = 0
  let cotizCesantiaReal = 0

  for (const row of rows) {
    if (row.isGroup || row.deletedAt) continue
    const value = row.values[monthId]
    if (value == null) continue

    const nat = getNaturaleza(row)

    if (isAddType(row.type)) {
      if (nat !== 'No imponible') {
        imponibleTotal += value
      }
    } else if (nat === 'Legal') {
      const lt = getLegalType(row)
      if (lt === 'afp') cotizPreviReal += value
      else if (lt === 'salud') cotizSaludReal += value
      else if (lt === 'cesantia') cotizCesantiaReal += value
      // Skip impuesto itself — we're computing it
    }
  }

  const baseTributable = imponibleTotal - cotizPreviReal - cotizSaludReal - cotizCesantiaReal
  return applyIUSC(baseTributable, utm)
}
