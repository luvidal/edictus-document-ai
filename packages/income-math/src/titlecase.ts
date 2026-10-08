import { toTitleCase } from '@edictus/reports'

/** Chilean financial acronyms to preserve in original case */
const PRESERVE = new Set([
  'AFP', 'ISAPRE', 'SII', 'CMF', 'BCI', 'BBVA', 'FONASA',
  'UF', 'UTM', 'LTDA', 'SpA', 'S.A.', 'IPC',
])

/** Title-case with Spanish grammar + Chilean financial acronyms preserved */
export const titleCase = (s: string) => toTitleCase(s, PRESERVE)
