import { allFields, getForm } from "../../shared/forms";
import { nextCalendarDate } from "../../shared/safetyContract";
import { DERIVED_FORMULA_VERSION } from "../../shared/formulas";
import type { CanonicalRecord, CommandPayload, CommandReceipt, FieldValue, Values } from "../../shared/types";
import { openAttention } from "./db";
import { sha256Hex, stableStringify } from "./hash";
import { getCanonicalRecord } from "./records";
import { DomainError, validateAndNormalizeValues, validateCommandShape } from "./validation";
import { derivedNumericStatements } from "./trends";

function responseFromStored(raw: string): CommandReceipt { return JSON.parse(raw) as CommandReceipt; }

function receiptStatement(db: D1Database, command: CommandPayload, requestJson: string, fingerprint: string, receipt: CommandReceipt) {
  return db.prepare(`
    INSERT INTO command_receipts(command_id,aggregate_id,fingerprint,operation,request_json,outcome,applied_revision,response_json)
    VALUES(?,?,?,?,?,?,?,?)
  `).bind(command.commandId, command.aggregateId, fingerprint, command.operation, requestJson, receipt.outcome, receipt.revision ?? null, JSON.stringify(receipt));
}

async function storeRejectedReceipt(db: D1Database, command: CommandPayload, requestJson: string, fingerprint: string, receipt: CommandReceipt) {
  await receiptStatement(db, command, requestJson, fingerprint, receipt).run();
  return receipt;
}

async function existingReceipt(db: D1Database, commandId: string) {
  return db.prepare(`SELECT fingerprint,response_json FROM command_receipts WHERE command_id=?`).bind(commandId).first<{ fingerprint: string; response_json: string }>();
}

function publishedFlag(command: CommandPayload) {
  return command.lifecycle === "completed" || command.operation === "complete" || command.operation === "amend_complete" || command.operation === "move" || command.operation === "replace";
}

function measuredAt(command: CommandPayload) {
  if (command.context.timeSlot) return `${command.context.date}T${command.context.timeSlot}:00`;
  if (command.context.shift === "Day") return `${command.context.date}T12:00:00`;
  if (command.context.shift === "Night") return `${command.context.date}T23:00:00`;
  return `${command.context.date}T23:59:00`;
}

function numericStatements(db: D1Database, command: CommandPayload, revisionId: string, values: Values, isPublished: boolean) {
  const form = getForm(command.formKey)!;
  const fields = new Map(allFields(form).map((f) => [f.key, f]));
  const statements: D1PreparedStatement[] = [];
  for (const [fieldKey, value] of Object.entries(values)) {
    if (!fields.get(fieldKey)?.trendable || typeof value !== "number" || !Number.isFinite(value)) continue;
    statements.push(db.prepare(`INSERT INTO numeric_observations(revision_id,aggregate_id,form_key,field_key,plant_date,measured_at,numeric_value,is_published) VALUES(?,?,?,?,?,?,?,?)`)
      .bind(revisionId, command.aggregateId, command.formKey, fieldKey, command.context.date, measuredAt(command), value, isPublished ? 1 : 0));
  }
  if (isPublished) statements.unshift(db.prepare(`UPDATE numeric_observations SET is_published=0 WHERE aggregate_id=?`).bind(command.aggregateId));
  return statements;
}

function dirtyStatement(db: D1Database, plantDate: string, reason: string) {
  return db.prepare(`
    INSERT INTO backup_dirty_dates(plant_date,reason,first_dirty_at,last_dirty_at)
    VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(plant_date) DO UPDATE SET reason=excluded.reason,last_dirty_at=CURRENT_TIMESTAMP
  `).bind(plantDate, reason);
}

