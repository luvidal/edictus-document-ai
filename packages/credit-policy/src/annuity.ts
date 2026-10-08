// Pure annuity math — the PMT/PV pair the credit-policy "análisis inverso" uses.
// Moved out of the host's `components/credit/types.ts` (which now re-exports these from
// this package so the credit badge + `indicadores.ts` keep importing
// `@/components/credit/types` unchanged). No React / DOM / persistence coupling.

/**
 * Monthly mortgage payment (dividendo) using the PMT formula.
 * Formula: =-PMT((1+tasa)^(1/12)-1, plazo*12, monto, 0)
 */
export function calcDividendo(tasa?: number, plazo?: number, monto?: number): number | undefined {
  if (tasa === undefined || plazo === undefined || monto === undefined) return undefined
  if (tasa === 0 || plazo === 0 || monto === 0) return undefined
  const monthlyRate = Math.pow(1 + tasa / 100, 1 / 12) - 1
  const nPayments = plazo * 12
  const dividendo = (monto * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -nPayments))
  return Math.round(dividendo * 100) / 100
}

/**
 * Inverse of `calcDividendo`: the loan amount (monto) whose dividendo equals
 * the given monthly payment — present value of the annuity. Used by the
 * Políticas "análisis inverso" (max financiable per investor).
 * Formula: =PV((1+tasa)^(1/12)-1, plazo*12, dividendo). A negative dividendo
 * (existing debt service already over the cap) yields a NEGATIVE monto — surfaced
 * as-is, mirroring `politicas.numbers` (no clamp); the caller decides how to show it.
 */
export function calcMaxMonto(tasa?: number, plazo?: number, dividendo?: number): number | undefined {
  if (tasa === undefined || plazo === undefined || dividendo === undefined) return undefined
  if (tasa === 0 || plazo === 0) return undefined
  const monthlyRate = Math.pow(1 + tasa / 100, 1 / 12) - 1
  const nPayments = plazo * 12
  const monto = (dividendo * (1 - Math.pow(1 + monthlyRate, -nPayments))) / monthlyRate
  return Math.round(monto * 100) / 100
}
