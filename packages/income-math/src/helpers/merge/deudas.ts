import type { DeudaRow, DeudaFileEntry, SituacionData } from '../../types'
import { titleCase } from '../../titlecase'
import { pesosToUf, normalizeEntidad, normalizeTipo } from './shared'

// DIRECTIVE: Bank docs (deuda-*) enrich CMF rows — real cuota replaces 5% estimate.
// CMF is the sole row authority when it has entries — bank docs match by
// (entidad, tipo) and are otherwise ignored (accessible via the Eye icon).
// Empty-data exception: when CMF returns zero entries (extract failure or
// genuine no-debt borrower) but the analyst uploaded bank docs, surface
// those bank docs as standalone rows so the report doesn't silently swallow
// real debt data. "Don't replace good data with empty data."
// Precedence within a CMF-authored row: analyst manual edit > bank doc cuota
// > CMF saldo * castigo estimate. Match key: normalizeEntidad(entidad) +
// normalizeTipo(tipo). Strict only, no fuzzy.

/**
 * Build deudas rows from CMF informe-deuda entries, enriched with bank doc data
 * (deuda-consumo/hipotecaria/comercial) for cuota and cuotas fields.
 * Bank docs that don't match a CMF row are ignored when CMF has entries;
 * when CMF is empty, bank docs become the source of rows.
 */
export const buildDeudasRows = (
  data: SituacionData,
  ufValue: number | null,
  castigo = 0.05
): DeudaRow[] => {
  const cmfEntries = data.informe_deuda?.entries || []
  const deudaFiles = data.deuda_files || []

  const toCLP = (value: number | null, moneda?: string): number | null => {
    if (value == null) return null
    if (moneda?.toUpperCase() === 'UF' && ufValue) return Math.round(value * ufValue)
    return value
  }

  // Fallback: CMF empty but bank docs present → bank docs become rows.
  if (cmfEntries.length === 0 && deudaFiles.length > 0) {
    const tipoFromDoctype: Record<string, string> = {
      hipotecario: 'Hipotecaria',
      consumo: 'Consumo',
      comercial: 'Comercial',
    }
    return deudaFiles.map((df, i) => {
      const saldoPesos = toCLP(df.saldo, df.moneda)
      const cuotaPesos = toCLP(df.cuota, df.moneda)
      const hasBankCuota = cuotaPesos != null
      return {
        id: `dc_${i}`,
        institucion: titleCase(df.entidad || ''),
        tipo_deuda: tipoFromDoctype[df.tipoDeuda ?? ''] ?? 'Consumo',
        saldo_deuda_pesos: saldoPesos,
        saldo_deuda_uf: pesosToUf(saldoPesos, ufValue),
        monto_cuota: hasBankCuota
          ? cuotaPesos
          : (saldoPesos !== null ? Math.round(saldoPesos * castigo) : null),
        cuota_estimated: !hasBankCuota,
        castigo_pct: hasBankCuota ? undefined : castigo,
        cuota_source_file_id: df.sourceFileId,
        cuotas_pagadas: df.cuotas_pagadas ?? null,
        cuotas_total: df.cuotas_totales ?? null,
        sourceFileId: df.sourceFileId,
      }
    })
  }

  // Index bank docs by strict key: normalizeEntidad + normalizeTipo
  const filesByKey = new Map<string, DeudaFileEntry[]>()
  for (const df of deudaFiles) {
    if (!df.entidad) continue
    const key = `${normalizeEntidad(df.entidad)}:${normalizeTipo(df.tipoDeuda ?? '')}`
    if (!filesByKey.has(key)) filesByKey.set(key, [])
    filesByKey.get(key)!.push(df)
  }

  return cmfEntries.map((e, i) => {
    const saldoPesos = e.vigente ?? null
    const tipoDeuda = e.tipo || 'Consumo'

    // Strict match only — no fuzzy, no substring
    const key = `${normalizeEntidad(e.entidad || '')}:${normalizeTipo(tipoDeuda)}`
    const matched = filesByKey.get(key)?.shift() ?? null

    const bankCuota = toCLP(matched?.cuota ?? null, matched?.moneda)
    const hasBankCuota = bankCuota != null

    return {
      id: `dc_${i}`,
      institucion: titleCase(e.entidad || ''),
      tipo_deuda: tipoDeuda,
      saldo_deuda_pesos: saldoPesos,
      saldo_deuda_uf: pesosToUf(saldoPesos, ufValue),
      monto_cuota: hasBankCuota
        ? bankCuota
        : (saldoPesos !== null ? Math.round(saldoPesos * castigo) : null),
      cuota_estimated: !hasBankCuota,
      castigo_pct: hasBankCuota ? undefined : castigo,
      cuota_source_file_id: hasBankCuota ? matched!.sourceFileId : '__respaldos__',
      cuotas_pagadas: matched?.cuotas_pagadas ?? null,
      cuotas_total: matched?.cuotas_totales ?? null,
      sourceFileId: e.sourceFileId,
    }
  })
}

