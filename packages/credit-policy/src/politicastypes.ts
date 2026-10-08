// Políticas de Crédito shared types. Package-owned so consumers (the host's
// decision-audit freeze `lib/reports/freezesnapshot.ts`, the Resumen tab, the
// Informe PDF block) reference `PolicyRow` without reaching into the runtime.

export type PolicyCellState = 'pass' | 'fail' | 'missing-cap' | 'missing-value'

export type PolicyRatio = 'div_renta' | 'carga_financiera' | 'deuda_precio_venta' | 'edad_plazo'

/** Constraint that produced the `Máx.` — Edad+Plazo is a verdict, never a term. */
export type MaxBinding = 'div_renta' | 'carga_financiera' | 'deuda_precio_venta'

export interface PolicyCell {
  ratio: PolicyRatio
  /** Client-side computed value (e.g. dividendo/renta) — null when not computable. */
  clientValue: number | null
  /** Investor max-cap for this ratio — null when not configured. */
  cap: number | null
  state: PolicyCellState
}

export type PolicyRowStatus = 'compliant' | 'incomplete' | 'noncompliant'

export interface PolicyRow {
  investorId: string
  investorName: string
  status: PolicyRowStatus
  cells: PolicyCell[]
  /** Sum of `(cap - clientValue)` across `pass` cells — sort key for compliant tier. */
  marginSum: number
  /** Count of `fail` cells — sort key for noncompliant tier. */
  failingCount: number
  /** Máx. financiable (UF) — análisis inverso. `null` when not computable. */
  maxMontoUF: number | null
  /** Constraint that produced the max — for the "limita" hint. `null` when no max. */
  bindingRatio: MaxBinding | null
}
