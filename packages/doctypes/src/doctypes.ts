/**
 * Document types helper library.
 *
 * Lifted from @edictus/docs/doctypes; the only change is the data source — it now
 * reads the bundled catalog (`./data`) instead of host-injected `configure()`.
 */

import { getRawDoctypes } from './data'
import type { HowToObtain, FieldDef, DocFrequency, ExtractScope, DoctypeField, Doctype, DoctypesMap, DocRequirement } from './types'

export type { HowToObtain, FieldDef, DocFrequency, ExtractScope, DoctypeField, Doctype, DoctypesMap, DocRequirement }

// Raw format from JSON (internal only)
interface RawDoctype {
  label: string
  shortLabel?: string
  category?: string
  freq?: DocFrequency
  count?: number
  maxAge?: number
  graceDays?: number
  multiInstance?: boolean
  pageAtomic?: boolean
  extractScope?: ExtractScope
  parts?: string[]
  contains?: string[]
  definition: string
  dateHint?: string
  fields: FieldDef[]
  howToObtain?: HowToObtain
}

/**
 * Type -> default value mapping
 */
const TYPE_DEFAULTS: Record<string, any> = {
  string: '',
  date: 'YYYY-MM-DD',
  month: 'YYYY-MM',
  time: 'HH:MM',
  num: 0,
  bool: false,
  list: [],
  obj: {},
}

/**
 * Expand field definitions to object format + collect internal field keys.
 * Internal fields are extracted for validation/anti-fraud but not shown in report builder.
 */
function expandFields(fieldDefs: FieldDef[]): { fields: DoctypeField; internalFields: Set<string> } {
  const result: DoctypeField = {}
  const internalFields = new Set<string>()

  for (const field of fieldDefs) {
    const defaultValue = TYPE_DEFAULTS[field.type] ?? ''

    // Handle nested paths like "padre.nombre"
    const parts = field.key.split('.')
    let current: any = result

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      if (!(part in current)) {
        current[part] = {}
      }
      current = current[part]
    }

    current[parts[parts.length - 1]] = defaultValue

    if (field.internal) {
      internalFields.add(field.key)
    }
  }

  return { fields: result, internalFields }
}

/**
 * Generate AI extraction instructions from field definitions
 */
function generateInstructions(fieldDefs: FieldDef[]): string {
  const simple: string[] = []
  const custom: string[] = []

  for (const field of fieldDefs) {
    if (field.ai) {
      custom.push(`${field.key}: ${field.ai}`)
    } else {
      const label = field.key.replace(/\./g, ' → ')
      simple.push(field.type !== 'string' ? `${label} (${field.type})` : label)
    }
  }

  const parts: string[] = []
  if (simple.length > 0) {
    parts.push(`Extrae: ${simple.join(', ')}.`)
  }
  if (custom.length > 0) {
    parts.push(custom.join('. ') + '.')
  }
  return parts.join(' ')
}

function getExpandedDoctypes(): DoctypesMap {
  const raw = getRawDoctypes() as Record<string, RawDoctype>
  const expanded: DoctypesMap = {}

  for (const [id, dt] of Object.entries(raw)) {
    const { fields, internalFields } = expandFields(dt.fields)
    expanded[id] = {
      label: dt.label,
      shortLabel: dt.shortLabel,
      category: dt.category,
      freq: (dt.freq as DocFrequency) || 'once',
      count: dt.count ?? 1,
      maxAge: dt.maxAge,
      graceDays: dt.graceDays,
      hasFechaVencimiento: dt.fields?.some(f => f.key === 'fecha_vencimiento') ?? false,
      multiInstance: dt.multiInstance,
      pageAtomic: dt.pageAtomic,
      extractScope: dt.extractScope,
      parts: dt.parts,
      contains: dt.contains,
      definition: dt.definition,
      dateHint: dt.dateHint,
      instructions: generateInstructions(dt.fields),
      fields,
      fieldDefs: dt.fields,
      internalFields,
      howToObtain: dt.howToObtain,
    }
  }

  return expanded
}

export function getDoctypesMap(): DoctypesMap {
  return getExpandedDoctypes()
}

export function getDoctypes(): Array<Doctype & { id: string }> {
  const map = getDoctypesMap()
  return Object.entries(map)
    .map(([id, doctype]) => ({
      id,
      ...doctype,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function getDoctype(id: string): (Doctype & { id: string }) | null {
  const map = getDoctypesMap()
  const doctype = map[id]
  if (!doctype) return null
  return { id, ...doctype }
}

export function getDoctypeIds(): string[] {
  return Object.keys(getDoctypesMap())
}

export function isDoctypeValid(id: string): boolean {
  return id in getDoctypesMap()
}

export function isMultiInstanceDocType(id: string): boolean {
  return getDoctypesMap()[id]?.multiInstance === true
}

export function getDoctypesLegacyFormat(): Array<{
  id: string
  label: string
  definition: string
  instructions: string
  fields: DoctypeField
  category?: string
  multiInstance?: boolean
}> {
  return getDoctypes().map(dt => ({
    id: dt.id,
    label: dt.label,
    definition: dt.definition,
    instructions: dt.instructions,
    fields: dt.fields,
    category: dt.category,
    multiInstance: dt.multiInstance || undefined,
  }))
}

export function getDoctypesByCategory(category: string): Array<Doctype & { id: string }> {
  return getDoctypes().filter(dt => dt.category === category)
}

export function getCategories(): string[] {
  const categories = new Set(
    getDoctypes()
      .map(dt => dt.category)
      .filter(Boolean)
  )
  return Array.from(categories) as string[]
}

export function getInternalFieldKeys(doctypeId: string): string[] {
  const dt = getDoctypesMap()[doctypeId]
  if (!dt) return []
  return [...dt.internalFields]
}

export function getDocumentDefaults(doctypeid: string): DocRequirement {
  const dt = getDoctypesMap()[doctypeid]
  return dt ? { freq: dt.freq, count: dt.count } : { freq: 'once', count: 1 }
}

export function isRecurring(doctypeid: string): boolean {
  const dt = getDoctypesMap()[doctypeid]
  return dt?.freq === 'monthly' || dt?.freq === 'annual'
}

function isValidFreq(freq: any): freq is DocFrequency {
  return freq === 'once' || freq === 'monthly' || freq === 'annual'
}

export function applyDefaults(
  requirements: Record<string, { freq?: string; count?: number }>
): Record<string, { freq: DocFrequency; count: number }> {
  const result: Record<string, { freq: DocFrequency; count: number }> = {}

  for (const [doctypeid, req] of Object.entries(requirements)) {
    if (doctypeid === 'periodstart') {
      result[doctypeid] = req as any
      continue
    }

    const defaults = getDocumentDefaults(doctypeid)
    const freq: DocFrequency = isValidFreq(req?.freq) ? req.freq : defaults.freq
    const count = typeof req?.count === 'number' && req.count > 0 ? req.count : defaults.count

    result[doctypeid] = { freq, count }
  }

  return result
}
