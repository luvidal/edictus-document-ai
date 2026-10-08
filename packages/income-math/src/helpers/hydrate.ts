import { displayCurrencyCompact } from '@edictus/reports'
import { titleCase } from '../titlecase'
import type { RowData } from '@edictus/tables'
import type { BalanceRow, PropiedadRow, VehiculoRow, DeudaRow, InversionRow, SituacionData } from '../types'
import {
  mergeVehiculos, buildDeudasRows, mergeDeudasRows,
  buildPropiedadesFromAvaluos, mergePropiedades,
  buildInversionesRows, mergeInversiones,
  buildBalanceRows, mergeBalances, enrichBalancesWithSocios,
} from './assetmerge'
import {
  createDefaultRows, createDefaultBoletaRows,
  mergeRowsWithApiData, mergeBoletaRowsWithApiData,
} from './rows'

export const formatCurrency = (value: number | undefined | null) => {
  return displayCurrencyCompact(value)
}

const MONTH_NAMES_ES = [
  '', 'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
]

/**
 * Single-line header: `Mon'YY` (e.g. `Ene'25`, `Dic'24`). Year suffix always
 * present so headers stay unambiguous under sticky-header scroll. ASCII
 * apostrophe (U+0027). Pair with a `$amount` suffix at call sites that have
 * a per-month numeric to surface (UTM, total, etc.).
 *
 * `monthIndex` is 1-based (1 = January).
 */
export const formatMonthHeader = (year: number, monthIndex: number): string => {
  const m = MONTH_NAMES_ES[monthIndex] ?? ''
  const yy = String(year % 100).padStart(2, '0')
  return `${m}'${yy}`
}

/**
 * Convenience: format `YYYY-MM` periodo string directly.
 */
export const formatPeriodHeader = (periodo: string): string => {
  if (!periodo) return '—'
  const [y, m] = periodo.split('-').map(Number)
  if (!y || !m) return periodo
  return formatMonthHeader(y, m)
}

export type HydratedState = {
  rows: RowData[]
  boletaRows: RowData[]
  propiedades: PropiedadRow[]
  vehiculos: VehiculoRow[]
  inversiones: InversionRow[]
  balances: BalanceRow[]
  deudas: DeudaRow[]
  excludedBoletaPeriods: string[]
  daiMeses: Record<string, Record<string, number>>
  /** Whether any auto-populated data changed and needs saving */
  savePayload: Record<string, unknown> | null
}

/**
 * State hydration: merges saved analyst edits with fresh file-derived data.
 *
 * Reprocesar is handled at the view level (app/reports/view.tsx + app/reports/reset.ts):
 * it wipes the saved edits in the DB and then each tab refetches. With saved
 * data cleared, this merge naturally degrades to a full rebuild from source
 * files — satisfying the directive without a second code path.
 */
