// Doctype + multipart types for the document-type catalog (the vocabulary).
// OCR / cédula / extraction types live in @edictus/extract and @edictus/cedula, not here.

export interface HowToObtain {
  steps: string[]
  tips?: string[]
}

export interface FieldDef {
  key: string
  type: 'string' | 'date' | 'month' | 'time' | 'num' | 'bool' | 'list' | 'obj'
  internal?: boolean
  ai?: string
}

export type DocFrequency = 'once' | 'monthly' | 'annual'

export type ExtractScope = 'firstPage' | 'firstTwoPages' | 'selectedPages' | 'fullRange'

export interface DoctypeField {
  [key: string]: string | number | boolean | object | any[] | null
}

export interface Doctype {
  label: string
  shortLabel?: string
  category?: string
  freq: DocFrequency
  count: number
  maxAge?: number
  graceDays?: number
  hasFechaVencimiento: boolean
  multiInstance?: boolean
  pageAtomic?: boolean
  extractScope?: ExtractScope
  parts?: string[]
  contains?: string[]
  definition: string
  dateHint?: string
  instructions: string
  fields: DoctypeField
  fieldDefs: FieldDef[]
  internalFields: Set<string>
  howToObtain?: HowToObtain
}

export type DoctypesMap = Record<string, Doctype>

export interface DocRequirement {
  freq: DocFrequency
  count: number
}

// ── Multi-Part Types ──

export interface MultiPartConfig {
  enabled: boolean
  parts: Array<{ id: string; label: string }>
}
