import { titleCase } from '../titlecase'
import type { RowData } from '@edictus/tables'
import { resolveLabel, type NormalizeFieldConfig } from '@edictus/extract/normalize'
import { resolveLabelToCanonicalId } from '@edictus/extract/liquidacion/resolve'
import { doctypesCatalog as doctypes } from '@edictus/doctypes'
import type { LineItem, MonthData } from '../types'

// `RowData` from @edictus/tables doesn't (yet) type canonicalId. We thread it as
// an extra field so saved/fresh reconciliation can match arbiter-promoted rows
// across reloads — the arbiter assigns canonicalIds for labels that are NOT
// lexicon aliases (e.g. "Bono Venta" → comisiones), so the label-based
// `resolveLabelToCanonicalId` fallback can't recover them once the row is
// persisted to report_data. JSON.stringify preserves the extra field.
type RowDataWithCanonical = RowData & { canonicalId?: string }

// Pull the liquidaciones-sueldo normalize block at module load. The satellite
// owns the rules; we only borrow the algorithm to compute dedup keys that
// agree with the satellite's display-side rewrite (so already-stored ai_fields
// — which were extracted before the block existed — still collapse correctly).
const LIQUIDACIONES_NORMALIZE = (doctypes as Record<string, { normalize?: Record<string, NormalizeFieldConfig> }>)['liquidaciones-sueldo']?.normalize ?? {}
const HABERES_CFG: NormalizeFieldConfig = LIQUIDACIONES_NORMALIZE['haberes[].label'] ?? {}
const DESCUENTOS_CFG: NormalizeFieldConfig = LIQUIDACIONES_NORMALIZE['descuentos[].label'] ?? {}
const cfgFor = (type: 'income' | 'deduction'): NormalizeFieldConfig =>
  type === 'income' ? HABERES_CFG : DESCUENTOS_CFG

/** Create default rows from API month data (dynamic line items).
 *  Items are keyed by `canonicalId ?? resolveLabel(label, doctype-config)`.
 *  Those keyspaces are independent: a canonical-stamped row may use a lexicon
 *  id like `sueldo_base`, while a legacy fallback row with the same display
 *  label resolves to `sueldo base`. React ids include the resolved key so
 *  same-label rows from different keyspaces cannot collide.
 *
 *  Rows only collapse when their computed keys actually match. Fallback rows
 *  still use `resolveLabel` so parametric tails / synonyms / accent variants
 *  collapse for legacy `ai_fields`, non-`liquidaciones-sueldo` doctypes, and
 *  collision losers whose `canonicalId` was intentionally stripped.
 *
 *  Per-month collisions (two raw labels in one month resolving to the same
 *  fallback key) still fall back to raw-label keying so no value is silently
 *  dropped — important for cases like AFP worker contribution + AFP
 *  commission, where the satellite already emits the loser without
 *  `canonicalId` and we additionally guard the fallback-key path. */
