// @edictus/doctypes — the Chilean document-type catalog (the vocabulary).
//
// Pure data + helpers, no heavy deps. Safe to import from frontend or server.
// Owns the catalog system: catalog/doctypes.yaml (source) → catalog/build-doctypes.ts
// (compiler + drift gate) → catalog/doctypes.json (generated, bundled here).

export {
  getDoctypesMap,
  getDoctypes,
  getDoctype,
  getDoctypeIds,
  isDoctypeValid,
  isMultiInstanceDocType,
  getDoctypesLegacyFormat,
  getDoctypesByCategory,
  getCategories,
  getInternalFieldKeys,
  getDocumentDefaults,
  isRecurring,
  applyDefaults,
} from './doctypes'

// Raw catalog (unexpanded, includes classifier blocks) — the host injects this
// into @edictus/classifier / @edictus/extract / @edictus/cedula via their configure().
export { doctypesCatalog, getRawDoctypes } from './data'

export type {
  HowToObtain,
  FieldDef,
  DocFrequency,
  ExtractScope,
  DoctypeField,
  Doctype,
  DoctypesMap,
  DocRequirement,
  MultiPartConfig,
} from './types'
