import { describe, it, expect } from 'vitest'
import { createDefaultRows, mergeRowsWithApiData } from '../src/helpers/rows'
import type { MonthData } from '../src/types'

const makeMonth = (periodo: string, items: MonthData['items']): MonthData => ({
  periodo, hasData: true, items,
  bruto: null, retencion: null,
})

describe('createDefaultRows', () => {
  it('dedupes labels case-insensitively across months', () => {
    const months = [
      makeMonth('2026-01', [{ label: 'Sueldo Base', type: 'income', value: 1000 }]),
      makeMonth('2026-02', [{ label: 'SUELDO BASE', type: 'income', value: 1100 }]),
    ]
    const rows = createDefaultRows(months)
    const incomeRows = rows.filter(r => r.type === 'income')
    expect(incomeRows).toHaveLength(1)
    expect(incomeRows[0].values['2026-01']).toBe(1000)
    expect(incomeRows[0].values['2026-02']).toBe(1100)
  })

  it('keeps income and deduction labels separate even if same text', () => {
    const months = [
      makeMonth('2026-01', [
        { label: 'Salud', type: 'income', value: 500 },
        { label: 'Salud', type: 'deduction', value: -200 },
      ]),
    ]
    const rows = createDefaultRows(months)
    expect(rows.filter(r => r.type === 'income')).toHaveLength(1)
    expect(rows.filter(r => r.type === 'deduction')).toHaveLength(1)
  })

  it('collapses canonicalId-stamped deduction rows even when raw labels drift across months', () => {
    // The satellite strips parametric tails (`stripParametric: true`) before
    // emit, but the canonicalId is what guarantees row collapse. Even if
    // legacy ai_fields carry the longer raw form for one month and the
    // stripped form for another, the rows merge into one entry because
    // canonicalId is the row identity. Raw labels are preserved (no
    // synonym rewrite): first-seen wins for display.
    const months = [
      makeMonth('2025-10', [
        { label: 'Seguro de Cesantía 0,6%', type: 'deduction', value: 31338, legalType: 'cesantia', canonicalId: 'seguro_cesantia' } as any,
        { label: 'Impuesto Único', type: 'deduction', value: 3850343, legalType: 'impuesto', canonicalId: 'impuesto_unico' } as any,
      ]),
      makeMonth('2025-11', [
        // Drift: parenthetical tail on cesantía, accent-less variant on impuesto.
        { label: 'Seguro de Cesantía 0,6% (Imponible: 5.228.990)', type: 'deduction', value: 31374, legalType: 'cesantia', canonicalId: 'seguro_cesantia' } as any,
        { label: 'Impuesto Unico', type: 'deduction', value: 3843610, legalType: 'impuesto', canonicalId: 'impuesto_unico' } as any,
      ]),
      makeMonth('2025-12', [
        { label: 'Seguro de Cesantía 0,6%', type: 'deduction', value: 31441, legalType: 'cesantia', canonicalId: 'seguro_cesantia' } as any,
        { label: 'Impuesto Único', type: 'deduction', value: 3908908, legalType: 'impuesto', canonicalId: 'impuesto_unico' } as any,
      ]),
    ]
    const rows = createDefaultRows(months)
    const cesantia = rows.filter(r => (r as any).legalType === 'cesantia')
    const impuesto = rows.filter(r => (r as any).legalType === 'impuesto')
    expect(cesantia).toHaveLength(1)
    expect(impuesto).toHaveLength(1)
    expect(cesantia[0].values['2025-10']).toBe(31338)
    expect(cesantia[0].values['2025-11']).toBe(31374)
    expect(cesantia[0].values['2025-12']).toBe(31441)
    // First-seen raw label wins; titleCase preserves Spanish lowercase "de".
    expect(cesantia[0].label).toBe('Seguro de Cesantía 0,6%')
    expect(impuesto[0].label).toBe('Impuesto Único')
  })

  it('collapses raw-label income variants by canonicalId across months', () => {
    // Two raw spellings of the same concept across months. The satellite
    // stamps `canonicalId: 'colacion'` on every lexicon match; createDefaultRows
    // collapses them into a single row keyed by that canonicalId. The
    // display label is the FIRST-SEEN raw form (raw labels are preserved
    // end-to-end; the satellite never rewrites to the lexicon canonical).
    const months = [
      makeMonth('2025-10', [{ label: 'Asignación Colación', type: 'income', value: 320000, canonicalId: 'colacion' } as any]),
      makeMonth('2025-11', [{ label: 'Asignación Colación', type: 'income', value: 320000, canonicalId: 'colacion' } as any]),
      makeMonth('2026-01', [{ label: 'Colación', type: 'income', value: 320000, canonicalId: 'colacion' } as any]),
      makeMonth('2026-02', [{ label: 'Colación', type: 'income', value: 320000, canonicalId: 'colacion' } as any]),
    ]
    const rows = createDefaultRows(months)
    const colacion = rows.filter(r => r.type === 'income' && r.label.toLowerCase().includes('colación'))
    expect(colacion).toHaveLength(1)
    expect(colacion[0].label).toBe('Asignación Colación') // first-seen wins
    expect(colacion[0].values['2025-10']).toBe(320000)
    expect(colacion[0].values['2026-01']).toBe(320000)
  })

  it('collapses raw-label deduction variants by canonicalId across months', () => {
    const months = [
      makeMonth('2025-10', [{ label: 'Salud 7%', type: 'deduction', value: 243367, legalType: 'salud', canonicalId: 'salud_obligatoria' } as any]),
      makeMonth('2026-01', [{ label: 'Cotiz. Salud Obligatoria', type: 'deduction', value: 249870, legalType: 'salud', canonicalId: 'salud_obligatoria' } as any]),
    ]
    const rows = createDefaultRows(months)
    const salud = rows.filter(r => (r as any).legalType === 'salud')
    expect(salud).toHaveLength(1)
    expect(salud[0].label).toBe('Salud 7%') // first-seen wins
    expect(salud[0].values['2025-10']).toBe(243367)
    expect(salud[0].values['2026-01']).toBe(249870)
  })

  it('collapses accent/punctuation variants without an explicit synonym', () => {
    // "Cotiz." vs "Cotiz" — punctuation difference, same conceptual key.
    // The satellite's normalize algorithm folds both to the same key even
    // though no synonym rule fires (display passes through raw).
    const months = [
      makeMonth('2025-10', [{ label: 'Cotiz. Salud Obligatoria', type: 'deduction', value: 100, legalType: 'salud' } as any]),
      makeMonth('2025-11', [{ label: 'Cotiz Salud Obligatoria', type: 'deduction', value: 110, legalType: 'salud' } as any]),
    ]
    const rows = createDefaultRows(months)
    const salud = rows.filter(r => (r as any).legalType === 'salud')
    expect(salud).toHaveLength(1)
    expect(salud[0].values['2025-10']).toBe(100)
    expect(salud[0].values['2025-11']).toBe(110)
  })

  it('collapses accent variants by canonicalId (Impuesto Unico ↔ Impuesto Único)', () => {
    const months = [
      makeMonth('2025-10', [{ label: 'Impuesto Unico', type: 'deduction', value: 3850343, legalType: 'impuesto', canonicalId: 'impuesto_unico' } as any]),
      makeMonth('2026-01', [{ label: 'Impuesto Único', type: 'deduction', value: 4031010, legalType: 'impuesto', canonicalId: 'impuesto_unico' } as any]),
    ]
    const rows = createDefaultRows(months)
    const imp = rows.filter(r => (r as any).legalType === 'impuesto')
    expect(imp).toHaveLength(1)
    // First-seen raw label wins; satellite never accent-rewrites.
    expect(imp[0].label).toBe('Impuesto Unico')
    expect(imp[0].values['2025-10']).toBe(3850343)
    expect(imp[0].values['2026-01']).toBe(4031010)
  })

  it('falls back to raw labels when a synonym would cause a per-month collision', () => {
    // Both labels normalize to the same synonym key, but they're distinct
    // line items in the same month — must NOT collapse (would drop a value).
    const months = [
      makeMonth('2025-10', [
        { label: 'Asignación Colación', type: 'income', value: 320000 },
        { label: 'Colación', type: 'income', value: 100000 },
      ]),
    ]
    const rows = createDefaultRows(months)
    const inc = rows.filter(r => r.type === 'income')
    expect(inc).toHaveLength(2)
    const a = inc.find(r => r.label.toLowerCase().includes('asignación'))
    const b = inc.find(r => r.label.toLowerCase() === 'colación')
    expect(a?.values['2025-10']).toBe(320000)
    expect(b?.values['2025-10']).toBe(100000)
  })

  it('collapses two months by canonicalId even if raw labels differ', () => {
    // After the @edictus/extract lexicon cutover, the satellite stamps a stable
    // `canonicalId` on every matched row. Two months with raw labels that
    // resolve to the same canonical concept must land on one row — even
    // beyond what `resolveLabel`'s string algorithm would handle.
    const months = [
      makeMonth('2025-10', [
        { label: 'Asignacion Colacion', type: 'income', value: 320000, canonicalId: 'colacion' } as any,
      ]),
      makeMonth('2025-11', [
        { label: 'Asignación Colación', type: 'income', value: 320000, canonicalId: 'colacion' } as any,
      ]),
    ]
    const rows = createDefaultRows(months)
    const inc = rows.filter(r => r.type === 'income')
    expect(inc).toHaveLength(1)
    expect(inc[0].values['2025-10']).toBe(320000)
    expect(inc[0].values['2025-11']).toBe(320000)
  })

  it('collapses canonicalId-stamped rows across months even when raw labels differ', () => {
    // Both months have canonicalId stamped by the satellite. Row identity =
    // canonicalId. Display = first-seen raw label.
    const months = [
      makeMonth('2025-10', [
        { label: 'Colación', type: 'income', value: 320000, canonicalId: 'colacion' } as any,
      ]),
      makeMonth('2025-11', [
        { label: 'Asignación Colación', type: 'income', value: 330000, canonicalId: 'colacion' } as any,
      ]),
    ]
    const rows = createDefaultRows(months)
    const inc = rows.filter(r => r.type === 'income')
    expect(inc).toHaveLength(1)
    expect(inc[0].id).toBe('default_income_Colación_colacion')
    expect(inc[0].values['2025-10']).toBe(320000)
    expect(inc[0].values['2025-11']).toBe(330000)
  })

  it('keeps same-label canonical and fallback keyspaces on unique React ids', () => {
    const months = [
      makeMonth('2025-10', [
        { label: 'Sueldo Base', type: 'income', value: 1000, canonicalId: 'sueldo_base' } as any,
      ]),
      makeMonth('2025-11', [
        { label: 'Sueldo Base', type: 'income', value: 1100 },
      ]),
    ]
    const rows = createDefaultRows(months)
    const inc = rows.filter(r => r.type === 'income')
    expect(inc).toHaveLength(2)
    expect(new Set(inc.map(r => r.id)).size).toBe(2)
    expect(inc.map(r => r.id).sort()).toEqual([
      'default_income_Sueldo Base_sueldo base',
      'default_income_Sueldo Base_sueldo_base',
    ])
  })

  it('keeps canonical same-month collision losers separate with unique ids', () => {
    const months = [
      makeMonth('2025-10', [
        { label: 'Colación', type: 'income', value: 320000, canonicalId: 'colacion' } as any,
        { label: 'Asignación Colación', type: 'income', value: 100000 },
      ]),
    ]
    const rows = createDefaultRows(months)
    const inc = rows.filter(r => r.type === 'income')
    expect(inc).toHaveLength(2)
    expect(new Set(inc.map(r => r.id)).size).toBe(2)
    expect(inc.find(r => r.label === 'Colación')?.values['2025-10']).toBe(320000)
    expect(inc.find(r => r.label === 'Asignación Colación')?.values['2025-10']).toBe(100000)
  })

  it('keeps multi-line deductions with the same legalType separate when labels differ', () => {
    // AFP can have multiple line items per month (worker 10% + AFP commission).
    // Both legalType='afp', different labels — must stay as separate rows so
    // their per-month values are preserved. Guards against silent data loss.
    const months = [
      makeMonth('2025-10', [
        { label: 'Capitalización Individual: 10%', type: 'deduction', value: 347668, legalType: 'afp' } as any,
        { label: 'Comisión AFP Provida 1,45%', type: 'deduction', value: 50411, legalType: 'afp' } as any,
      ]),
    ]
    const rows = createDefaultRows(months)
    const afp = rows.filter(r => (r as any).legalType === 'afp')
    expect(afp).toHaveLength(2)
    const capi = afp.find(r => r.label.toLowerCase().includes('capitalización'))
    const com = afp.find(r => r.label.toLowerCase().includes('comisión'))
    expect(capi?.values['2025-10']).toBe(347668)
    expect(com?.values['2025-10']).toBe(50411)
  })
})

