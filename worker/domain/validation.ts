import { allFields, getForm } from "../../shared/forms";
import { BOILER_VALUES, PROTOCOL_VERSION, normalizeContext } from "../../shared/safetyContract";
import { calculateOhAlk } from "../../shared/formulas";
import type { CommandPayload, ContextInput, FieldDefinition, FieldValue, Values } from "../../shared/types";

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) { super(message); }
}


const OPERATIONS = new Set(["create","save_draft","complete","amend_draft","amend_complete","move","replace","resolve_conflict"]);
const DRAFT_OPERATIONS = new Set(["create","save_draft","amend_draft"]);
const COMPLETED_OPERATIONS = new Set(["complete","amend_complete","move","replace"]);

function isFiniteNumber(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
function validateFieldValue(field: FieldDefinition, value: unknown) {
  if (value === null) return;
  switch (field.type) {
    case "number":
    case "computed":
      if (!isFiniteNumber(value)) throw new DomainError("invalid_value", `${field.label} must be a finite number or blank.`);
      return;
    case "duration":
      if (!isFiniteNumber(value) || value < 0 || !Number.isInteger(value)) throw new DomainError("invalid_value", `${field.label} must be whole minutes or blank.`);
      return;
    case "text":
      if (typeof value !== "string") throw new DomainError("invalid_value", `${field.label} must be text or blank.`);
      return;
    case "select": {
      if (typeof value !== "string" || !field.options?.some((option) => option.value === value)) throw new DomainError("invalid_value", `${field.label} contains an invalid selection.`);
      return;
    }
    case "paired-number": {
      if (typeof value !== "object" || value === null || Array.isArray(value) || !("first" in value) || !("second" in value)) throw new DomainError("invalid_value", `${field.label} must contain both paired readings.`);
      const pair = value as { first: unknown; second: unknown };
      if (!(pair.first === null || isFiniteNumber(pair.first)) || !(pair.second === null || isFiniteNumber(pair.second))) throw new DomainError("invalid_value", `${field.label} contains an invalid paired reading.`);
      return;
    }
  }
}

function valuePresent(field: FieldDefinition, value: FieldValue | undefined) {
  if (value === undefined || value === null || value === "") return false;
  if (field.type === "paired-number") return typeof value === "object" && value !== null && "first" in value && value.first !== null && value.second !== null;
  return true;
}

export function validateCommandShape(input: unknown): asserts input is CommandPayload {
  if (!input || typeof input !== "object") throw new DomainError("invalid_command", "Command body must be an object.");
  const c = input as Partial<CommandPayload>;
  // /api/commands is the retained v1 compatibility path. Active tablets use
  // /api/completed and the v2 protocol, so do not reinterpret old commands.
  if (c.protocolVersion !== 1) throw new DomainError("incompatible", "The legacy command endpoint requires protocol 1.", 426);
  for (const key of ["commandId", "aggregateId", "formKey", "operation", "operator", "clientObservedAt"] as const) {
    if (!c[key] || typeof c[key] !== "string") throw new DomainError("invalid_command", `${key} is required.`);
  }
  if (!OPERATIONS.has(c.operation!)) {
    if (c.operation === "adjust_projection" || c.operation === "resolve_projection") throw new DomainError("derived_readonly", "Forms 5 and 6 are server-derived; manual adjustments are no longer supported.", 409);
    throw new DomainError("invalid_operation", `Unsupported operation ${String(c.operation)}.`);
  }
  if (c.lifecycle !== "draft" && c.lifecycle !== "completed") throw new DomainError("invalid_lifecycle", "lifecycle must be draft or completed.");
  if (DRAFT_OPERATIONS.has(c.operation!) && c.lifecycle !== "draft") throw new DomainError("invalid_lifecycle", `${c.operation} requires draft lifecycle.`);
  if (COMPLETED_OPERATIONS.has(c.operation!) && c.lifecycle !== "completed") throw new DomainError("invalid_lifecycle", `${c.operation} requires completed lifecycle.`);
  if (!c.context || typeof c.context.date !== "string") throw new DomainError("invalid_context", "Plant date is required.");
  if (!c.values || typeof c.values !== "object" || Array.isArray(c.values)) throw new DomainError("invalid_values", "values must be an object.");
  if (!Number.isInteger(c.formVersion) || Number(c.formVersion) <= 0) throw new DomainError("invalid_form_version", "formVersion must be a positive integer.");
  if (c.baseRevision !== null && c.baseRevision !== undefined && (!Number.isInteger(c.baseRevision) || c.baseRevision < 0)) throw new DomainError("invalid_revision", "baseRevision must be a non-negative integer or null.");
  if (Number.isNaN(Date.parse(c.clientObservedAt!))) throw new DomainError("invalid_timestamp", "clientObservedAt must be an ISO timestamp.");
  if (c.operation === "replace" && (!c.replacement || typeof c.replacement.destinationAggregateId !== "string" || !Number.isInteger(c.replacement.destinationRevision))) throw new DomainError("replace_missing", "Replacement destination and revision are required.");
  if (c.operation === "resolve_conflict" && (!c.resolution || !["local","server"].includes(c.resolution.choice) || !Number.isInteger(c.resolution.serverRevision))) throw new DomainError("resolution_missing", "Conflict resolution details are required.");
  if ((c.operation === "adjust_projection" || c.operation === "resolve_projection") && !c.adjustment) throw new DomainError("invalid_adjustment", "Projection adjustment details are required.");
}

export function validateFormValues(formKey: string, formVersion: number, context: ContextInput, rawValues: unknown): { values: Values; contextKey: string } {
  const form = getForm(formKey);
  if (!form) throw new DomainError("unknown_form", "Unknown form.");
  if (formVersion !== form.version) throw new DomainError("form_version", `Form version ${form.version} is required.`, 409);
  if (form.schedule === "derived") {
    throw new DomainError("derived_readonly", "Derived forms are server-owned.", 409);
  }
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) throw new DomainError("invalid_values", "values must be an object.");
  if (form.hasBoiler && !BOILER_VALUES.includes(context.boilerNumber as 2|3|4)) throw new DomainError("invalid_boiler", "Boiler must be 2, 3, or 4.");
  let contextKey: string;
  try { contextKey = normalizeContext(formKey, context); }
  catch (error) { throw new DomainError("invalid_context", error instanceof Error ? error.message : String(error)); }

  const allowed = new Map(allFields(form).map((f) => [f.key, f]));
  const values: Values = {};
  for (const [key, value] of Object.entries(rawValues)) {
    const field = allowed.get(key);
    if (!field) throw new DomainError("unknown_field", `Unknown field ${key}.`);
    if (field.calculated && formKey === "boiler-water-control-tests" && key === "oh_alk") continue;
    validateFieldValue(field, value);
    values[key] = value as FieldValue;
  }
  if (formKey === "boiler-water-control-tests") {
    values.oh_alk = calculateOhAlk(values.p_alk, values.m_alk);
  }

  // Local-first completion requires only the selected operator and valid
  // context metadata. Blank readings are meaningful and remain in the record.
  return { values, contextKey };
}

export function validateAndNormalizeValues(command: CommandPayload): { values: Values; contextKey: string } {
  return validateFormValues(command.formKey, command.formVersion, command.context, command.values);
}
