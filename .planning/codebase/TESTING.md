# Testing Patterns

**Analysis Date:** 2026-09-03

## Test Framework

**Runner:**
- Vitest 3.2 configured through package defaults; no separate `vitest.config.*` was detected.
- Tests live under `tests/` and are included in `tsconfig.worker.json`.

**Assertion Library:**
- Vitest `expect`, with `describe` and `it` imported from `vitest`.

**Run Commands:**
```bash
npm test                 # Run all Vitest tests once
npm run check            # Strict TypeScript project-reference check
npm run build            # Type-check and create the Vite/Worker production build
npm run smoke:local      # Reset/inspect local D1 contract through the dedicated script
```

## Test File Organization

**Location:**
- Separate top-level `tests/` directory, not co-located with implementation.

**Naming:**
- `<concern>.test.ts`, e.g. `tests/formulas.test.ts` and `tests/phase4-local-first.test.ts`.

**Structure:**
```text
tests/
├── formulas.test.ts
├── formManifest.test.ts
├── safetyContract.test.ts
└── phase4-local-first.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
describe("deterministic derived formulas", () => {
  it("never substitutes a missing previous calendar date", () => {
    const result = calculateForm5And6({
      currentValues: current,
      previousValues: {},
      currentDate: "2026-09-03",
      previousDate: "2026-09-02",
      hasCurrent: true,
      hasPrevious: false,
    });

    expect(result.status).toBe("waiting");
    expect(result.form6.cw_makeup_used).toBeNull();
  });
});
```

**Patterns:**
- Group tests by contract area: formulas, context ownership, form manifest, local-first validation, freshness, backup, and migration behavior.
- Prefer deterministic fixed dates, operators, values, and IDs.
- Assert both positive values and meaningful blank/null/warning behavior.
- Use `toMatchObject`, `toContain`, `toEqual`, and `toBeCloseTo` for domain results.

## Mocking

**Framework:**
- No mocking library was detected. `tests/phase4-local-first.test.ts` uses handwritten D1-shaped fakes (`LocalFirstDb`, `BackupDb`) with `prepare`, `bind`, `first`, `run`, and `batch`.

**Patterns:**
```typescript
class LocalFirstDb {
  rows = new Map<string, LatestRow>();
  prepare(sql: string) {
    const statement = {
      args: [] as unknown[],
      bind(...args: unknown[]) { statement.args = args; return statement; },
      async first<T>() { /* inspect SQL and return the fake row */ return undefined as T; },
      async run() { return { success: true }; },
    };
    return statement;
  }
}
```

**What to Mock:**
- D1 behavior when testing Worker domain functions in isolation.
- External delivery/database boundaries and only the SQL behavior needed for the tested contract.

**What NOT to Mock:**
- Pure shared formulas, context normalization, or form manifest data; execute them directly.
- The local-first invariant itself; tests should verify transaction/query intent as well as returned values.

## Fixtures and Factories

**Test Data:**
- Inline fixed objects such as `form8Current`, `form8Previous`, `FORM_2_CONTEXT`, and `form2Upload()`.
- `latestRow()` and `uploadFor()` provide focused fake D1/upload records.

**Location:**
- Fixtures/factories are local to each test file; no shared fixture directory was detected.

## Coverage

**Requirements:**
- No coverage target or coverage script was detected. Reliability assertions are explicit rather than threshold-driven.

**View Coverage:**
```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests:**
- Shared formula/context/manifest tests and pure Worker validation/serialization behavior.

**Integration Tests:**
- In-process domain tests with D1-shaped fakes; source-level assertions verify that browser persistence/sync/UI safeguards remain present.

**E2E Tests:**
- No browser automation or full deployed API test suite was detected. Operational smoke/verification scripts exist in `scripts/smoke-local.mjs` and `scripts/verify-cloud.mjs`.

## Common Patterns

**Async Testing:**
```typescript
it("orders competing uploads by freshness", async () => {
  const result = await upsertCompletedRecord(db as never, upload);
  expect(result.outcome).toBe("accepted");
});
```

**Error Testing:**
```typescript
expect(() => normalizeContext("yst-yk-chiller", { date, timeSlot: "09:00" }))
  .toThrow("valid two-hour time slot");
expect(() => validateCompletedUpload(invalidUpload)).toThrow("Select an operator");
```

When changing reliability behavior, update both behavior tests and the source-contract assertions in `tests/phase4-local-first.test.ts`.

---

*Testing analysis: 2026-09-03*
