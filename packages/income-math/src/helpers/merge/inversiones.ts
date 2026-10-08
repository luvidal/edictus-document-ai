import type { InversionRow } from '../../types'
import type { InversionPrePopRow } from '../../dtos'
import { titleCase } from '../../titlecase'
import { normalize, pruneAndMergeBySource } from './shared'

export const buildInversionesRows = (
  prePopRows: InversionPrePopRow[]
): InversionRow[] => {
  return prePopRows.map((r, i) => ({
    id: `inv_${i}`,
    institucion: titleCase(r.institucion),
    tipo: titleCase(r.tipo),
    monto: r.monto,
    fecha: r.fecha,
    sourceFileId: r.sourceFileId,
  }))
}

export function mergeInversiones(
  saved: InversionRow[],
  fresh: InversionRow[]
): { rows: InversionRow[]; changed: boolean } {
  return pruneAndMergeBySource(saved, fresh, v =>
    `${normalize(v.institucion)}|${(v.tipo || '').toLowerCase()}|${v.monto ?? ''}`,
  )
}
