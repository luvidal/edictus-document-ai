// Re-export all merge functions from per-domain modules
export {
  mergeVehiculos,
  buildDeudasRows, mergeDeudasRows,
  buildPropiedadesFromAvaluos, mergePropiedades,
  buildInversionesRows, mergeInversiones,
  buildBalanceRows, enrichBalancesWithSocios, mergeBalances,
} from './merge'
