import type { PropiedadRow, AvaluoFiscalRow } from '../../types'
import { titleCase } from '../../titlecase'
import { pesosToUf, pruneAndMergeBySource } from './shared'

const normalizeDireccion = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

export const buildPropiedadesFromAvaluos = (
  avaluos: AvaluoFiscalRow[],
  ufValue: number | null,
  factorAvaluo: number
): PropiedadRow[] => {
  return avaluos.map((a, i) => {
    const marketPesos = a.valor_pesos != null ? Math.round(a.valor_pesos * factorAvaluo) : null
    return {
      id: `br_${i}`,
      direccion: titleCase(a.direccion || ''),
      comuna: titleCase(a.comuna || ''),
      avaluo_pesos: a.valor_pesos,
      factor_avaluo: factorAvaluo,
      valor_uf: pesosToUf(marketPesos, ufValue),
      valor_pesos: marketPesos,
      arriendo_real: null,
      arriendo_real_uf: null,
      arriendo_futuro: null,
      arriendo_futuro_uf: null,
      arriendo_source_file_id: '__respaldos__',
      sourceFileId: a.sourceFileId,
    }
  })
}

export function mergePropiedades(
  saved: PropiedadRow[],
  avaluos: PropiedadRow[]
): { rows: PropiedadRow[]; changed: boolean } {
  const result = pruneAndMergeBySource(saved, avaluos, v => normalizeDireccion(v.direccion))
  const idsNeedFix = result.rows.some((r, i) => r.id !== `br_${i}`)
  const rows = idsNeedFix ? result.rows.map((r, i) => ({ ...r, id: `br_${i}` })) : result.rows
  return { rows, changed: result.changed || idsNeedFix }
}

