/**
 * Multi-Part Document Utilities
 *
 * Some documents require multiple files to be complete (e.g., cedula front + back).
 * Configuration comes from the catalog via the `parts` field.
 *
 * Lifted verbatim from @edictus/docs/multipart.
 */

import { getDoctypesMap } from './doctypes'
import type { MultiPartConfig } from './types'

export type { MultiPartConfig }

// Part ID mapping (label -> id)
const PART_IDS: Record<string, string> = {
  'Frente': 'front',
  'Revés': 'back',
}

export function getMultiPartConfig(doctypeid: string): MultiPartConfig | null {
  const doctype = getDoctypesMap()[doctypeid]
  if (!doctype?.parts || doctype.parts.length === 0) return null

  return {
    enabled: true,
    parts: doctype.parts.map(label => ({
      id: PART_IDS[label] || label.toLowerCase(),
      label
    }))
  }
}

export function isMultiPartDocType(doctypeid: string): boolean {
  const doctype = getDoctypesMap()[doctypeid]
  return !!(doctype?.parts && doctype.parts.length > 0)
}

export function getMultiPartDocTypeIds(): string[] {
  const doctypes = getDoctypesMap()
  return Object.entries(doctypes)
    .filter(([, dt]) => dt.parts && dt.parts.length > 0)
    .map(([id]) => id)
}

export function getPartIdFromFilename(filename: string): string | null {
  // Match English IDs (front/back)
  const match = filename.match(/[_ ](front|back)\.\w+$/)
  if (match) return match[1]

  // Match Spanish labels (Frente/Revés) and map to IDs
  const labelMatch = filename.match(/[_ ](Frente|Revés|Reves)\.\w+$/i)
  if (labelMatch) {
    const label = labelMatch[1]
    if (/^frente$/i.test(label)) return 'front'
    if (/^rev[eé]s$/i.test(label)) return 'back'
  }

  return null
}

export function getDocTypeFromFilename(filename: string): string | null {
  const match = filename.match(/_([^_]+)_[^_]+\.pdf$/)
  return match?.[1] || null
}

export function isMultiPartFile(filename: string, doctypeid: string): boolean {
  const config = getMultiPartConfig(doctypeid)
  if (!config) return false

  const partId = getPartIdFromFilename(filename)
  if (!partId) return false

  return config.parts.some(p => p.id === partId)
}

export function getPartLabel(doctypeid: string, partId: string): string | null {
  const config = getMultiPartConfig(doctypeid)
  if (!config) return null

  const part = config.parts.find(p => p.id === partId)
  return part?.label || null
}

export function partFilenameConditions(partId: string, doctypeid?: string): Array<{ filename: { endsWith: string } }> {
  const extensions = ['pdf', 'jpg', 'jpeg', 'png']
  const delimiters = ['_', ' ']
  const names = [partId]
  if (doctypeid) {
    const label = getPartLabel(doctypeid, partId)
    if (label && label !== partId) names.push(label)
  }
  return names.flatMap(name =>
    delimiters.flatMap(d =>
      extensions.map(ext => ({ filename: { endsWith: `${d}${name}.${ext}` } }))
    )
  )
}