function staleProjectionStatements(db: D1Database, dates: string[]) {
  const statements: D1PreparedStatement[] = [];
  for (const plantDate of [...new Set(dates)]) {
    for (const formKey of ["daily-consumption-totals", "makeup"] as const) {
      statements.push(db.prepare(`
        INSERT INTO derived_projections(projection_id,form_key,plant_date,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json)
        VALUES(?,?,?,0,'stale',?,'[]','{}','{}','["Recalculation pending after Form 8 revision change."]')
        ON CONFLICT(form_key,plant_date) DO UPDATE SET status='stale',updated_at=CURRENT_TIMESTAMP
      `).bind(crypto.randomUUID(), formKey, plantDate, DERIVED_FORMULA_VERSION));
    }
  }
  return statements;
}

function derivedDatesFor(command: CommandPayload, current: CanonicalRecord | null, publish: boolean) {
  if (!publish || command.formKey !== "integrator-readings") return [] as string[];
  const dates = new Set<string>([command.context.date, nextCalendarDate(command.context.date, 1)]);
  if (current && current.date !== command.context.date) {
    dates.add(current.date);
    dates.add(nextCalendarDate(current.date, 1));
  }
  return [...dates].sort();
}

function exactAcceptedRecord(input: {
  command: CommandPayload; contextKey: string; revision: number; publishedRevision: number | null; lifecycle: "draft" | "completed"; values: Values; current: CanonicalRecord | null; provenance: Record<string, unknown> | null; serverTime: string;
}): CanonicalRecord {
  const { command, contextKey, revision, publishedRevision, lifecycle, values, current, provenance, serverTime } = input;
  return {
    aggregateId: command.aggregateId,
    formKey: command.formKey,
    contextKey,
    revision,
    publishedRevision,
    lifecycle,
    operatorId: command.operatorId,
    operator: command.operator,
    date: command.context.date,
    shift: command.context.shift ?? null,
    timeSlot: command.context.timeSlot ?? null,
    boilerNumber: command.context.boilerNumber ?? null,
    values,
    provenance,
    createdAt: current?.createdAt ?? serverTime,
    updatedAt: serverTime,
  };
}

