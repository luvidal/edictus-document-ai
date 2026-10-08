import type { BalanceRow } from '../../types'
import type { BalancePrePopRow, SociosEntry } from '../../dtos'
import { titleCase } from '../../titlecase'
import { pruneAndMergeBySource } from './shared'

const normalizeRut = (s: string) => s.replace(/[.\s]/g, '').toLowerCase()

export const buildBalanceRows = (
  prePopRows: BalancePrePopRow[]
): BalanceRow[] => {
  return prePopRows.map((r, i) => ({
    id: `bal_${i}`,
    empresa: titleCase(r.empresa),
    rut: r.rut,
    periodo: r.periodo,
    from_date: r.from_date ?? null,
    to_date: r.to_date ?? null,
    total_activos: r.total_activos,
    total_pasivos: r.total_pasivos,
    patrimonio: r.patrimonio,
    participacion: r.participacion ?? null,
    total_ingresos: r.total_ingresos,
    total_gastos: r.total_gastos,
    resultado: r.resultado,
    sourceFileId: r.sourceFileId,
  }))
}

/** Enrich balance rows with ownership % from carpeta-tributaria socios data */
export function enrichBalancesWithSocios(
  balances: BalanceRow[],
  socios: SociosEntry[],
  titularRut: string
): void {
  if (socios.length === 0 || !titularRut) return
  const normRut = normalizeRut(titularRut)
  for (const bal of balances) {
    if (bal.participacion != null) continue
    const balRut = normalizeRut(bal.rut)
    const match = socios.find(
      s => normalizeRut(s.empresa_rut) === balRut && normalizeRut(s.socio_rut) === normRut
    )
    if (match) bal.participacion = match.participacion
  }
}

export function mergeBalances(
  saved: BalanceRow[],
  fresh: BalanceRow[]
): { rows: BalanceRow[]; changed: boolean } {
  const result = pruneAndMergeBySource(saved, fresh, v => `${normalizeRut(v.rut)}|${(v.periodo || '').toLowerCase()}`)
  const idsNeedFix = result.rows.some((r, i) => r.id !== `bal_${i}`)
  const rows = idsNeedFix ? result.rows.map((r, i) => ({ ...r, id: `bal_${i}` })) : result.rows
  return { rows, changed: result.changed || idsNeedFix }
}