export function hydrateState(
  result: SituacionData,
  ufValue: number | null,
): HydratedState {
  const saveUpdates: Record<string, unknown> = {}

  // Per-company report defaults ride in the payload (resolved server-side in
  // `computeSituacion` / the snapshot loader). Reading them here — rather than
  // from an async client hook — keeps hydration synchronous and raceless;
  // legacy payloads without the fields fall back to the historical globals.
  const factorAvaluo = result.factor_avaluo ?? 2
  const castigo = result.castigo_lineas_tc ?? 0.05

  // The client UF (`useUFValue(ufDate)`) starts `null` and resolves async; the
  // titular hydrate does NOT re-run when it lands, so relying on it alone seeds
  // UF-derived deuda/propiedad values as `null` on first load. The server
  // already computes UF for the same `ufDate` and ships it as `result.uf`, so
  // fall back to it. Codeudores additionally re-hydrate on `ufValue` (see
  // `index.tsx` `codebtorHydrated`), but the fallback keeps their first paint
  // correct too.
  const effectiveUf = ufValue ?? result.uf ?? null

  let rows: RowData[]
  if (result.situacion?.rows && result.months) {
    const savedRows = result.situacion.rows.map((r: RowData) => ({ ...r, label: titleCase(r.label) }))
    rows = mergeRowsWithApiData(savedRows, result.months)
    saveUpdates.rows = rows
  } else if (result.situacion?.rows) {
    rows = result.situacion.rows.map((r: RowData) => ({ ...r, label: titleCase(r.label) }))
  } else if (result.months) {
    rows = createDefaultRows(result.months)
  } else {
    rows = []
  }

  let boletaRows: RowData[]
  if (result.situacion?.boleta_rows && result.boleta_months) {
    const savedBoleta = result.situacion.boleta_rows.map((r: RowData) => ({ ...r, label: titleCase(r.label) }))
    boletaRows = mergeBoletaRowsWithApiData(savedBoleta, result.boleta_months)
    saveUpdates.boleta_rows = boletaRows
  } else if (result.situacion?.boleta_rows) {
    boletaRows = result.situacion.boleta_rows.map((r: RowData) => ({ ...r, label: titleCase(r.label) }))
  } else if (result.boleta_months?.length) {
    boletaRows = createDefaultBoletaRows(result.boleta_months)
  } else {
    boletaRows = []
  }

  // Lazy fetch returns peripheral fields as `undefined` (see
  // `lib/reports/situacion/compute/periferico.ts`). Running the asset/deuda
  // merges in that state would treat "not loaded yet" as "no source files",
  // wiping saved analyst rows on every page mount — and `mergeDeudasRows`
  // collapses to `[]` whenever fresh CMF entries are empty (CMF is sole row
  // authority), persisting the wipe through the auto-save before the second
  // hydrate (post fetchAndMergeSections) can rebuild from the real peripheral
  // data. Skip the merges in lazy mode and pass saved rows through untouched.
  const isLazy = result.informe_deuda === undefined
    && result.padron_vehiculos === undefined
    && result.avaluo_fiscales === undefined
    && result.inversiones_files === undefined
    && result.balance_files === undefined

  let vehiculos: VehiculoRow[]
  let inversiones: InversionRow[]
  let balances: BalanceRow[]
  let propiedades: PropiedadRow[]
  let deudas: DeudaRow[]

  if (isLazy) {
    vehiculos = (result.situacion?.vehiculos || []) as VehiculoRow[]
    inversiones = (result.situacion?.inversiones || []) as InversionRow[]
    balances = (result.situacion?.balances || []) as BalanceRow[]
    propiedades = (result.situacion?.propiedades || []) as PropiedadRow[]
    deudas = (result.situacion?.deudas || []) as DeudaRow[]
  } else {
    const vh = mergeVehiculos(result.situacion?.vehiculos || [], result.padron_vehiculos || [])
    vehiculos = vh.rows
    if (vh.changed) saveUpdates.vehiculos = vh.rows

    const freshInversiones = buildInversionesRows(result.inversiones_files || [])
    const inv = mergeInversiones(result.situacion?.inversiones || [], freshInversiones)
    inversiones = inv.rows
    if (inv.changed) saveUpdates.inversiones = inv.rows

    const freshBalances = buildBalanceRows(result.balance_files || [])
    const titularRut = result.client?.rut || ''
    enrichBalancesWithSocios(freshBalances, result.socios_entries || [], titularRut)
    const bal = mergeBalances(result.situacion?.balances || [], freshBalances)
    balances = bal.rows
    if (bal.changed) saveUpdates.balances = bal.rows

    const freshDeudas = buildDeudasRows(result, effectiveUf, castigo)
    const freshPropiedades = buildPropiedadesFromAvaluos(result.avaluo_fiscales || [], effectiveUf, factorAvaluo)

    const br = mergePropiedades(result.situacion?.propiedades || [], freshPropiedades)
    propiedades = br.rows
    if (br.changed) saveUpdates.propiedades = br.rows

    const savedDeudas = result.situacion?.deudas || []
    deudas = mergeDeudasRows(savedDeudas, freshDeudas)
    if (JSON.stringify(deudas) !== JSON.stringify(savedDeudas)) {
      saveUpdates.deudas = deudas
    }
  }

  // Apply titleCase to all text fields in table rows (covers both saved and fresh data)
  const tcVehiculos = vehiculos.map(v => ({ ...v, marca: titleCase(v.marca), modelo: titleCase(v.modelo) }))
  const tcPropiedades = propiedades.map(p => ({ ...p, direccion: titleCase(p.direccion), comuna: titleCase(p.comuna) }))
  const tcDeudas = deudas.map(d => ({ ...d, institucion: titleCase(d.institucion) }))
  const tcInversiones = inversiones.map(i => ({ ...i, institucion: titleCase(i.institucion), tipo: titleCase(i.tipo) }))
  const tcBalances = balances.map(b => ({ ...b, empresa: titleCase(b.empresa) }))

  return {
    rows,
    boletaRows,
    propiedades: tcPropiedades,
    vehiculos: tcVehiculos,
    inversiones: tcInversiones,
    balances: tcBalances,
    deudas: tcDeudas,
    excludedBoletaPeriods: result.situacion?.excluded_boleta_periods ?? [],
    daiMeses: result.situacion?.dai_meses ?? {},
    savePayload: Object.keys(saveUpdates).length > 0 ? saveUpdates : null,
  }
}

/**
 * Overlay `hydrateState`'s asset/deuda rows onto `data.situacion`, returning a
 * new `SituacionData` whose `situacion.{propiedades,vehiculos,inversiones,balances,deudas}`
 * reflect file-derived merges (CMF, padron, avalúo, inversiones, balances).
 *
 * Shared dataset for read-only consumers (Resumen tab, Informe print). With
 * this helper, every consumer that
 * renders `situacion.{deudas,propiedades,vehiculos,inversiones,balances}`
 * funnels through one pipeline so the printed informe and the live Resumen
 * column read the same numbers.
 *
 * Income-side fields (`rows`, `boleta_rows`, `excluded_boleta_periods`,
 * `dai_meses`) are NOT overlaid — those remain authoritative on the raw
 * `situacion` payload (Situacion's controllers own analyst edits and would
 * race the overlay during in-flight saves). Asset/deuda rows are file-derived,
 * so the merge cannot lose analyst edits — `mergeVehiculos/Propiedades/etc.`
 * already preserve `sourceFileId`-less rows.
 */
export function mergeHydratedIntoData(data: SituacionData, hydrated: HydratedState): SituacionData {
  return {
    ...data,
    situacion: {
      ...(data.situacion ?? {}),
      propiedades: hydrated.propiedades,
      vehiculos: hydrated.vehiculos,
      inversiones: hydrated.inversiones,
      balances: hydrated.balances,
      deudas: hydrated.deudas,
    },
  }
}
