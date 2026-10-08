// Public surface of @edictus/income-math — the Situación report math.
// Pure math: liquidación/boleta rows + reference dates + saved analyst edits in
// → IUSC/reliquidación, hydrated per-person report state, and asset/deuda/
// balance merges out. No React, Next, Prisma, S3, or persistence coupling — a
// caller passes loose host-shaped objects and gets plain data back.
//
// Depends (types + a little runtime) on sibling satellites: @edictus/tables
// (row shapes), @edictus/extract (liquidación lexicon + label normalization),
// @edictus/doctypes (catalog), @edictus/reports (currency/title formatting).
// The Chilean tax tables (previred, global complementario) are bundled from
// src/data.

// --- pure DTOs (canonical home) ---
export type {
  TipoRenta, Naturaleza, LegalType, LabelValue, LineItem, CedulaInfo, MonthData,
  DeudaFileEntry, BalancePrePopRow, SociosEntry, CarpetaDomicilio, InversionPrePopRow,
} from './dtos'
export { BANK_ACCOUNT_PATTERN } from './dtos'

// --- domain row types ---
export type { VehiculoRow, InversionRow, PropiedadRow, DeudaRow } from './rowtypes'
export type { BalanceRow } from '@edictus/tables'

// --- report envelope types (types.ts owns these) ---
export type {
  ResumenSummary, SituacionEdits, InformeDeudaEntry, CreditoDisponibleEntry, InformeDeuda,
  PerfilOverrides, CreditData, DeclaracionRenta, CotizacionesAfpData, AvaluoFiscalRow, SituacionData,
} from './types'

// --- reliquidación / IUSC (income-tax math) ---
export * from './reliquidacion'

// --- hydration + row-default + summary helpers ---
export * from './helpers'

// --- asset/deuda/balance merges (assetmerge re-exports all of ./merge) ---
export * from './helpers/assetmerge'
