import type { PolicyRow, PolicyRatio } from './buildpoliticas'

/**
 * Fast "qué decirle al cliente" answer derived from the Políticas rows: the most
 * the borrower can finance today, and — when nobody covers the requested loan —
 * the cheapest salary-only path to it. Salary moves the income ratios (Carga,
 * Div/Renta) only; an investor that also fails LTV or Edad is a "cheaper house /
 * shorter term" case, not a codeudor case, and is dropped from the salary path.
 */
export interface Recommendation {
  solicitado: number
  /** Investors that approve the full requested loan. */
  covers: string[]
  /** Best max financiable today (UF) + its investor. `null` when none computable. */
  deudaMaxima: { uf: number; investor: string } | null
  /** Cheapest salary-only path: extra monthly renta (CLP) + the investor it unlocks. */
  sueldoExtra: { clp: number; investor: string } | null
}

const cell = (row: PolicyRow, ratio: PolicyRatio) => row.cells.find(c => c.ratio === ratio)

export function buildRecommendation(
  rows: PolicyRow[],
  renta: number | null,
  solicitado: number | null,
): Recommendation | null {
  if (!rows.length || solicitado == null || solicitado <= 0) return null

  const covers = rows.filter(r => r.status === 'compliant').map(r => r.investorName)

  const withMax = rows.filter(r => r.maxMontoUF != null)
  const best = withMax.length
    ? withMax.reduce((a, b) => ((b.maxMontoUF as number) > (a.maxMontoUF as number) ? b : a))
    : null
  const deudaMaxima = best ? { uf: best.maxMontoUF as number, investor: best.investorName } : null

  // Salary only helps when nobody covers yet AND the borrower can earn into it.
  let sueldoExtra: Recommendation['sueldoExtra'] = null
  if (covers.length === 0 && renta != null && renta > 0) {
    const options: { clp: number; investor: string }[] = []
    for (const row of rows) {
      if (row.status === 'compliant') continue
      // Salary can't move LTV or Edad — skip rows blocked on those (structural).
      if (cell(row, 'deuda_precio_venta')?.state === 'fail' || cell(row, 'edad_plazo')?.state === 'fail') continue
      // renta needed to bring each income ratio to its cap = renta × (clientValue / cap).
      const factors: number[] = []
      for (const ratio of ['div_renta', 'carga_financiera'] as PolicyRatio[]) {
        const c = cell(row, ratio)
        if (c && c.clientValue != null && c.cap != null && c.cap > 0) factors.push(c.clientValue / c.cap)
      }
      if (!factors.length) continue
      const factor = Math.max(...factors)
      if (factor <= 1) continue // already within the income caps
      options.push({ clp: renta * (factor - 1), investor: row.investorName })
    }
    if (options.length) sueldoExtra = options.reduce((a, b) => (b.clp < a.clp ? b : a))
  }

  return { solicitado, covers, deudaMaxima, sueldoExtra }
}
