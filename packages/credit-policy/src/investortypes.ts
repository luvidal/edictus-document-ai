/**
 * Minimal investor-cap shape the credit-policy math consumes: identity + the four
 * ratio caps. Package-owned DTO so this math does not depend on the host's server-side
 * `lib/data/companyinvestors` store. `CompanyInvestor` (that store) extends this,
 * so full rows stay assignable.
 */
export interface InvestorCaps {
  id: string
  name: string
  max_dividendo_renta: number | null
  max_carga_financiera: number | null
  max_deuda_precio_venta: number | null
  max_edad_plazo: number | null
}
