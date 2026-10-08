import type { RowData } from '@edictus/tables'
import type { MonthData, DeclaracionRenta, ResumenSummary, PropiedadRow, InversionRow, DeudaRow } from '../types'
import { BANK_ACCOUNT_PATTERN } from '../dtos'
import { hasClassifications, computeReliquidacion } from '../reliquidacion'

// ── Resumen Summary Computation ──
// Replicates @edictus/tables RentaTable logic to derive summary values for Resumen tab

const isAddType = (type: string) => type === 'add' || type === 'income'

/** Net income per month: sum(income) - sum(deductions), skipping groups/deleted */
function calcNetIncome(monthId: string, rows: RowData[]): number {
  let total = 0
  for (const row of rows) {
    if (row.isGroup || row.deletedAt) continue
    const value = row.values[monthId]
    if (value != null) {
      if (isAddType(row.type)) total += value
      else total -= value
    }
  }
  return total
}

/** Variable income per month: sum of isVariable rows (income adds, deduction subtracts) */
function calcVariableIncome(monthId: string, rows: RowData[]): number {
  let sum = 0
  for (const row of rows) {
    if (row.isGroup || row.deletedAt || !row.isVariable) continue
    const value = row.values[monthId] ?? 0
    if (isAddType(row.type)) sum += value
    else sum -= value
  }
  return sum
}

/** Codes that contribute to retiros in the resumen average */
const WEIGHTED_CODES = ['547', '110', '104', '105']

/** saldo_cta_cte: sum of inversiones monto where tipo matches bank patterns. */
export function sumBankInversiones(inversiones: InversionRow[]): number | null {
  let total: number | null = null
  for (const inv of inversiones) {
    if (BANK_ACCOUNT_PATTERN.test(inv.tipo || '') && inv.monto != null) {
      total = (total ?? 0) + inv.monto
    }
  }
  return total
}

/** pie_cancelado: sum of cuotas_pagadas × monto_cuota across non-deleted deuda rows. */
export function sumPieCancelado(deudas: DeudaRow[]): number | null {
  let total: number | null = null
  for (const d of deudas) {
    if (d.deletedAt) continue
    if (d.cuotas_pagadas != null && d.monto_cuota != null) {
      total = (total ?? 0) + d.cuotas_pagadas * d.monto_cuota
    }
  }
  return total
}

export function computeResumenSummary(
  rows: RowData[],
  monthIds: string[],
  boletaMonths: MonthData[],
  declaraciones: DeclaracionRenta[],
  _propiedades: PropiedadRow[],
  inversiones: InversionRow[],
  deudas: DeudaRow[],
  utmMap?: Record<string, number>,
  uf?: number,
  excludedBoletaPeriods?: string[],
  daiMeses?: Record<string, Record<string, number>>,
): ResumenSummary {
  // renta_fija & renta_variable: avg across months
  let rentaFija: number | null = null
  let rentaVariable: number | null = null
  const activeMonths = monthIds.filter(m => rows.some(r => !r.isGroup && !r.deletedAt && r.values[m] != null))
  if (activeMonths.length > 0) {
    const useReliquidacion = hasClassifications(rows) && utmMap && uf
    let totalFija = 0
    let totalVariable = 0
    for (const m of activeMonths) {
      if (useReliquidacion) {
        const utm = utmMap[m]
        if (utm) {
          const result = computeReliquidacion({ rows, monthId: m, utm, uf })
          totalFija += result.rentaFija
          totalVariable += result.rentaVariable
          continue
        }
      }
      // Fallback: naive method (legacy data or missing UTM)
      const net = calcNetIncome(m, rows)
      const variable = calcVariableIncome(m, rows)
      totalFija += net - variable
      totalVariable += variable
    }
    rentaFija = Math.round(totalFija / activeMonths.length)
    rentaVariable = totalVariable !== 0 ? Math.round(totalVariable / activeMonths.length) : null
  }

  // honorarios: (avg boleta liquido across months) + (DAI code 110 weighted avg by months across años tributarios)
  let honorarios: number | null = null
  const excluded = excludedBoletaPeriods ?? []
  const boletasWithLiquido = boletaMonths.filter(m => m.hasData && m.liquido != null && !excluded.includes(m.periodo))
  if (boletasWithLiquido.length > 0) {
    const total = boletasWithLiquido.reduce((s, m) => s + (m.liquido ?? 0), 0)
    honorarios = Math.round(total / boletasWithLiquido.length)
  }
  {
    let weightedSum = 0
    let monthsSum = 0
    for (const d of declaraciones) {
      const value = d.codes['110']
      if (value != null) {
        const meses = daiMeses?.['110']?.[String(d.año_tributario)] ?? 12
        weightedSum += value * meses
        monthsSum += meses
      }
    }
    if (monthsSum > 0) {
      const dai110 = Math.round(weightedSum / monthsSum)
      honorarios = (honorarios ?? 0) + dai110
    }
  }

  // retiros: average of weighted codes with per-cell month divisor
  let retiros: number | null = null
  {
    let sum = 0
    let count = 0
    for (const code of WEIGHTED_CODES) {
      for (const d of declaraciones) {
        const value = d.codes[code]
        if (value != null) {
          const meses = daiMeses?.[code]?.[String(d.año_tributario)] ?? 12
          if (meses === 0) continue
          sum += value / meses
          count++
        }
      }
    }
    if (count > 0) retiros = Math.round(sum / count)
  }

  return {
    renta_fija: rentaFija,
    renta_variable: rentaVariable,
    honorarios,
    retiros,
    pie_cancelado: sumPieCancelado(deudas),
    saldo_cta_cte: sumBankInversiones(inversiones),
  }
}