async function processProjectionCommand(db: D1Database, command: CommandPayload, requestJson: string, fingerprint: string): Promise<CommandReceipt> {
  if (command.formKey !== "daily-consumption-totals") throw new DomainError("derived_readonly", "Only Form 5 permits approved manual adjustments.", 409);
  const projection = await db.prepare(`SELECT * FROM derived_projections WHERE form_key=? AND plant_date=?`).bind(command.formKey, command.context.date).first<any>();
  if (!projection) return storeRejectedReceipt(db, command, requestJson, fingerprint, { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "validation_error", message: "No generated Form 5 exists for this date." });
  if (!command.adjustment) throw new DomainError("invalid_adjustment", "Adjustment details are required.");
  if (command.operation === "adjust_projection" && projection.status !== "current") throw new DomainError("projection_not_current", "Form 5 can be adjusted only when its exact source dependencies are current.", 409);
  if (command.operation === "resolve_projection" && projection.status !== "attention") throw new DomainError("projection_not_attention", "There is no Form 5 source-change decision waiting for resolution.", 409);

  const effective = JSON.parse(projection.effective_values_json) as Values;
  const allowedKeys = new Set(allFields(getForm(command.formKey)!).map((f) => f.key));
  const statements: D1PreparedStatement[] = [];
  const nextRevision = Number(projection.revision) + 1;
  let finalEffective: Values;

  if (command.operation === "resolve_projection" && command.adjustment.decision === "recalculate") {
    statements.push(db.prepare(`UPDATE projection_adjustments SET active=0,superseded_at=CURRENT_TIMESTAMP WHERE projection_id=? AND active=1`).bind(projection.projection_id));
    const baseValues = JSON.parse(projection.base_values_json) as Values;
    finalEffective = baseValues;
    statements.push(db.prepare(`UPDATE derived_projections SET status='current',effective_values_json=base_values_json,revision=?,updated_at=CURRENT_TIMESTAMP WHERE projection_id=?`).bind(nextRevision, projection.projection_id));
  } else {
    for (const [key, value] of Object.entries(command.adjustment.overrides ?? {})) {
      if (!allowedKeys.has(key)) throw new DomainError("invalid_adjustment", `Unknown Form 5 field ${key}.`);
      if (!(value === null || typeof value === "number" || typeof value === "string")) throw new DomainError("invalid_adjustment", `Invalid override for ${key}.`);
      const adjustmentId = crypto.randomUUID();
      statements.push(db.prepare(`UPDATE projection_adjustments SET active=0,superseded_at=CURRENT_TIMESTAMP WHERE projection_id=? AND field_key=? AND active=1`).bind(projection.projection_id, key));
      statements.push(db.prepare(`INSERT INTO projection_adjustments(adjustment_id,projection_id,projection_revision,field_key,value_json,operator_id,operator_name,decision) VALUES(?,?,?,?,?,?,?,?)`)
        .bind(adjustmentId, projection.projection_id, Number(projection.revision), key, JSON.stringify(value), command.operatorId ?? null, command.operator, command.adjustment.decision ?? "keep"));
      effective[key] = value as FieldValue;
    }
    const status = projection.status === "attention" && command.adjustment.decision !== "keep" ? "attention" : "current";
    statements.push(db.prepare(`UPDATE derived_projections SET status=?,effective_values_json=?,revision=?,updated_at=CURRENT_TIMESTAMP WHERE projection_id=?`)
      .bind(status, JSON.stringify(effective), nextRevision, projection.projection_id));
    finalEffective = effective;
  }

  statements.push(...derivedNumericStatements(db, { projectionId: projection.projection_id, projectionRevision: nextRevision, formKey: "daily-consumption-totals", plantDate: command.context.date, values: finalEffective! }));

  const receipt: CommandReceipt = { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "accepted", revision: nextRevision };
  if (command.operation === "resolve_projection") statements.push(db.prepare(`UPDATE attention_items SET resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE plant_date=? AND code='daily-consumption-totals_manual_adjustment_review' AND resolved_at IS NULL`).bind(command.context.date));
  statements.push(dirtyStatement(db, command.context.date, "Form 5 manual adjustment"));
  statements.push(receiptStatement(db, command, requestJson, fingerprint, receipt));
  await db.batch(statements);
  return receipt;
}