export const createDefaultRows = (months: MonthData[]): RowData[] => {
  const resolved = (item: LineItem) => resolveLabel(item.label, cfgFor(item.type))
  const identityKey = (item: LineItem) => item.canonicalId || resolved(item).key
  const rawCollisionKey = (item: LineItem) => `${item.type}:${item.label}`

  // First pass: detect per-month key collisions and remember which raw labels
  // must fall back to raw-label keying to preserve values. `canonicalId` and
  // `resolveLabel` fallback keys are independent; React ids later include the
  // resolved key so same-label rows from different keyspaces stay distinct.
  const collidingFallbackRawLabels = new Set<string>()
  for (const m of months) {
    if (!m.items) continue
    const seenInMonth = new Map<string, { label: string; hasCanonicalId: boolean }>() // composite key → first row
    for (const item of m.items) {
      const typedKey = `${item.type}:${identityKey(item)}`
      const prev = seenInMonth.get(typedKey)
      if (prev && prev.label !== item.label) {
        if (!prev.hasCanonicalId) collidingFallbackRawLabels.add(`${item.type}:${prev.label}`)
        if (!item.canonicalId) collidingFallbackRawLabels.add(rawCollisionKey(item))
      } else if (!prev) {
        seenInMonth.set(typedKey, { label: item.label, hasCanonicalId: !!item.canonicalId })
      }
    }
  }

  const resolveSafe = (item: LineItem): { key: string; display: string } => {
    if (!item.canonicalId && collidingFallbackRawLabels.has(rawCollisionKey(item))) {
      return { key: `raw:${item.label.toLowerCase()}`, display: item.label }
    }
    if (item.canonicalId) return { key: item.canonicalId, display: item.label }
    return resolved(item)
  }

  // Map<typed key, first-seen display label>
  const incomeKeys = new Map<string, string>()
  const deductionKeys = new Map<string, string>()

  for (const m of months) {
    if (!m.items) continue
    for (const item of m.items) {
      const map = item.type === 'income' ? incomeKeys : deductionKeys
      const { key, display } = resolveSafe(item)
      if (!map.has(key)) map.set(key, display)
    }
  }

  const rows: RowData[] = []

  const buildRow = (type: 'income' | 'deduction', key: string, canonicalLabel: string): RowDataWithCanonical => {
    const values: Record<string, number | null> = {}
    let seedItem: LineItem | undefined
    for (const m of months) {
      const item = m.items?.find(i => i.type === type && resolveSafe(i).key === key)
      if (item) {
        values[m.periodo] = item.value
        if (!seedItem) seedItem = item
      }
    }
    return {
      id: `default_${type}_${canonicalLabel}_${key}`,
      label: titleCase(canonicalLabel),
      type,
      values,
      isDefault: true,
      ...(seedItem?.tipoRenta === 'Variable' && { isVariable: true }),
      ...(seedItem?.naturaleza && { naturaleza: seedItem.naturaleza }),
      ...((seedItem as any)?.legalType && { legalType: (seedItem as any).legalType }),
      ...(seedItem?.canonicalId && { canonicalId: seedItem.canonicalId }),
    }
  }

  for (const [key, canonical] of incomeKeys) rows.push(buildRow('income', key, canonical))
  for (const [key, canonical] of deductionKeys) rows.push(buildRow('deduction', key, canonical))

  return rows
}

/** Create default rows from boleta month data (transposed: metrics as rows, months as columns) */
export const createDefaultBoletaRows = (months: MonthData[]): RowData[] => {
  const brutoValues: Record<string, number | null> = {}
  const retencionValues: Record<string, number | null> = {}

  for (const m of months) {
    if (m.hasData) {
      brutoValues[m.periodo] = m.bruto ?? null
      retencionValues[m.periodo] = m.retencion ?? null
    }
  }

  return [
    {
      id: 'default_income_honorario_bruto',
      label: 'Honorario Bruto',
      type: 'income',
      values: brutoValues,
      isDefault: true,
    },
    {
      id: 'default_deduction_retencion',
      label: 'Retención',
      type: 'deduction',
      values: retencionValues,
      isDefault: true,
    },
  ]
}

