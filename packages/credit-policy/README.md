# @edictus/credit-policy

The investor **credit-policy engine** — pure math. Investor caps + indicador rows
+ borrower scalars in → per-investor verdict rows (*Políticas*), máximo
financiable (*análisis inverso*), and a "qué decirle al cliente" recommendation
out. No React, Next, Prisma, S3, auth, or persistence coupling: a caller passes
loose plain objects and gets plain data back.

## Public surface

```ts
import {
  buildPoliticas,      // investors + indicador rows + ages + plazo (+ sim) → PolicyRow[]
  computeMaxMontoUF,   // investor caps + borrower scalars + plazo → { maxMontoUF, bindingRatio }
  buildRecommendation, // policy rows + renta + solicitado → covers / máx hoy / cheapest path
  calcDividendo,       // annuity PMT   (tasa, plazo, monto)     → cuota
  calcMaxMonto,        // annuity PV    (tasa, plazo, dividendo) → principal
  RATIO_LABEL, RATIO_UNIT,
} from '@edictus/credit-policy'
import type {
  InvestorCaps, PolicyRow, PolicyCell, PolicyRatio, PolicyCellState,
  PolicyRowStatus, MaxBinding, SimInputs, MaxResult, Recommendation,
} from '@edictus/credit-policy'
```

## Usage

```ts
const sim: SimInputs = {
  renta: 3_500_000,   // CLP, castigo-adjusted total_ingresos
  egresos: 400_000,   // CLP, castigo-adjusted total_egresos
  precio: 5000,       // UF
  valorUF: 39_800,    // CLP per UF
  tasa: 4.5,          // annual %
}

const rows = buildPoliticas(investors, indicadoresRows, titularAge, codebtorAges, 20, sim)
// → one PolicyRow per investor: 4 ratio cells (Div/Renta, Carga, Deuda/Precio,
//   Edad+Plazo), a status, and maxMontoUF + bindingRatio when `sim` is given.

const { maxMontoUF, bindingRatio } = computeMaxMontoUF(investors[0], sim, 20)
const rec = buildRecommendation(rows, sim.renta, 4200 /* UF solicitado */)
```

## Rules the math guarantees

- **Máx = MIN of three loan ceilings** — Div/Renta and Carga (income → max
  dividendo → PV) plus LTV (`cap · precio`). No seguros. **Age is never a Máx
  term**: Edad+Plazo gates the verdict pill only, it never reduces or nulls the
  amount.
- A **null cap or null input drops that ceiling from the MIN** (never 0 / never
  ∞); with no computable ceiling the result is `null`, not `0`. Carga headroom is
  surfaced **raw** — a negative Máx when existing debt already exceeds the cap.
- **Verdict is 3-state**: `compliant` (every cell passes) / `incomplete`
  (`missing-cap` / `missing-value`, no fails) / `noncompliant` (any fail). A
  missing cell **never counts as a pass**; a missing person age flips Edad+Plazo
  to `missing-value` rather than being dropped from the age `max(...)`.
- Rows sort compliant (margin desc) → incomplete → noncompliant (failing count
  asc), name as tiebreak.

## Boundaries

- **MAY depend on:** `@edictus/tables` — the `SummaryRow` type only, read by
  `buildPoliticas` for the percent indicador rows.
- **MUST NOT depend on:** React, Next.js, Prisma, S3, auth, or any host
  persistence. `InvestorCaps` is a package-owned DTO precisely so this math never
  reaches into the host's investor store (the host's row type extends it).

## Install

Workspace package of this monorepo — `npm install` at the repo root.

## Scripts

- `npm run build` — tsup → `dist/` (cjs + esm + dts).
- `npm test` — vitest (políticas / simulación / recommendation / annuity; no DB,
  no React, no credentials).
