/**
 * build-doctypes — YAML → JSON generator for the doctype catalog.
 *
 * `data/doctypes.yaml` is the single hand-edited source of truth. This script
 * compiles it into `data/doctypes.json`, the artifact `@edictus/docs` is fed via
 * `configure()` at startup. The JSON is committed and a sync gate (npm script
 * + lint-staged + CI) fails on drift.
 *
 * The build does three things beyond a plain YAML→JSON dump:
 *  1. Auto-mirrors reciprocal `tieBreaker` entries — a pair authored on one
 *     doctype gets its reverse generated on the other with the same rule text.
 *     Reciprocity is therefore build-guaranteed, not hand-authored.
 *  2. Validates required fields on every doctype + `classifier` block.
 *  3. Validates that every `tieBreaker.vs` resolves to a real doctype id.
 *
 * Run directly to regenerate:  npx tsx data/build-doctypes.ts
 * Run with --check to fail on drift without writing.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { parse as parseYaml } from 'yaml'

export const YAML_PATH = join(__dirname, 'doctypes.yaml')
export const JSON_PATH = join(__dirname, 'doctypes.json')

/** Frozen classifier-block schema for structured classifier hints. */
export interface ClassifierTieBreaker {
    vs: string
    rule: string
}
export interface ClassifierBlock {
    useWhen: string[]
    signals: string[]
    rejectWhen: string[]
    tieBreaker: ClassifierTieBreaker[]
}

export type DoctypeEntry = Record<string, unknown> & {
    label?: unknown
    source?: unknown
    category?: unknown
    definition?: unknown
    fields?: unknown
    classifier?: ClassifierBlock
}
export type DoctypesCatalog = Record<string, DoctypeEntry>

class BuildError extends Error {}

/** Required top-level keys on every doctype (mirrors data/CLAUDE.md). */
const REQUIRED_DOCTYPE_KEYS = ['label', 'source', 'category', 'definition', 'fields'] as const
/** Required keys on every classifier block (frozen schema). */
const REQUIRED_CLASSIFIER_KEYS = ['useWhen', 'signals', 'rejectWhen', 'tieBreaker'] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

function assertStringArray(value: unknown, where: string): asserts value is string[] {
    if (!Array.isArray(value) || value.some(v => typeof v !== 'string')) {
        throw new BuildError(`${where} must be an array of strings`)
    }
}

/**
 * Validate one doctype's required fields + classifier block shape. Throws a
 * `BuildError` with a precise locator on the first problem.
 */
function validateDoctype(id: string, entry: unknown): asserts entry is DoctypeEntry {
    if (!isPlainObject(entry)) {
        throw new BuildError(`doctype "${id}" must be a mapping`)
    }
    for (const key of REQUIRED_DOCTYPE_KEYS) {
        if (entry[key] == null) {
            throw new BuildError(`doctype "${id}" is missing required field "${key}"`)
        }
    }
    if (typeof entry.definition !== 'string' || entry.definition.trim() === '') {
        throw new BuildError(`doctype "${id}" definition must be a non-empty string`)
    }
    if (!Array.isArray(entry.fields)) {
        throw new BuildError(`doctype "${id}" fields must be an array`)
    }

    const classifier = entry.classifier
    if (!isPlainObject(classifier)) {
        throw new BuildError(`doctype "${id}" is missing required "classifier" block`)
    }
    for (const key of REQUIRED_CLASSIFIER_KEYS) {
        if (classifier[key] == null) {
            throw new BuildError(`doctype "${id}" classifier is missing "${key}"`)
        }
    }
    assertStringArray(classifier.useWhen, `doctype "${id}" classifier.useWhen`)
    assertStringArray(classifier.signals, `doctype "${id}" classifier.signals`)
    assertStringArray(classifier.rejectWhen, `doctype "${id}" classifier.rejectWhen`)
    if (!Array.isArray(classifier.tieBreaker)) {
        throw new BuildError(`doctype "${id}" classifier.tieBreaker must be an array`)
    }
    for (const tb of classifier.tieBreaker) {
        if (!isPlainObject(tb) || typeof tb.vs !== 'string' || typeof tb.rule !== 'string') {
            throw new BuildError(`doctype "${id}" classifier.tieBreaker entries must be { vs, rule }`)
        }
    }
}

/**
 * Auto-mirror reciprocal `tieBreaker` entries in place. A pair authored on
 * doctype A `{ vs: B, rule }` gets `{ vs: A, rule }` generated on doctype B
 * with the SAME (symmetric) rule text — unless B already authored its own
 * entry against A, in which case the hand-authored one is kept untouched.
 */
function mirrorReciprocalTieBreakers(catalog: DoctypesCatalog): void {
    for (const [id, entry] of Object.entries(catalog)) {
        const classifier = entry.classifier
        if (!classifier) continue
        for (const tb of classifier.tieBreaker) {
            const target = catalog[tb.vs]
            if (!target) {
                throw new BuildError(
                    `doctype "${id}" classifier.tieBreaker.vs "${tb.vs}" does not resolve to a real doctype id`,
                )
            }
            const targetClassifier = target.classifier
            if (!targetClassifier) continue
            const alreadyAuthored = targetClassifier.tieBreaker.some(t => t.vs === id)
            if (!alreadyAuthored) {
                targetClassifier.tieBreaker.push({ vs: id, rule: tb.rule })
            }
        }
    }
    // Stable ordering so the generated JSON is deterministic regardless of
    // which side authored each pair.
    for (const entry of Object.values(catalog)) {
        entry.classifier?.tieBreaker.sort((a, b) => a.vs.localeCompare(b.vs))
    }
}

/**
 * Compile a `doctypes.yaml` string into the catalog object that becomes
 * `doctypes.json`. Pure — no filesystem access. Throws `BuildError` on any
 * validation failure.
 */
export function buildDoctypesCatalog(yamlSource: string): DoctypesCatalog {
    const parsed = parseYaml(yamlSource)
    if (!isPlainObject(parsed)) {
        throw new BuildError('doctypes.yaml must parse to a mapping of doctype id → entry')
    }
    const catalog = parsed as DoctypesCatalog
    for (const [id, entry] of Object.entries(catalog)) {
        validateDoctype(id, entry)
    }
    mirrorReciprocalTieBreakers(catalog)
    return catalog
}

/** Serialize the catalog exactly as the committed `doctypes.json` expects. */
export function serializeCatalog(catalog: DoctypesCatalog): string {
    return JSON.stringify(catalog, null, 2) + '\n'
}

/** Read the YAML source and produce the JSON string. */
export function buildDoctypesJson(): string {
    const yamlSource = readFileSync(YAML_PATH, 'utf8')
    return serializeCatalog(buildDoctypesCatalog(yamlSource))
}

function main(): void {
    const checkOnly = process.argv.includes('--check')
    const generated = buildDoctypesJson()
    if (checkOnly) {
        const current = readFileSync(JSON_PATH, 'utf8')
        if (current !== generated) {
            console.error(
                'data/doctypes.json is out of sync with data/doctypes.yaml.\n' +
                'Run `npm run build:doctypes` and commit the regenerated JSON.',
            )
            process.exit(1)
        }
        console.log('data/doctypes.json is in sync with data/doctypes.yaml.')
        return
    }
    writeFileSync(JSON_PATH, generated)
    console.log(`Wrote ${JSON_PATH}`)
}

// Run as a CLI when invoked directly (tsx / node), stay silent when imported.
if (require.main === module) {
    try {
        main()
    } catch (err) {
        console.error(err instanceof Error ? err.message : err)
        process.exit(1)
    }
}