/**
 * Merge saved rows with fresh rows.
 * Rule: fill null/missing values from API; never overwrite user-entered values.
 * Match saved → fresh by:
 *   1. exact id, or
 *   2. same `type` AND both rows carry the same explicit `canonicalId` field —
 *      catches arbiter-promoted rows whose raw labels are NOT lexicon aliases
 *      (e.g. saved `Bono Venta` (canonicalId=`comisiones`) ↔ fresh `Comisión`
 *      (canonicalId=`comisiones`)). The label-based `resolveLabelToCanonicalId`
 *      fallback below cannot recover this — by construction the arbiter only
 *      fires for labels the lexicon doesn't recognize. The canonicalId field
 *      is preserved through report_data persistence (JSON keeps extra keys).
 *   3. case-insensitive `label` + `type`, or
 *   4. same `type` AND `resolveLabel(label, cfgFor(type)).key` agree — catches
 *      doctype-normalize-block synonyms (e.g. `Asignación Colación → Colación`,
 *      `Salud 7% → Cotiz. Salud Obligatoria`), or
 *   5. same `type` AND both labels resolve to the same lexicon `canonicalId` —
 *      legacy bridge for pre-cutover saved rows that lack the canonicalId
 *      field (e.g. saved `AFP` ↔ fresh `Cotiz. Previsional Obligatoria`, both
 *      resolving to `afp_cotizacion_obligatoria` via the alias index).
 *
 * Saved rows with no fresh match are kept as-is, so analyst-entered data is
 * never dropped.
 */
const rowKey = (row: RowData): string | null => {
  if (row.type !== 'income' && row.type !== 'deduction') return null
  return resolveLabel(row.label, cfgFor(row.type)).key
}

const canonicalIdFor = (row: RowData): string | null => {
  if (row.type !== 'income' && row.type !== 'deduction') return null
  return resolveLabelToCanonicalId(row.label, row.type)
}

const explicitCanonicalId = (row: RowData): string | null => {
  const cid = (row as RowDataWithCanonical).canonicalId
  return typeof cid === 'string' && cid.length > 0 ? cid : null
}

const matches = (a: RowData, b: RowData): boolean => {
  if (a.id === b.id) return true
  if (a.type !== b.type) return false
  const cidExplicitA = explicitCanonicalId(a)
  const cidExplicitB = explicitCanonicalId(b)
  if (cidExplicitA !== null && cidExplicitA === cidExplicitB) return true
  if (a.label.toLowerCase() === b.label.toLowerCase()) return true
  const ka = rowKey(a)
  const kb = rowKey(b)
  if (ka !== null && ka === kb) return true
  const cidA = cidExplicitA ?? canonicalIdFor(a)
  const cidB = cidExplicitB ?? canonicalIdFor(b)
  return cidA !== null && cidA === cidB
}

const mergeRowsWithFreshData = (savedRows: RowData[], freshRows: RowData[]): RowData[] => {
  const merged: RowData[] = []

  for (const saved of savedRows) {
    const match = freshRows.find(fr => matches(fr, saved))
    if (match) {
      const mergedValues = { ...saved.values }
      for (const [periodo, apiValue] of Object.entries(match.values)) {
        const savedValue = mergedValues[periodo]
        if ((savedValue === null || savedValue === undefined) && apiValue != null) {
          mergedValues[periodo] = apiValue
        }
      }
      const backfill: Partial<RowDataWithCanonical> = {}
      if (!saved.naturaleza && match.naturaleza) backfill.naturaleza = match.naturaleza
      if (!(saved as any).legalType && (match as any).legalType) (backfill as any).legalType = (match as any).legalType
      if (saved.isVariable === undefined && match.isVariable !== undefined) backfill.isVariable = match.isVariable
      const savedCid = explicitCanonicalId(saved)
      const matchCid = explicitCanonicalId(match)
      if (!savedCid && matchCid) backfill.canonicalId = matchCid
      merged.push({ ...saved, ...backfill, values: mergedValues })
    } else {
      merged.push(saved)
    }
  }

  for (const fresh of freshRows) {
    const exists = savedRows.some(sr => matches(sr, fresh))
    if (!exists) {
      merged.push(fresh)
    }
  }

  return merged
}

export const mergeRowsWithApiData = (savedRows: RowData[], months: MonthData[]): RowData[] => {
  return mergeRowsWithFreshData(savedRows, createDefaultRows(months))
}

export const mergeBoletaRowsWithApiData = (savedRows: RowData[], months: MonthData[]): RowData[] => {
  return mergeRowsWithFreshData(savedRows, createDefaultBoletaRows(months))
}
