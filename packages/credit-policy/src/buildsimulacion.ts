import type { InvestorCaps } from './investortypes'
import { calcMaxMonto } from './annuity'
import type { MaxBinding } from './politicastypes'

export type { MaxBinding }

/**
 * Borrower scalars for the Políticas "análisis inverso" — the maximum loan
 * (UF) each investor would approve. Mirrors `politicas.numbers`: dividendo is
 * pure PMT/PV (no seguros). `renta`/`egresos` are the castigo-adjusted
 * `total_ingresos`/`total_egresos` (CLP).
 */
export interface SimInputs {
  renta: number | null
  egresos: number | null
  precio: number | null // UF
  valorUF: number | null // CLP per UF
  tasa: number | null // annual %
}

export interface MaxResult {
  maxMontoUF: number | null
  bindingRatio: MaxBinding | null
}

const NO_MAX: MaxResult = { maxMontoUF: null, bindingRatio: null }

/**
 * Solve each money/LTV `ratio ≤ cap` for the loan amount and take the MIN,
 * tracking which constraint bound it. Mirrors `politicas.numbers`: the smallest
 * of three loan ceilings — Div/Renta + Carga (income → max dividendo → PV) and
 * LTV (`cap·precio`). A constraint with a null cap or null input drops OUT of the
 * MIN (never 0/∞); no computable ceiling → null (`—`). Age is deliberately NOT an
 * input: `politicas.numbers` has no edad term — Edad+Plazo gates only the forward
 * pill, never the max.
 */
export function computeMaxMontoUF(
  inv: InvestorCaps,
  s: SimInputs,
  plazo: number | null,
): MaxResult {
  const candidates: { ratio: MaxBinding; monto: number }[] = []
  const canPV = s.tasa != null && plazo != null && s.valorUF != null && s.valorUF > 0
  const hasRenta = s.renta != null && s.renta > 0

  // Div/Renta: cap·renta → max dividendo (UF) → PV
  if (canPV && hasRenta && inv.max_dividendo_renta != null) {
    const divUF = (inv.max_dividendo_renta * (s.renta as number)) / (s.valorUF as number)
    const m = calcMaxMonto(s.tasa as number, plazo as number, divUF)
    if (m != null) candidates.push({ ratio: 'div_renta', monto: m })
  }
  // Carga Financiera: (cap·renta − egresos) → max dividendo (UF) → PV (can go negative)
  if (canPV && hasRenta && inv.max_carga_financiera != null) {
    const divUF = (inv.max_carga_financiera * (s.renta as number) - (s.egresos ?? 0)) / (s.valorUF as number)
    const m = calcMaxMonto(s.tasa as number, plazo as number, divUF)
    if (m != null) candidates.push({ ratio: 'carga_financiera', monto: m })
  }
  // Deuda/Precio (LTV): cap·precio (already UF, no PV)
  if (s.precio != null && s.precio > 0 && inv.max_deuda_precio_venta != null) {
    candidates.push({ ratio: 'deuda_precio_venta', monto: inv.max_deuda_precio_venta * s.precio })
  }

  if (candidates.length === 0) return NO_MAX
  const best = candidates.reduce((a, b) => (b.monto < a.monto ? b : a))
  return { maxMontoUF: best.monto, bindingRatio: best.ratio }
}
