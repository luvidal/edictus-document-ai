import type { SoftDeletable } from '@edictus/tables'

export type VehiculoRow = {
  id: string
  marca: string
  modelo: string
  monto: number | null
  anio: number | null
  sourceFileId?: string
} & SoftDeletable

export type InversionRow = {
  id: string
  institucion: string
  tipo: string
  monto: number | null
  fecha: string
  sourceFileId?: string
} & SoftDeletable

export type PropiedadRow = {
  id: string
  direccion: string
  comuna: string
  avaluo_pesos: number | null
  factor_avaluo: number | null
  valor_uf: number | null
  valor_pesos: number | null
  arriendo_real: number | null
  arriendo_real_uf: number | null
  arriendo_futuro: number | null
  arriendo_futuro_uf: number | null
  arriendo_source_file_id?: string
  sourceFileId?: string
} & SoftDeletable

export type DeudaRow = {
  id: string
  institucion: string
  tipo_deuda: string
  saldo_deuda_uf: number | null
  saldo_deuda_pesos: number | null
  monto_cuota: number | null
  cuota_estimated?: boolean
  castigo_pct?: number
  cuota_source_file_id?: string
  cuotas_pagadas: number | null
  cuotas_total: number | null
  sourceFileId?: string
} & SoftDeletable
