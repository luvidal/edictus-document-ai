import type { RowData, BalanceRow } from '@edictus/tables'

// Domain row types live in the host — re-export for backward compat
import type { PropiedadRow, VehiculoRow, InversionRow, DeudaRow } from './rowtypes'
export type { PropiedadRow, VehiculoRow, InversionRow, DeudaRow }
export type { BalanceRow }
import type { CedulaInfo, MonthData, DeudaFileEntry, InversionPrePopRow, BalancePrePopRow, SociosEntry, CarpetaDomicilio } from './dtos'

// Canonical DTOs owned by this math layer (`./dtos`) — re-export for local
// consumers. `Naturaleza`/`LegalType` resolve through
// `@edictus/extract/liquidacion/types` (browser-safe, types-only subpath).
export type { Naturaleza, LegalType, CedulaInfo, LineItem, MonthData, DeudaFileEntry } from './dtos'

export type ResumenSummary = {
  renta_fija: number | null
  renta_variable: number | null
  honorarios: number | null
  retiros: number | null
  pie_cancelado: number | null
  saldo_cta_cte: number | null
}

export type SituacionEdits = {
  rows?: RowData[]
  boleta_rows?: RowData[]
  propiedades?: PropiedadRow[]
  vehiculos?: VehiculoRow[]
  inversiones?: InversionRow[]
  balances?: BalanceRow[]
  deudas?: DeudaRow[]
  titular_label?: string
  codebtor_labels?: Record<string, string>
  resumen_summary?: ResumenSummary
  resumen_castigos?: Record<string, number>
  resumen_overrides?: Record<string, number>
  excluded_boleta_periods?: string[]
  edited_cells?: string[]
  dai_meses?: Record<string, Record<string, number>>      // codeKey → yearKey → months
}

export type InformeDeudaEntry = {
  id: string
  entidad: string
  tipo: string
  deuda_total: number | null
  vigente: number | null
  atraso_30_59?: number | null
  atraso_60_89?: number | null
  atraso_90_mas?: number | null
  sourceFileId?: string
}

export type CreditoDisponibleEntry = {
  id: string
  entidad: string
  directos: number
  indirectos: number
}

export type InformeDeuda = {
  fileId: string
  rut: string
  nombre: string
  deuda_total: number
  fecha_informe: string
  entries: InformeDeudaEntry[]
  indirecta_entries?: InformeDeudaEntry[]
  lineas_credito_entries?: CreditoDisponibleEntry[]
  otros_creditos_entries?: CreditoDisponibleEntry[]
  lineas_credito_directos?: number | null
  lineas_credito_indirectos?: number | null
}

export type PerfilOverrides = {
  overrides?: Record<string, string>
}

export type CreditData = {
  precio?: number
  pie?: number
  subsidio?: number
  monto?: number
  plazo?: number
  tasa?: number
  seguro_desgravamen?: number
  seguro_incendio?: number
  seguro_cesantia?: number
  valor_tasacion?: number
}

export type DeclaracionRenta = {
  año_tributario: number
  codes: Record<string, number | null>
  sourceFileId?: string
}

export type CotizacionesAfpData = {
  file_id: string
  afp: string | null
  meses_laguna: number
  lagunas_largas: number
  empleador_anterior: number | null
}

export type AvaluoFiscalRow = {
  id: string
  direccion: string
  comuna: string
  valor_pesos: number | null
  rol?: string
  destino?: string
  run_registrado?: string
  nombre_registrado?: string
  porcentaje_derecho?: number | null
  avaluo_exento?: number | null
  avaluo_afecto?: number | null
  sourceFileId?: string
}

export type SituacionData = {
  requestId: string
  label: string
  type: 'rentas' | 'boletas' | null
  client: { nombre: string; rut: string } | null
  cedula: CedulaInfo | null
  months: MonthData[]
  summary: any
  boleta_months?: MonthData[]
  boleta_summary?: any
  situacion?: SituacionEdits
  perfil?: PerfilOverrides
  informe_deuda?: InformeDeuda | null
  deuda_files?: DeudaFileEntry[] | null
  respaldo_file_ids?: string[] | null
  padron_vehiculos?: VehiculoRow[] | null
  avaluo_fiscales?: AvaluoFiscalRow[] | null
  inversiones_files?: InversionPrePopRow[] | null
  balance_files?: BalancePrePopRow[] | null
  socios_entries?: SociosEntry[] | null
  carpeta_domicilio?: CarpetaDomicilio | null
  cotizaciones_afp?: CotizacionesAfpData | null
  declaraciones_renta?: DeclaracionRenta[] | null
  credit?: CreditData | null
  has_codebtor?: boolean
  codebtor_count?: number
  codebtor_requestids?: string[]
  source_files?: Record<string, string[]>
  /** Whether liquidaciones-sueldo is required for this request */
  requires_rentas?: boolean
  /** Whether resumen-boletas-sii is required for this request */
  requires_boletas?: boolean
  /** UTM values per period for reliquidación (e.g. {'2025-09': 69265}) */
  utmMap?: Record<string, number>
  /** Current UF value in pesos */
  uf?: number
  /**
   * Effective per-company report defaults, resolved server-side (company
   * override ?? global). Read by `hydrateState`; absent on legacy payloads,
   * which fall back to the global defaults.
   */
  factor_avaluo?: number
  castigo_lineas_tc?: number
  /**
   * Liquidaciones the report intentionally discarded (out-of-window /
   * negative-net / outlier), collected while computing this person's report.
   * Surfaced as a warning above the renta section. Empty/absent → no warning.
   */
  sanitizer_drops?: { fileId: string; field: string | null; action: string; message: string }[]
}
