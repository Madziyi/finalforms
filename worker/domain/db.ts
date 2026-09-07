export async function markBackupDirty(db: D1Database, plantDate: string, reason: string) {
  await db.prepare(`
    INSERT INTO backup_dirty_dates(plant_date, reason, first_dirty_at, last_dirty_at)
    VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(plant_date) DO UPDATE SET reason=excluded.reason,last_dirty_at=CURRENT_TIMESTAMP
  `).bind(plantDate, reason).run();
}

export async function openAttention(db: D1Database, input: {
  aggregateId?: string | null; plantDate?: string | null; category: string; code: string; severity: "info"|"warning"|"error"; message: string; details?: unknown;
}) {
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO attention_items(attention_id,canonical_id,plant_date,category,code,severity,message,details_json) VALUES(?,?,?,?,?,?,?,?)`)
    .bind(id, input.aggregateId ?? null, input.plantDate ?? null, input.category, input.code, input.severity, input.message, input.details == null ? null : JSON.stringify(input.details)).run();
  return id;
}

export async function resolveAttention(db: D1Database, aggregateId: string, codes?: string[]) {
  if (codes?.length) {
    const placeholders = codes.map(() => "?").join(",");
    await db.prepare(`UPDATE attention_items SET resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE canonical_id=? AND resolved_at IS NULL AND code IN (${placeholders})`).bind(aggregateId, ...codes).run();
  } else {
    await db.prepare(`UPDATE attention_items SET resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE canonical_id=? AND resolved_at IS NULL`).bind(aggregateId).run();
  }
}
