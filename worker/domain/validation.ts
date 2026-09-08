import { allFields, getForm } from "../../shared/forms";
import { BOILER_VALUES, normalizeContext } from "../../shared/safetyContract";
import { calculateOhAlk } from "../../shared/formulas";
import type { CommandPayload, ContextInput, FieldDefinition, FieldValue, Values } from "../../shared/types";

export class DomainError extends Error {
  constructor(public code: string, message: string, public status = 400, public details?: unknown) { super(message); }
}


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

export function validateFormValues(formKey: string, formVersion: number, context: ContextInput, rawValues: unknown): { values: Values; contextKey: string } {
  const form = getForm(formKey);
  if (!form) throw new DomainError("unknown_form", "Unknown form.");
  const legacyForm2 = formKey === "boiler-water-control-tests" && formVersion === 3;
  if (formVersion !== form.version && !legacyForm2) throw new DomainError("form_version", `Form version ${form.version} is required.`, 409);
  if (form.schedule === "derived") {
    throw new DomainError("derived_readonly", "Derived forms are server-owned.", 409);
  }
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) throw new DomainError("invalid_values", "values must be an object.");
  if (form.hasBoiler && !BOILER_VALUES.includes(context.boilerNumber as 2|3|4)) throw new DomainError("invalid_boiler", "Boiler must be 2, 3, or 4.");
  let contextKey: string;
  try { contextKey = normalizeContext(formKey, context); }
  catch (error) { throw new DomainError("invalid_context", error instanceof Error ? error.message : String(error)); }

  const allowed = new Map(allFields(form).map((f) => [f.key, f]));
  if (legacyForm2) {
    allowed.set("p_alk_burette", { key: "p_alk_burette", label: "P-ALK Burette Reading", type: "number" });
    allowed.set("m_alk_burette", { key: "m_alk_burette", label: "M-ALK Burette Reading", type: "number" });
  }
  const values: Values = {};
  for (const [key, value] of Object.entries(rawValues)) {
    const field = allowed.get(key);
    if (!field) throw new DomainError("unknown_field", `Unknown field ${key}.`);
    if (field.calculated && formKey === "boiler-water-control-tests" && (legacyForm2 || key === "oh_alk")) continue;
    validateFieldValue(field, value);
    values[key] = value as FieldValue;
  }
  if (legacyForm2) {
    const pBurette = values.p_alk_burette;
    const mBurette = values.m_alk_burette;
    values.p_alk = isFiniteNumber(pBurette) ? pBurette * 20 : null;
    values.m_alk = isFiniteNumber(mBurette) ? mBurette * 20 : null;
    values.oh_alk = calculateOhAlk(values.p_alk, values.m_alk);
    delete values.p_alk_burette;
    delete values.m_alk_burette;
  } else if (formKey === "boiler-water-control-tests") {
    values.oh_alk = calculateOhAlk(values.p_alk, values.m_alk);
  }

  // Local-first completion requires only the selected operator and valid
  // context metadata. Blank readings are meaningful and remain in the record.
  return { values, contextKey };
}

export function validateAndNormalizeValues(command: CommandPayload): { values: Values; contextKey: string } {
  return validateFormValues(command.formKey, command.formVersion, command.context, command.values);
}