async function processReplace(db: D1Database, command: CommandPayload, requestJson: string, fingerprint: string, values: Values, newContextKey: string, current: CanonicalRecord | null, sourceAggregateExists: boolean): Promise<CommandReceipt> {
  const target = command.replacement;
  if (!target) throw new DomainError("replace_missing", "Replacement destination is required.");
  const destination = await getCanonicalRecord(db, target.destinationAggregateId);
  if (!destination || destination.formKey !== command.formKey) throw new DomainError("replace_destination", "Replacement destination does not exist or has a different form.", 409);
  if (destination.aggregateId === command.aggregateId) throw new DomainError("replace_destination", "A record cannot replace itself.", 409);
  if (destination.revision !== target.destinationRevision) {
    return storeRejectedReceipt(db, command, requestJson, fingerprint, { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "conflict", conflict: destination, message: "The destination changed before replacement." });
  }
  if (current && current.revision !== command.baseRevision) {
    return storeRejectedReceipt(db, command, requestJson, fingerprint, { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "conflict", conflict: current, message: "The source changed before replacement." });
  }
  if (!current && command.baseRevision !== null) throw new DomainError("replace_source", "The replacement source revision is invalid.", 409);
  if (newContextKey !== destination.contextKey) throw new DomainError("replace_context", "Replacement context must match the destination record exactly.", 409);

  const sourceRevision = (current?.revision ?? 0) + 1;
  const destRevision = destination.revision + 1;
  const sourceRevisionId = crypto.randomUUID();
  const destRevisionId = crypto.randomUUID();
  const isPublished = publishedFlag(command);
  const serverTime = new Date().toISOString();
  const sourcePublishedRevision = isPublished ? sourceRevision : current?.publishedRevision ?? null;
  const provenance = { replacedAggregateId: destination.aggregateId, replacedRevision: destination.revision };
  const record = exactAcceptedRecord({ command, contextKey: newContextKey, revision: sourceRevision, publishedRevision: sourcePublishedRevision, lifecycle: isPublished ? "completed" : "draft", values, current, provenance, serverTime });
  const derivedDates = derivedDatesFor(command, current, isPublished);
  const receipt: CommandReceipt = { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "accepted", revision: sourceRevision, publishedRevision: sourcePublishedRevision, record, derivedDates };

  const statements: D1PreparedStatement[] = [];
  if (!sourceAggregateExists) statements.push(db.prepare(`INSERT INTO aggregates(aggregate_id,form_key,current_revision,published_revision,lifecycle,context_key) VALUES(?,?,0,NULL,'draft',NULL)`).bind(command.aggregateId, command.formKey));
  statements.push(
    db.prepare(`DELETE FROM context_claims WHERE aggregate_id IN (?,?)`).bind(command.aggregateId, destination.aggregateId),
    db.prepare(`UPDATE numeric_observations SET is_published=0 WHERE aggregate_id=?`).bind(destination.aggregateId),
    db.prepare(`INSERT INTO revisions(revision_id,aggregate_id,revision,command_id,operation,form_key,form_version,lifecycle,is_published,context_key,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,provenance_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(destRevisionId, destination.aggregateId, destRevision, `${command.commandId}:superseded`, "replace_superseded", destination.formKey, command.formVersion, "superseded", 0, destination.contextKey, destination.operatorId, destination.operator, destination.date, destination.shift, destination.timeSlot, destination.boilerNumber, JSON.stringify(destination.values), JSON.stringify({ replacedBy: command.aggregateId, replacementCommandId: command.commandId })),
    db.prepare(`UPDATE aggregates SET current_revision=?,lifecycle='superseded',context_key=NULL,updated_at=CURRENT_TIMESTAMP WHERE aggregate_id=?`).bind(destRevision, destination.aggregateId),
    db.prepare(`INSERT INTO revisions(revision_id,aggregate_id,revision,command_id,operation,form_key,form_version,lifecycle,is_published,context_key,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,provenance_json)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(sourceRevisionId, command.aggregateId, sourceRevision, command.commandId, "replace", command.formKey, command.formVersion, isPublished ? "completed" : "draft", isPublished ? 1 : 0, newContextKey, command.operatorId ?? null, command.operator, command.context.date, command.context.shift ?? null, command.context.timeSlot ?? null, command.context.boilerNumber ?? null, JSON.stringify(values), JSON.stringify(provenance)),
    db.prepare(`INSERT INTO context_claims(form_key,context_key,aggregate_id) VALUES(?,?,?)`).bind(command.formKey, newContextKey, command.aggregateId),
    db.prepare(`UPDATE aggregates SET current_revision=?,published_revision=CASE WHEN ?=1 THEN ? ELSE published_revision END,lifecycle=CASE WHEN ?=1 THEN 'completed' ELSE lifecycle END,context_key=?,updated_at=CURRENT_TIMESTAMP WHERE aggregate_id=?`)
      .bind(sourceRevision, isPublished ? 1 : 0, sourceRevision, isPublished ? 1 : 0, newContextKey, command.aggregateId),
  );
  if (isPublished) statements.push(db.prepare(`UPDATE revisions SET is_published=0 WHERE aggregate_id=? AND revision<>?`).bind(command.aggregateId, sourceRevision));
  statements.push(...numericStatements(db, command, sourceRevisionId, values, isPublished));
  statements.push(dirtyStatement(db, destination.date, "Record replaced"));
  statements.push(dirtyStatement(db, command.context.date, "Record replacement accepted"));
  if (command.formKey === "integrator-readings" && isPublished) {
    statements.push(...staleProjectionStatements(db, derivedDates));
    for (const date of derivedDates) statements.push(dirtyStatement(db, date, "Integrator replacement changed a derived dependency"));
  }
  statements.push(db.prepare(`UPDATE app_metadata SET value='false',updated_at=CURRENT_TIMESTAMP WHERE key='fresh_database'`));
  statements.push(receiptStatement(db, command, requestJson, fingerprint, receipt));
  await db.batch(statements);
  return receipt;
}

async function processCommandInternal(db: D1Database, raw: unknown): Promise<CommandReceipt> {
  validateCommandShape(raw);
  const command = raw as CommandPayload;
  if (!command.operatorId) throw new DomainError("operator_required", "Select an operator before saving or completing a record.", 422);
  const operator = await db.prepare(`SELECT id,name,active FROM operators WHERE id=?`).bind(command.operatorId).first<{id:string;name:string;active:number}>();
  if (!operator || !Number(operator.active) || operator.name !== command.operator) throw new DomainError("operator_invalid", "The selected operator is no longer valid. Refresh the operator list and choose again.", 422);
  const requestJson = stableStringify(command);
  const fingerprint = await sha256Hex(requestJson);
  const prior = await existingReceipt(db, command.commandId);
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new DomainError("command_id_reused", "This command ID was already used with different contents.", 409);
    const stored = responseFromStored(prior.response_json);
    return { ...stored, outcome: stored.outcome === "accepted" ? "duplicate" : stored.outcome };
  }

  if (command.operation === "adjust_projection" || command.operation === "resolve_projection") {
    return processProjectionCommand(db, command, requestJson, fingerprint);
  }

  const initial = validateAndNormalizeValues(command);
  let current = await getCanonicalRecord(db, command.aggregateId);
  const aggregateRow = await db.prepare(`SELECT form_key,current_revision FROM aggregates WHERE aggregate_id=?`).bind(command.aggregateId).first<{form_key:string;current_revision:number}>();
  const sourceAggregateExists = Boolean(aggregateRow);
  if (aggregateRow && aggregateRow.form_key !== command.formKey) throw new DomainError("form_identity", "An aggregate cannot change form identity.", 409);
  if (aggregateRow && !current && Number(aggregateRow.current_revision) !== 0) throw new DomainError("orphan_aggregate", "The aggregate exists without a readable current revision. Operator action is blocked until repaired.", 409);

  if (!current && command.baseRevision !== null) throw new DomainError("missing_aggregate", "This record does not exist at the supplied server revision.", 409);
  if (!current && command.operation !== "replace") {
    const collision = await db.prepare(`SELECT aggregate_id FROM context_claims WHERE form_key=? AND context_key=?`).bind(command.formKey, initial.contextKey).first<{aggregate_id:string}>();
    if (collision && collision.aggregate_id !== command.aggregateId) {
      const conflict = await getCanonicalRecord(db, collision.aggregate_id);
      return storeRejectedReceipt(db, command, requestJson, fingerprint, { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "collision", conflict: conflict ?? undefined, message: "Another record already owns this context." });
    }
  }

  if (command.operation === "replace") {
    return processReplace(db, command, requestJson, fingerprint, initial.values, initial.contextKey, current, sourceAggregateExists);
  }

  if (current && command.operation !== "resolve_conflict" && command.baseRevision !== current.revision) {
    await openAttention(db, { aggregateId: command.aggregateId, plantDate: current.date, category: "sync", code: "revision_conflict", severity: "warning", message: "A local operation was based on an older server revision.", details: { commandId: command.commandId, baseRevision: command.baseRevision, serverRevision: current.revision } });
    return storeRejectedReceipt(db, command, requestJson, fingerprint, { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "conflict", conflict: current, message: "The server record changed. Choose the whole local or server version." });
  }

  let effectiveCommand = command;
  if (command.operation === "resolve_conflict") {
    if (!current || !command.resolution || command.resolution.serverRevision !== current.revision) {
      return storeRejectedReceipt(db, command, requestJson, fingerprint, { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "conflict", conflict: current ?? undefined, message: "The record changed again before conflict resolution." });
    }
    if (command.resolution.choice === "server") {
      effectiveCommand = {
        ...command,
        context: { date: current.date, shift: current.shift as any, timeSlot: current.timeSlot, boilerNumber: current.boilerNumber as any },
        lifecycle: current.lifecycle === "completed" ? "completed" : "draft",
        values: current.values,
      };
    }
  }

  const normalized = effectiveCommand === command ? initial : validateAndNormalizeValues(effectiveCommand);
  const finalValues = normalized.values;
  const finalContextKey = normalized.contextKey;
  const oldContext = current?.contextKey ?? null;

  const owner = await db.prepare(`SELECT aggregate_id FROM context_claims WHERE form_key=? AND context_key=? AND aggregate_id<>?`).bind(command.formKey, finalContextKey, command.aggregateId).first<{aggregate_id:string}>();
  if (owner) {
    const conflict = await getCanonicalRecord(db, owner.aggregate_id);
    return storeRejectedReceipt(db, command, requestJson, fingerprint, { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "collision", conflict: conflict ?? undefined, message: "The destination context is already owned by another record. Use Replace explicitly if intended." });
  }

  const nextRevision = (current?.revision ?? 0) + 1;
  const revisionId = crypto.randomUUID();
  const publish = publishedFlag(effectiveCommand);
  const hadPublished = current?.publishedRevision != null;
  const aggregateLifecycle = publish ? "completed" : hadPublished ? "completed" : "draft";
  const revisionLifecycle: "draft" | "completed" = publish ? "completed" : "draft";
  const provenance = command.operation === "resolve_conflict" ? { conflictResolution: command.resolution } : command.operation === "move" ? { movedFrom: oldContext } : null;
  const publishedRevision = publish ? nextRevision : current?.publishedRevision ?? null;
  const serverTime = new Date().toISOString();
  const derivedDates = derivedDatesFor(effectiveCommand, current, publish);
  const record = exactAcceptedRecord({ command: effectiveCommand, contextKey: finalContextKey, revision: nextRevision, publishedRevision, lifecycle: revisionLifecycle, values: finalValues, current, provenance, serverTime });
  const receipt: CommandReceipt = { commandId: command.commandId, aggregateId: command.aggregateId, outcome: "accepted", revision: nextRevision, publishedRevision, record, derivedDates };
  const statements: D1PreparedStatement[] = [];

  if (!sourceAggregateExists) statements.push(db.prepare(`INSERT INTO aggregates(aggregate_id,form_key,current_revision,published_revision,lifecycle,context_key) VALUES(?,?,0,NULL,'draft',NULL)`).bind(command.aggregateId, command.formKey));
  if (!current || oldContext !== finalContextKey) {
    if (oldContext) statements.push(db.prepare(`DELETE FROM context_claims WHERE aggregate_id=?`).bind(command.aggregateId));
    statements.push(db.prepare(`INSERT INTO context_claims(form_key,context_key,aggregate_id) VALUES(?,?,?)`).bind(command.formKey, finalContextKey, command.aggregateId));
  }
  statements.push(db.prepare(`INSERT INTO revisions(revision_id,aggregate_id,revision,command_id,operation,form_key,form_version,lifecycle,is_published,context_key,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,provenance_json)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(revisionId, command.aggregateId, nextRevision, command.commandId, command.operation, command.formKey, command.formVersion, revisionLifecycle, publish ? 1 : 0, finalContextKey, effectiveCommand.operatorId ?? null, effectiveCommand.operator, effectiveCommand.context.date, effectiveCommand.context.shift ?? null, effectiveCommand.context.timeSlot ?? null, effectiveCommand.context.boilerNumber ?? null, JSON.stringify(finalValues), provenance ? JSON.stringify(provenance) : null));
  if (publish) statements.push(db.prepare(`UPDATE revisions SET is_published=0 WHERE aggregate_id=? AND revision<>?`).bind(command.aggregateId, nextRevision));
  statements.push(db.prepare(`UPDATE aggregates SET current_revision=?,published_revision=CASE WHEN ?=1 THEN ? ELSE published_revision END,lifecycle=?,context_key=?,updated_at=CURRENT_TIMESTAMP WHERE aggregate_id=?`)
    .bind(nextRevision, publish ? 1 : 0, nextRevision, aggregateLifecycle, finalContextKey, command.aggregateId));
  statements.push(...numericStatements(db, effectiveCommand, revisionId, finalValues, publish));

  if (publish) {
    statements.push(dirtyStatement(db, effectiveCommand.context.date, `Published ${command.formKey} revision changed`));
    if (current && current.date !== effectiveCommand.context.date) statements.push(dirtyStatement(db, current.date, "Record moved away from this plant date"));
    if (command.formKey === "integrator-readings") {
      statements.push(...staleProjectionStatements(db, derivedDates));
      for (const date of derivedDates) statements.push(dirtyStatement(db, date, "Integrator revision changed a derived dependency"));
    }
  }
  statements.push(db.prepare(`UPDATE attention_items SET resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE aggregate_id=? AND resolved_at IS NULL AND code='revision_conflict'`).bind(command.aggregateId));
  statements.push(db.prepare(`UPDATE app_metadata SET value='false',updated_at=CURRENT_TIMESTAMP WHERE key='fresh_database'`));
  statements.push(receiptStatement(db, command, requestJson, fingerprint, receipt));

  try {
    await db.batch(statements);
  } catch (error) {
    const raced = await existingReceipt(db, command.commandId);
    if (raced) {
      if (raced.fingerprint !== fingerprint) throw new DomainError("command_id_reused", "This command ID was concurrently used with different contents.", 409);
      const stored = responseFromStored(raced.response_json);
      return { ...stored, outcome: stored.outcome === "accepted" ? "duplicate" : stored.outcome };
    }
    const latest = await getCanonicalRecord(db, command.aggregateId);
    if (String(error).includes("stale_revision") || String(error).includes("UNIQUE")) {
      const owner = await db.prepare(`SELECT aggregate_id FROM context_claims WHERE form_key=? AND context_key=? AND aggregate_id<>?`).bind(command.formKey, finalContextKey, command.aggregateId).first<{aggregate_id:string}>();
      const collision = owner ? await getCanonicalRecord(db, owner.aggregate_id) : null;
      return storeRejectedReceipt(db, command, requestJson, fingerprint, { commandId: command.commandId, aggregateId: command.aggregateId, outcome: collision ? "collision" : "conflict", conflict: collision ?? latest ?? undefined, message: collision ? "Another record won this context concurrently. Review it and use Replace explicitly if intended." : "The record changed concurrently. Review the latest server record." });
    }
    throw error;
  }
  return receipt;
}

export async function processCommand(db: D1Database, raw: unknown): Promise<CommandReceipt> {
  try {
    return await processCommandInternal(db, raw);
  } catch (error) {
    const commandId = raw && typeof raw === "object" && typeof (raw as any).commandId === "string" ? String((raw as any).commandId) : null;
    if (commandId && String(error).includes("UNIQUE")) {
      const prior = await existingReceipt(db, commandId);
      if (prior) {
        const requestJson = stableStringify(raw);
        const fingerprint = await sha256Hex(requestJson);
        if (prior.fingerprint !== fingerprint) throw new DomainError("command_id_reused", "This command ID was already used with different contents.", 409);
        const stored = responseFromStored(prior.response_json);
        return { ...stored, outcome: stored.outcome === "accepted" ? "duplicate" : stored.outcome };
      }
    }
    throw error;
  }
}
