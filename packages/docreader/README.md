# @edictus/docreader

The in-process document **read engine** extracted from a production upload pipeline
(step 2 of the document-reader SaaS roadmap).

```ts
import { readDocument, configureEnginePorts } from '@edictus/docreader'

const { documents, artifacts } = await readDocument(buffer, mimetype, opts, deps)
//   documents: ReadDocument[]  — WIRE layer (plain JSON: doctype, pages, raw fields, docdate, confidence)
//   artifacts: ReadArtifact[]  — in-process sidecar (page-slice + composite-cédula buffers; never serialized)
```

`readDocument` runs the whole read pipeline — classify (Pass 1 `@edictus/classifier`) →
split → field-extract (Pass 2 `@edictus/extract`) → composite-cédula (`@edictus/cedula`) →
within-doc collapse — and returns **only fields**. It performs no persistence,
linking, S3, Prisma, or derived enrichment: those live above the seam in the host.

## Boundary

- **MAY depend on:** `@edictus/{doctypes,classifier,extract,cedula}` + `pdf-lib` + `pdfjs-dist`.
- **MUST NOT depend on:** Next.js, Prisma, S3, request-linking, host DB models, notifications, derived enrichment, host persistence.
- Everything stateful is an **injected port**: `geminiCall` (via the satellites' own config), `cacheStore` (`deps.cacheStore`), and logging / error-capture / pass-through-error predicate (`configureEnginePorts`).

## Host wiring

```ts
// host app: server-only init
configureEnginePorts({
  logger: { ai: logAI },
  errorCapture: { error: captureError, warn: captureWarning },
  isPassthroughError: isApiError,
})
```

## Scripts

- `npm run build` — tsup → `dist/` 
- `npm test` — vitest

This signature **is** the future external `POST /v1/documents/read` HTTP payload —
the SaaS becomes a transport swap, not a rewrite.
