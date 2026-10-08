# @edictus/income-math

The **Situación report math** — pure functions. Liquidación/boleta line-item rows
+ reference dates + saved analyst edits in → IUSC/reliquidación, hydrated
per-person report state, and asset/deuda/balance/inversión merges out. No React,
Next, Prisma, S3, auth, or persistence coupling: a caller passes loose plain
objects and gets plain data back. The Chilean tax tables (Previred, Global
Complementario) are bundled into `dist` at build time.

## Public surface

```ts
import {
  // reliquidación / IUSC — income-tax math
  applyIUSC,               // (baseTributable, utm) → tax, via the Global Complementario brackets
  computeReliquidacion,    // ({ rows, monthId, utm, uf }) → renta fija/variable + intermediates
  computeExpectedImpuesto, // (rows, monthId, utm) → expected 2nd-category withholding
  hasClassifications,      // (rows) → are rows classified by @edictus/extract?

  // hydration — merge saved analyst edits with fresh file-derived data
  hydrateState,            // (situacionData, ufValue) → HydratedState
  mergeHydratedIntoData,   // (data, hydrated) → SituacionData
  createDefaultRows, createDefaultBoletaRows,

  // resumen derivation
  computeResumenSummary, sumBankInversiones, sumPieCancelado,

  // per-domain merges (prune-and-merge by sourceFileId)
  mergeDeudasRows, mergeBalances, mergeInversiones, mergePropiedades, mergeVehiculos,
} from '@edictus/income-math'
import type {
  SituacionData, HydratedState, ReliquidacionResult, MonthData, LineItem,
  PropiedadRow, VehiculoRow, InversionRow, DeudaRow,
} from '@edictus/income-math'
```

## Usage

```ts
// Reliquidación for one payroll month: splits cotizaciones and IUSC tax between
// the fixed and variable income portions using the effective-rate method.
const r: ReliquidacionResult = computeReliquidacion({
  rows,               // RowData[] — liquidación rows, already classified
  monthId: '2024-06',
  utm: 69_265,        // CLP for the period
  uf: 39_800,         // CLP for the period
})
// → { rentaFija, rentaVariable, imponibleFijo, cotizPreviReal, impuestoFijo, ... }

// Hydration: reconcile freshly-extracted file rows with the analyst's saved edits.
const hydrated = hydrateState(situacionData, ufValue)
// → { rows, boletaRows, propiedades, vehiculos, inversiones, balances, deudas,
//     excludedBoletaPeriods, daiMeses, savePayload }
const next = mergeHydratedIntoData(situacionData, hydrated)
```

`savePayload` is non-null only when auto-populated data actually changed — the
caller persists it, the math never does.

## Rules the math guarantees

- **Classification is not re-derived here.** Whether a row is an income /
  deduction / impuesto line comes from `@edictus/extract` (`tipoRenta` /
  `naturaleza` / `legalType` on the row) — never inferred from raw labels.
- **Row identity survives label drift.** `createDefaultRows` keys rows by the
  canonical lexicon id (`resolveLabelToCanonicalId`), so the same concept spelled
  differently across months does not split into two rows. Unmatched rows fall back
  to raw-label keying — **no value is silently dropped**.
- **An empty source never clobbers saved data.** Merges reconcile by
  `sourceFileId` (prune-and-merge-by-source); a missing or empty source removes
  nothing the analyst already has.

## Boundaries

- **MAY depend on:** sibling satellites only — `@edictus/tables` (row shapes),
  `@edictus/extract` (liquidación lexicon + label normalization),
  `@edictus/doctypes` (catalog), `@edictus/reports` (currency + title-case
  formatting).
- **MUST NOT depend on:** React, Next.js, Prisma, S3, auth, or any host
  persistence. No `@/` or app-specific imports.

## Install

Workspace package of this monorepo — `npm install` at the repo root.

## Scripts

- `npm run build` — tsup → `dist/` (cjs + esm + dts; the SII tax JSON is bundled
  inline).
- `npm test` — vitest (reliquidación / rows / assetmerge / deudas / hydrate; no
  DB, no React, no credentials).
