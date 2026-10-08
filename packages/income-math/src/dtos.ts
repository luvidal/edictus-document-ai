/**
 * Package-owned pure DTOs for the Situación report math.
 *
 * These are the plain data shapes the client hydration/merge/reliquidación math
 * consumes. They were extracted from the server pipeline's
 * `lib/reports/situacion/types.ts` so the pure math layer no longer reaches
 * *up* into the server types module — the server file now re-exports them from
 * here (inverted dependency), and this layer is dependency-clean for the lift
 * into `@edictus/income-math`. See `docs/plans/extract-income-math.md` (Phase A).
 *
 * Pure: all string/number/null (no `Date`, no Prisma, no raw-extraction blobs).
 * The only external edge is the browser-safe types-only `@edictus/extract`
 * liquidación classification enums.
 */

import type { TipoRenta, Naturaleza, LegalType } from '@edictus/extract/liquidacion/types'
export type { TipoRenta, Naturaleza, LegalType }

export interface LabelValue {
  label: string
  value: number
  tipoRenta?: TipoRenta
  naturaleza?: Naturaleza
  legalType?: LegalType
  /**
   * Canonical lexicon id when the row was matched by the satellite's
   * liquidación lexicon. Used by `createDefaultRows` to key row identity so
   * raw-label drift across months doesn't split one concept into two rows.
   * Absent for unmatched rows and collision losers, so those fall back to
   * raw-label keying and no value is silently dropped.
   */
  canonicalId?: string
}

export type LineItem = LabelValue & { type: 'income' | 'deduction' }

export interface CedulaInfo {
  fileId: string; backFileId: string | null; rut: string; nombres: string; apellidos: string
  nacionalidad: string; sexo: string; fecha_nacimiento: string
  numero_documento: string; fecha_emision: string; fecha_vencimiento: string
  lugar_nacimiento: string; profesion: string; foto_base64: string | null
  estado_civil: string
}

export interface MonthData {
  periodo: string; hasData: boolean; fileId?: string
  items?: LineItem[]
  base_imponible?: number | null; base_tributable?: number | null
  // boleta fields
  mes?: string; boletas?: number | null
  bruto?: number | null; retencion?: number | null; liquido?: number | null
}

export interface DeudaFileEntry {
  id: string
  entidad: string
  saldo: number | null
  cuota: number | null
  cuotas_pagadas: number | null
  cuotas_totales: number | null
  sourceFileId: string
  tipoDeuda?: string // 'hipotecario' | 'consumo' | 'comercial' — set from dedicated deuda file doctype
  moneda?: string    // 'UF' | 'CLP' — currency of saldo/cuota values; if 'UF', report converts to CLP
}

export interface BalancePrePopRow {
  id: string
  empresa: string
  rut: string
  periodo: string
  from_date?: string | null
  to_date?: string | null
  total_activos: number | null
  total_pasivos: number | null
  patrimonio: number | null
  total_ingresos: number | null
  total_gastos: number | null
  resultado: number | null
  participacion?: number | null
  sourceFileId: string
}

export interface SociosEntry {
  empresa_rut: string
  socio_nombre: string
  socio_rut: string
  participacion: number
}

export interface CarpetaDomicilio {
  domicilio: string
  fileId: string
}

export interface InversionPrePopRow {
  id: string
  institucion: string
  tipo: string
  monto: number | null
  fecha: string
  sourceFileId: string
}

export const BANK_ACCOUNT_PATTERN = /cuenta|banco|ahorro|cta\b/i