/**
 * Merge fresh CMF-built deuda rows with saved analyst edits.
 * CMF saldo always wins; analyst-entered cuota/cuotas are preserved.
 * Bank doc cuota beats estimate; analyst manual edit beats bank doc.
 *
 * CMF is row authority for file-derived rows: saved rows that carry a
 * `sourceFileId` only exist while their CMF/bank entry does, so they are
 * dropped once that entry leaves `fresh` (Vaciar / delete).
 *
 * Analyst-added rows carry NO `sourceFileId` — the merge can't reconstruct
 * them from any file, so they are always preserved, whether `fresh` is empty
 * or not. This mirrors the asset merges' "rows without `sourceFileId` are
 * analyst-added, always preserved" invariant. Without this, re-running the
 * merge over a person's own edits (codeudor edit re-hydrate, titular reload)
 * silently dropped a just-added manual row.
 */
export function mergeDeudasRows(
  saved: DeudaRow[],
  fresh: DeudaRow[]
): DeudaRow[] {
  const manualRows = saved.filter(s => !s.sourceFileId)
  if (fresh.length === 0) return manualRows
  if (saved.length === 0) return fresh

  const savedByKey = new Map<string, DeudaRow[]>()
  for (const s of saved) {
    const key = `${normalizeEntidad(s.institucion)}:${normalizeTipo(s.tipo_deuda)}`
    if (!savedByKey.has(key)) savedByKey.set(key, [])
    savedByKey.get(key)!.push(s)
  }

  const merged = fresh.map(f => {
    const key = `${normalizeEntidad(f.institucion)}:${normalizeTipo(f.tipo_deuda)}`
    const arr = savedByKey.get(key)
    const s = arr?.shift() ?? null
    if (!s) return f

    // Analyst manual edit (saved non-estimated) always wins over everything
    const analystOverride = !s.cuota_estimated && s.monto_cuota != null
    // Fresh has real bank cuota and saved was just an estimate → fresh wins
    const bankBeatsEstimate = !f.cuota_estimated && (s.cuota_estimated ?? true)

    const useSavedCuota = analystOverride
    const useFreshCuota = bankBeatsEstimate && !analystOverride

    const savedCastigo = f.cuota_estimated && s.castigo_pct != null ? s.castigo_pct : undefined
    const castigoMerged = savedCastigo ?? f.castigo_pct
    const cuotaRecomputed = savedCastigo != null && f.saldo_deuda_pesos != null
      ? Math.round(f.saldo_deuda_pesos * savedCastigo) : null

    return {
      ...f,
      monto_cuota: useSavedCuota ? s.monto_cuota
        : useFreshCuota ? f.monto_cuota
        : (cuotaRecomputed ?? f.monto_cuota ?? s.monto_cuota),
      cuota_estimated: (useSavedCuota || useFreshCuota) ? false : f.cuota_estimated,
      castigo_pct: (useSavedCuota || useFreshCuota) ? undefined : castigoMerged,
      cuotas_pagadas: f.cuotas_pagadas ?? s.cuotas_pagadas,
      cuotas_total: f.cuotas_total ?? s.cuotas_total,
      cuota_source_file_id: useSavedCuota
        ? (s.cuota_source_file_id ?? f.cuota_source_file_id)
        : f.cuota_source_file_id,
    }
  })

  // Analyst-added rows that matched a fresh CMF row by (entidad, tipo) were
  // already consumed via `shift()` above; whatever is left in `savedByKey` is
  // unmatched. Append the unmatched analyst-added ones (no `sourceFileId`) so a
  // manual row that doesn't correspond to any CMF entry is never dropped.
  const unmatchedManual: DeudaRow[] = []
  for (const arr of savedByKey.values()) {
    for (const s of arr) if (!s.sourceFileId) unmatchedManual.push(s)
  }
  return [...merged, ...unmatchedManual]
}
