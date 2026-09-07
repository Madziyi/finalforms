import { describe, expect, it } from "vitest";
import { openAttention, resolveAttention } from "../worker/domain/db";

type Call = { sql: string; args: unknown[] };

function captureDb() {
  const calls: Call[] = [];
  const db = {
    prepare(sql: string) {
      const call: Call = { sql, args: [] };
      calls.push(call);
      return {
        bind(...args: unknown[]) {
          call.args = args;
          return this;
        },
        async run() { return { success: true }; },
      };
    },
  } as unknown as D1Database;
  return { db, calls };
}

describe("canonical v3 storage contract", () => {
  it("writes and resolves attention through canonical_id", async () => {
    const { db, calls } = captureDb();

    await openAttention(db, {
      aggregateId: "F08-2026-09-07",
      plantDate: "2026-09-07",
      category: "derivation",
      code: "projection_refresh_failed",
      severity: "error",
      message: "Projection refresh failed.",
    });
    await resolveAttention(db, "F08-2026-09-07", ["projection_refresh_failed"]);

    expect(calls[0].sql).toContain("attention_items(attention_id,canonical_id,plant_date");
    expect(calls[0].sql).not.toContain("aggregate_id");
    expect(calls[0].args[1]).toBe("F08-2026-09-07");
    expect(calls[1].sql).toContain("WHERE canonical_id=?");
    expect(calls[1].sql).not.toContain("WHERE aggregate_id=?");
  });
});
