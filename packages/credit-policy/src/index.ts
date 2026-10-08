// Public surface of @edictus/credit-policy — the investor credit-policy engine.
// Pure math: investor caps + indicador rows + borrower scalars in → per-investor
// verdict rows (Políticas), máx financiable (análisis inverso), and a "qué
// decirle al cliente" recommendation out. No React, Next, Prisma, S3, or
// persistence coupling. Depends on `@edictus/tables` for the `SummaryRow` type only.
export { buildPoliticas, RATIO_LABEL, RATIO_UNIT } from './buildpoliticas'
export { computeMaxMontoUF } from './buildsimulacion'
export type { SimInputs, MaxResult } from './buildsimulacion'
export { buildRecommendation } from './buildrecommendation'
export type { Recommendation } from './buildrecommendation'
export type {
  PolicyCell, PolicyRatio, PolicyCellState, PolicyRowStatus, PolicyRow, MaxBinding,
} from './politicastypes'
export type { InvestorCaps } from './investortypes'
export { calcDividendo, calcMaxMonto } from './annuity'
