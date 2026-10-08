import type { SummaryRow } from '@edictus/tables'
import type { InvestorCaps } from './investortypes'
import { computeMaxMontoUF, type SimInputs } from './buildsimulacion'
import type {
  PolicyCell, PolicyRatio, PolicyCellState, PolicyRowStatus, PolicyRow,
} from './politicastypes'

// Re-export the policy types so consumers keep their surface (the type home is
// `./politicastypes`).
export type { PolicyCell, PolicyRatio, PolicyCellState, PolicyRowStatus, PolicyRow }

const CAP_FIELD: Record<PolicyRatio, keyof Pick<
  InvestorCaps,
  'max_dividendo_renta' | 'max_carga_financiera' | 'max_deuda_precio_venta' | 'max_edad_plazo'
>> = {
  div_renta: 'max_dividendo_renta',
  carga_financiera: 'max_carga_financiera',
  deuda_precio_venta: 'max_deuda_precio_venta',
  edad_plazo: 'max_edad_plazo',
}

/**
 * Read a percent indicator's client-side value from the indicadoresRows the
 * Resumen tab built. Picks the conjunto column (index 1) when present (joint
 * evaluation) and falls back to the individual column for single-scope rows
 * like `deuda_precio_venta` whose conjunto is null per the schema.
 */
function readPercentValue(
  rows: SummaryRow[],
  ratio: 'div_renta' | 'carga_financiera' | 'deuda_precio_venta',
): number | null {
  const row = rows.find(r => r.type === 'data' && r.fieldKey === ratio)
  if (!row) return null
  const conjunto = row.values[1]
  if (conjunto != null) return conjunto
  return row.values[0]
}

/**
 * Worst-case edad+plazo for the binding-person rule. `null` in any of the
 * inputs flips this to null so the cell becomes `missing-value` (the plan
 * explicitly forbids silently dropping unknown people from the `max(...)`,
 * which would risk a false green).
 */
function computeEdadPlazo(
  titularAge: number | null,
  codebtorAges: (number | null)[],
  plazoYears: number | null,
): number | null {
  if (titularAge == null || plazoYears == null) return null
  if (codebtorAges.some(a => a == null)) return null
  const ages = [titularAge, ...(codebtorAges as number[])]
  return Math.max(...ages) + plazoYears
}

function evaluateCell(ratio: PolicyRatio, clientValue: number | null, cap: number | null): PolicyCell {
  if (cap == null) return { ratio, clientValue, cap, state: 'missing-cap' }
  if (clientValue == null) return { ratio, clientValue, cap, state: 'missing-value' }
  return {
    ratio,
    clientValue,
    cap,
    state: clientValue <= cap ? 'pass' : 'fail',
  }
}

function classify(cells: PolicyCell[]): PolicyRowStatus {
  if (cells.some(c => c.state === 'fail')) return 'noncompliant'
  if (cells.every(c => c.state === 'pass')) return 'compliant'
  return 'incomplete'
}

function rowMargins(cells: PolicyCell[]): { marginSum: number; failingCount: number } {
  let marginSum = 0
  let failingCount = 0
  for (const c of cells) {
    if (c.state === 'pass' && c.cap != null && c.clientValue != null) marginSum += c.cap - c.clientValue
    if (c.state === 'fail') failingCount += 1
  }
  return { marginSum, failingCount }
}

const TIER_ORDER: Record<PolicyRowStatus, number> = {
  compliant: 0,
  incomplete: 1,
  noncompliant: 2,
}

export function buildPoliticas(
  investors: InvestorCaps[],
  indicadoresRows: SummaryRow[],
  titularAge: number | null,
  codebtorAges: (number | null)[],
  plazoYears: number | null,
  sim: SimInputs | null = null,
): PolicyRow[] {
  const ratioValues: Record<PolicyRatio, number | null> = {
    div_renta: readPercentValue(indicadoresRows, 'div_renta'),
    carga_financiera: readPercentValue(indicadoresRows, 'carga_financiera'),
    deuda_precio_venta: readPercentValue(indicadoresRows, 'deuda_precio_venta'),
    edad_plazo: computeEdadPlazo(titularAge, codebtorAges, plazoYears),
  }

  const rows: PolicyRow[] = investors.map(inv => {
    const cells: PolicyCell[] = (['div_renta', 'carga_financiera', 'deuda_precio_venta', 'edad_plazo'] as PolicyRatio[])
      .map(ratio => evaluateCell(ratio, ratioValues[ratio], inv[CAP_FIELD[ratio]]))
    const status = classify(cells)
    const { marginSum, failingCount } = rowMargins(cells)
    const maxResult = sim
      ? computeMaxMontoUF(inv, sim, plazoYears)
      : { maxMontoUF: null, bindingRatio: null }
    return {
      investorId: inv.id,
      investorName: inv.name,
      status,
      cells,
      marginSum,
      failingCount,
      maxMontoUF: maxResult.maxMontoUF,
      bindingRatio: maxResult.bindingRatio,
    }
  })

  rows.sort((a, b) => {
    const tier = TIER_ORDER[a.status] - TIER_ORDER[b.status]
    if (tier !== 0) return tier
    if (a.status === 'compliant') {
      const m = b.marginSum - a.marginSum
      if (m !== 0) return m
      return a.investorName.localeCompare(b.investorName)
    }
    if (a.status === 'noncompliant') {
      const f = a.failingCount - b.failingCount
      if (f !== 0) return f
      return a.investorName.localeCompare(b.investorName)
    }
    return a.investorName.localeCompare(b.investorName)
  })

  return rows
}

export const RATIO_LABEL: Record<PolicyRatio, string> = {
  div_renta: 'Div / Renta',
  carga_financiera: 'Carga Fin.',
  deuda_precio_venta: 'Deuda / Precio',
  edad_plazo: 'Edad + Plazo',
}

/** Display unit shown in the column header; pills omit it to stay compact. */
export const RATIO_UNIT: Record<PolicyRatio, string | null> = {
  div_renta: '%',
  carga_financiera: '%',
  deuda_precio_venta: '%',
  edad_plazo: null,
}