describe('mergeRowsWithApiData — saved rows', () => {
  it('preserves case-duplicate saved rows without collapsing them', () => {
    const v1: Record<string, number | null> = { '2026-01': 1000 }
    const v2: Record<string, number | null> = { '2026-02': 1100 }
    const saved = [
      { id: 'default_income_Sueldo Base', label: 'Sueldo Base', type: 'income' as const, values: v1, isDefault: true },
      { id: 'default_income_SUELDO BASE',  label: 'SUELDO BASE',  type: 'income' as const, values: v2, isDefault: true },
    ]
    const months = [makeMonth('2026-01', [{ label: 'Sueldo Base', type: 'income', value: 1000 }])]
    const result = mergeRowsWithApiData(saved, months)
    // Both saved rows must survive — never collapsed
    expect(result.filter(r => r.type === 'income')).toHaveLength(2)
  })

  it('fills missing api values into saved row without overwriting user values', () => {
    const sv: Record<string, number | null> = { '2026-01': 9999 }
    const saved = [
      { id: 'default_income_Sueldo Base', label: 'Sueldo Base', type: 'income' as const, values: sv, isDefault: true },
    ]
    const months = [
      makeMonth('2026-01', [{ label: 'Sueldo Base', type: 'income', value: 1000 }]),
      makeMonth('2026-02', [{ label: 'Sueldo Base', type: 'income', value: 1100 }]),
    ]
    const result = mergeRowsWithApiData(saved, months)
    const row = result.find(r => r.label === 'Sueldo Base')!
    expect(row.values['2026-01']).toBe(9999) // user value wins
    expect(row.values['2026-02']).toBe(1100) // api fills gap
  })

  it('matches saved row to fresh row case-insensitively by label', () => {
    const sv2: Record<string, number | null> = { '2026-01': 9999 }
    const saved = [
      { id: 'default_income_SUELDO BASE', label: 'SUELDO BASE', type: 'income' as const, values: sv2, isDefault: true },
    ]
    const months = [
      makeMonth('2026-01', [{ label: 'Sueldo Base', type: 'income', value: 1000 }]),
      makeMonth('2026-02', [{ label: 'Sueldo Base', type: 'income', value: 1100 }]),
    ]
    const result = mergeRowsWithApiData(saved, months)
    // Only one row — saved matched fresh via case-insensitive label
    expect(result.filter(r => r.type === 'income')).toHaveLength(1)
    expect(result[0].values['2026-01']).toBe(9999) // user value wins
    expect(result[0].values['2026-02']).toBe(1100) // api fills gap
  })

  it('matches saved "AFP" row to fresh "Cotiz. Previsional Obligatoria" via lexicon canonicalId', () => {
    // Pre-cutover saved rows often carry generic labels like "AFP" while the
    // post-cutover lexicon canonicalizes them to "Cotiz. Previsional
    // Obligatoria" with canonicalId='afp_cotizacion_obligatoria'. The doctype
    // normalize block does NOT list AFP as a synonym (only Salud 7%, Impuesto
    // Unico, Asignacion Colacion/Movilizacion). Without the canonicalId
    // bridge, mergeRowsWithFreshData kept both rows — duplicate AFP row in
    // the renta grid + saved value detached from cotizPreviReal.
    const sv: Record<string, number | null> = { '2025-10': 250000 }
    const saved = [
      { id: 'default_deduction_AFP', label: 'AFP', type: 'deduction' as const, values: sv, isDefault: true },
    ]
    const months: MonthData[] = [
      {
        periodo: '2025-10', hasData: true, bruto: null, retencion: null,
        items: [
          { label: 'Cotiz. Previsional Obligatoria', type: 'deduction', value: 250000, canonicalId: 'afp_cotizacion_obligatoria', legalType: 'afp', naturaleza: 'Legal', tipoRenta: 'Fija' } as any,
        ],
      },
    ]
    const result = mergeRowsWithApiData(saved, months)
    const ded = result.filter(r => r.type === 'deduction')
    expect(ded).toHaveLength(1)
    // Saved value wins on the overlapping period
    expect(ded[0].values['2025-10']).toBe(250000)
    // legalType backfilled onto the saved row so reliquidación math sees it
    expect((ded[0] as any).legalType).toBe('afp')
  })

  it('backfills variable flag onto legacy saved rows when fresh classification is variable', () => {
    const saved = [
      {
        id: 'default_income_Bono Producción',
        label: 'Bono Producción',
        type: 'income' as const,
        values: { '2026-01': 50000 },
        isDefault: true,
      },
    ]
    const months = [
      makeMonth('2026-01', [
        {
          label: 'Bono Producción',
          type: 'income',
          value: 999999,
          tipoRenta: 'Variable',
          naturaleza: 'Imponible',
        } as any,
      ]),
    ]

    const result = mergeRowsWithApiData(saved, months)
    expect(result).toHaveLength(1)
    expect(result[0].values['2026-01']).toBe(50000)
    expect(result[0].naturaleza).toBe('Imponible')
    expect(result[0].isVariable).toBe(true)
  })

  it('matches arbiter-promoted saved row to fresh lexicon-label row via persisted canonicalId', () => {
    // The arbiter only fires for labels the lexicon does NOT recognize. A
    // saved row like "Bono Venta" carries canonicalId='comisiones' (assigned
    // by Gemini at extract time) but `resolveLabelToCanonicalId('Bono Venta',
    // 'income')` returns null — by construction "Bono Venta" is not a lexicon
    // alias. If the fresh data later arrives with a lexicon-canonical sibling
    // ("Comisión", canonicalId='comisiones'), label-based recovery fails; the
    // explicit canonicalId field on the saved row is the only bridge.
    const sv: Record<string, number | null> = { '2025-10': 320000, '2025-11': 320000 }
    const saved = [
      {
        id: 'default_income_Bono Venta_comisiones',
        label: 'Bono Venta',
        type: 'income' as const,
        values: sv,
        isDefault: true,
        canonicalId: 'comisiones',
      } as any,
    ]
    const months = [
      makeMonth('2025-10', [{ label: 'Comisión', type: 'income', value: 999999, canonicalId: 'comisiones' } as any]),
      makeMonth('2025-11', [{ label: 'Comisión', type: 'income', value: 999999, canonicalId: 'comisiones' } as any]),
      makeMonth('2025-12', [{ label: 'Comisión', type: 'income', value: 250000, canonicalId: 'comisiones' } as any]),
    ]
    const result = mergeRowsWithApiData(saved, months)
    const inc = result.filter(r => r.type === 'income')
    expect(inc).toHaveLength(1)
    // Saved value wins on overlapping periods
    expect(inc[0].values['2025-10']).toBe(320000)
    expect(inc[0].values['2025-11']).toBe(320000)
    // Fresh fills the gap
    expect(inc[0].values['2025-12']).toBe(250000)
  })

  it('backfills canonicalId onto a legacy saved row that matched via label rules', () => {
    // Pre-cutover saved rows lack the canonicalId field. When the merger
    // finds a fresh row via label/key/lexicon rules, it must transfer the
    // fresh row's canonicalId onto the merged result so subsequent merges
    // can use the fast explicit-canonicalId path.
    const saved = [
      {
        id: 'default_income_AFP',
        label: 'AFP',
        type: 'deduction' as const,
        values: { '2025-10': 250000 },
        isDefault: true,
      },
    ]
    const months: MonthData[] = [
      {
        periodo: '2025-10', hasData: true, bruto: null, retencion: null,
        items: [
          { label: 'Cotiz. Previsional Obligatoria', type: 'deduction', value: 250000, canonicalId: 'afp_cotizacion_obligatoria', legalType: 'afp', naturaleza: 'Legal', tipoRenta: 'Fija' } as any,
        ],
      },
    ]
    const result = mergeRowsWithApiData(saved, months)
    expect(result).toHaveLength(1)
    expect((result[0] as any).canonicalId).toBe('afp_cotizacion_obligatoria')
  })

  it('does NOT merge rows from different canonical buckets that happen to share label fragments', () => {
    // "Adicional Salud" and "Cotiz. Salud Obligatoria" both contain "Salud"
    // and could plausibly hit a fuzzy normalizer, but they map to distinct
    // canonical concepts — they must NEVER collapse.
    const saved = [
      {
        id: 'default_deduction_Adicional Salud',
        label: 'Adicional Salud',
        type: 'deduction' as const,
        values: { '2025-10': 5000 },
        isDefault: true,
        canonicalId: 'adicional_salud',
      } as any,
    ]
    const months: MonthData[] = [
      {
        periodo: '2025-10', hasData: true, bruto: null, retencion: null,
        items: [
          { label: 'Cotiz. Salud Obligatoria', type: 'deduction', value: 200000, canonicalId: 'salud_obligatoria', legalType: 'salud', naturaleza: 'Legal' } as any,
        ],
      },
    ]
    const result = mergeRowsWithApiData(saved, months)
    expect(result.filter(r => r.type === 'deduction')).toHaveLength(2)
  })

  it('merges pre-cutover saved "Seguro de Salud" with fresh "Descuento Seguro de Salud" via lexicon canonicalId', () => {
    // Regression: pre-cutover the host's normalize block rewrote
    // "Descuento Seguro de Salud" → "Seguro de Salud" before persistence.
    // After dropping that synonym the two labels diverged; the @edictus/extract
    // lexicon now lists both under `seguro_complementario`, restoring the
    // bridge through `resolveLabelToCanonicalId` for legacy saved rows.
    const sv: Record<string, number | null> = { '2025-10': 43677 }
    const saved = [
      {
        id: 'default_deduction_Seguro de Salud',
        label: 'Seguro de Salud',
        type: 'deduction' as const,
        values: sv,
        isDefault: true,
      },
    ]
    const months: MonthData[] = [
      {
        periodo: '2025-10', hasData: true, bruto: null, retencion: null,
        items: [
          { label: 'Descuento Seguro de Salud', type: 'deduction', value: 43677, canonicalId: 'seguro_complementario', naturaleza: 'Otro', tipoRenta: 'Fija' } as any,
        ],
      },
    ]
    const result = mergeRowsWithApiData(saved, months)
    const ded = result.filter(r => r.type === 'deduction')
    expect(ded).toHaveLength(1)
    expect(ded[0].values['2025-10']).toBe(43677)
    expect((ded[0] as any).canonicalId).toBe('seguro_complementario')
  })

  it('matches saved row to fresh row by satellite normalize key after backfill rename', () => {
    // After the @edictus/extract liquidacion-lexicon cutover + backfill, fresh
    // rows are created with the canonical label (e.g. "Colación") and a
    // stable canonicalId. Analyst-saved rows from before the cutover still
    // carry the legacy synonym in id + label (e.g.
    // `default_income_Asignación Colación`). Neither id nor case-insensitive
    // label match — only `resolveLabel(...).key` agrees. The merger must
    // collapse them so the renta grid doesn't ship duplicate rows.
    const sv: Record<string, number | null> = { '2025-10': 320000, '2025-11': 320000 }
    const saved = [
      {
        id: 'default_income_Asignación Colación',
        label: 'Asignación Colación',
        type: 'income' as const,
        values: sv,
        isDefault: true,
      },
    ]
    const months = [
      makeMonth('2025-10', [{ label: 'Colación', type: 'income', value: 999999, canonicalId: 'colacion' } as any]),
      makeMonth('2025-11', [{ label: 'Colación', type: 'income', value: 999999, canonicalId: 'colacion' } as any]),
      makeMonth('2025-12', [{ label: 'Colación', type: 'income', value: 320000, canonicalId: 'colacion' } as any]),
    ]
    const fresh = createDefaultRows(months)
    expect(fresh[0].id).toBe('default_income_Colación_colacion')
    const result = mergeRowsWithApiData(saved, months)
    const inc = result.filter(r => r.type === 'income')
    // ONE row — no duplicates
    expect(inc).toHaveLength(1)
    // Saved values win on overlapping periods
    expect(inc[0].values['2025-10']).toBe(320000)
    expect(inc[0].values['2025-11']).toBe(320000)
    // Fresh fills gaps
    expect(inc[0].values['2025-12']).toBe(320000)
  })
})
