/**
 * Bundled catalog data.
 *
 * @edictus/doctypes OWNS the catalog (source-of-truth inversion vs the old
 * @edictus/docs `configure({ doctypes })` injection). The raw JSON is generated
 * from `catalog/doctypes.yaml` by `catalog/build-doctypes.ts` and bundled here
 * at build time — no host injection, no runtime fs read.
 */
import rawCatalog from '../catalog/doctypes.json'

/**
 * Raw catalog (unexpanded) — the shape @edictus/classifier / @edictus/extract /
 * @edictus/cedula consume via their own `configure({ doctypes })`. The host wires
 * this in instead of reading `data/doctypes.json` directly.
 */
export const doctypesCatalog: Record<string, unknown> = rawCatalog as Record<string, unknown>

/** Internal accessor used by the doctype helpers (was config injection in @edictus/docs). */
export function getRawDoctypes(): Record<string, unknown> {
  return doctypesCatalog
}
