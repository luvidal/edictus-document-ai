import type { VehiculoRow } from '../../types'

export const pesosToUf = (pesos: number | null, ufValue: number | null) =>
  pesos != null && ufValue ? Math.round((pesos / ufValue) * 100) / 100 : null

export const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '')

/** Canonical tipo for matching: hipotecario/hipotecaria/vivienda → 'hipotecaria' */
const TIPO_CANON: Record<string, string> = {
  hipotecario: 'hipotecaria', hipotecaria: 'hipotecaria', vivienda: 'hipotecaria',
  consumo: 'consumo', comercial: 'comercial',
}
export const normalizeTipo = (tipo: string): string =>
  TIPO_CANON[normalize(tipo)] ?? normalize(tipo)

/** Normalize bank name: strip "Banco ", "-Chile", lowercase, collapse whitespace. */
export const normalizeEntidad = (name: string): string =>
  name.toLowerCase().replace(/^banco\s+/i, '').replace(/[\s-]*chile$/i, '').replace(/\s+/g, '')

/**
 * File-scoped merge — the invariant that keeps `Vaciar Solicitud` + re-uploads
 * consistent across every asset table.
 *
 * The stable identity of a file-sourced row is (sourceFileId, position within
 * that file's rows). AI extraction order is deterministic, so pairing by
 * position inside a sourceFileId bucket lets an analyst edit ANY column —
 * including the content-key columns (marca/modelo, monto, direccion…) — and
 * still have the saved value win on the next hydrate.
 *
 * Rules:
 *   - A saved row's `sourceFileId` is first a PRUNE signal: if its file is no
 *     longer linked, the row is dropped.
 *   - For each fresh row with `sourceFileId`, take the next saved row from the
 *     same file's bucket (FIFO). Saved wins (carries analyst edits). The fresh
 *     `sourceFileId` is restamped on the returned row.
 *   - Fresh rows with no matching bucket entry fall through to a content-key
 *     lookup against analyst-added / legacy saved rows (migration path).
 *   - Saved rows with NO `sourceFileId` are analyst-added; always kept.
 *   - Saved file-sourced rows the walk never consumed are stale extractions
 *     (AI re-ran on the file and produced fewer rows) — dropped; fresh wins.
 *
 * `changed` is true when the merged list differs from saved in length or per-
 * slot identity, triggering the auto-save cascade.
 */
export function pruneAndMergeBySource<T extends { sourceFileId?: string }>(
  saved: T[],
  fresh: T[],
  contentKey: (v: T) => string,
): { rows: T[]; changed: boolean } {
  const freshFileIds = new Set(
    fresh.map(r => r.sourceFileId).filter((id): id is string => !!id),
  )

  // 1) Drop saved rows whose backing file is no longer linked.
  const keptSaved = saved.filter(s => !s.sourceFileId || freshFileIds.has(s.sourceFileId))

  // 2) Bucket file-sourced saved rows by sourceFileId (order preserved = extraction order).
  const savedBySource = new Map<string, T[]>()
  const manualSaved: T[] = []
  for (const s of keptSaved) {
    if (s.sourceFileId) {
      const bucket = savedBySource.get(s.sourceFileId)
      if (bucket) bucket.push(s)
      else savedBySource.set(s.sourceFileId, [s])
    } else {
      manualSaved.push(s)
    }
  }

  // 3) Content-key index of manual rows — lets a legacy/manual row (no
  //    sourceFileId) pair with a fresh row of identical content once.
  const manualByContent = new Map<string, T>()
  for (const m of manualSaved) {
    const k = contentKey(m)
    if (!manualByContent.has(k)) manualByContent.set(k, m)
  }
  const consumedManual = new Set<T>()

  const fromFresh = fresh.map(f => {
    // (a) Positional match inside this file's bucket.
    if (f.sourceFileId) {
      const bucket = savedBySource.get(f.sourceFileId)
      if (bucket && bucket.length > 0) {
        const match = bucket.shift()!
        return { ...match, sourceFileId: f.sourceFileId }
      }
    }
    // (b) Content-key fallback — legacy saved row being restamped.
    const byContent = manualByContent.get(contentKey(f))
    if (byContent && !consumedManual.has(byContent)) {
      consumedManual.add(byContent)
      return { ...byContent, sourceFileId: f.sourceFileId }
    }
    return f
  })

  // 4) Anything left in savedBySource is a stale extraction — the AI produced
  //    fewer rows this time for the same file. Drop. Manual rows not consumed
  //    are analyst-added — keep.
  const unmatchedManual = manualSaved.filter(m => !consumedManual.has(m))
  const rows = [...fromFresh, ...unmatchedManual]

  const changed =
    rows.length !== saved.length ||
    rows.some((r, i) => r !== saved[i])

  return { rows, changed }
}

export function mergeVehiculos(
  saved: VehiculoRow[],
  padron: VehiculoRow[],
): { rows: VehiculoRow[]; changed: boolean } {
  return pruneAndMergeBySource(saved, padron, v => `${v.marca}|${v.modelo}`.toLowerCase())
}
