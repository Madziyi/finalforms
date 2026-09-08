export type FieldType = "number" | "text" | "select" | "duration" | "paired-number" | "computed";
export type Shift = "Day" | "Night" | "Extra";
export type TargetRange = { min?: number; max?: number; label: string };
export type SelectOption = { label: string; value: string };
export type FieldDefinition = {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  target?: TargetRange;
  options?: SelectOption[];
  pairedLabels?: [string, string];
  optional?: boolean;
  infrequent?: boolean;
  trendable?: boolean;
  /** Whether this field participates in previous-measurement/history display. */
  showHistory?: boolean;
  /** Whether this field is shown in completed-record views. */
  recordVisible?: boolean;
  defaultValue?: string | number;
  aiExtract?: boolean;
  calculated?: boolean;
  helpText?: string;
};
export type SectionDefinition = { key: string; title: string; description?: string; fields: FieldDefinition[] };
export type FormDefinition = {
  key: string;
  number: number;
  version: number;
  name: string;
  backupWorksheetName: string;
  description?: string;
  schedule: "daily" | "shift" | "time-slot" | "derived";
  hasShift?: boolean;
  hasTimeSlot?: boolean;
  hasBoiler?: boolean;
  derivedFrom?: string;
  aiAssisted?: boolean;
  sections: SectionDefinition[];
};
export type ScalarValue = string | number | boolean | null;
export type FieldValue = ScalarValue | { first: number | null; second: number | null };
export type Values = Record<string, FieldValue>;
export type Lifecycle = "draft" | "completed" | "superseded";
export type OperationType = "create" | "save_draft" | "complete" | "amend_draft" | "amend_complete" | "move" | "replace" | "resolve_conflict" | "adjust_projection" | "resolve_projection";
export type ContextInput = { date: string; shift?: Shift | null; timeSlot?: string | null; boilerNumber?: 2 | 3 | 4 | null };
export type CanonicalRecord = {
  aggregateId: string;
  formKey: string;
  contextKey: string | null;
  /** Server revision. It is independent from the tablet-local generation. */
  revision: number;
  /** Monotonic tablet snapshot generation that produced this record. */
  generation?: number;
  publishedRevision: number | null;
  lifecycle: Lifecycle;
  operatorId: string | null;
  operator: string;
  date: string;
  shift: string | null;
  timeSlot: string | null;
  boilerNumber: number | null;
  values: Values;
  updatedAt: string;
  createdAt: string;
  provenance?: Record<string, unknown> | null;
};
export type CommandPayload = {
  protocolVersion: number;
  commandId: string;
  aggregateId: string;
  formKey: string;
  formVersion: number;
  operation: OperationType;
  baseRevision: number | null;
  operatorId: string | null;
  operator: string;
  context: ContextInput;
  lifecycle: "draft" | "completed";
  values: Values;
  clientObservedAt: string;
  replacement?: { destinationAggregateId: string; destinationRevision: number };
  resolution?: { choice: "local" | "server"; serverRevision: number };
  adjustment?: { overrides: Record<string, number | string | null>; decision?: "keep" | "recalculate" };
};
export type CommandReceipt = {
  commandId: string;
  aggregateId: string;
  outcome: "accepted" | "duplicate" | "conflict" | "collision" | "validation_error" | "forbidden" | "incompatible";
  revision?: number;
  publishedRevision?: number | null;
  record?: CanonicalRecord;
  conflict?: CanonicalRecord;
  message?: string;
  derivedDates?: string[];
};
/** The v2 local-first upload contract. Drafts never use this contract. */
export type CompletedRecordUpload = {
  protocolVersion: number;
  /** Form contract version captured when the completed snapshot was queued. */
  formVersion?: number;
  record: CanonicalRecord & { lifecycle: "completed" };
  /** Stable idempotency key for this exact queued snapshot. */
  syncId?: string;
  /** Monotonic tablet-local snapshot generation for this record. */
  generation?: number;
  /** Last server revision observed for this canonical ID. */
  baseRevision?: number | null;
  /** Legacy alias retained while older tablets drain their queue. */
  localVersion?: number;
  clientUpdatedAt: string;
  /** Set when a completed record moved to a new canonical ID. */
  movedFromId?: string | null;
};
export type SyncReceipt = {
  syncId: string;
  aggregateId: string;
  outcome: "accepted" | "duplicate" | "stale" | "conflict" | "collision" | "moved";
  revision?: number;
  record?: CanonicalRecord;
  conflict?: CanonicalRecord;
  movedToId?: string;
  message?: string;
};
export type OperatorRecord = { id: string; name: string; active: boolean; createdAt: string; updatedAt: string };
export type ProjectionStatus = "current" | "waiting" | "stale" | "attention" | "failed";
export type DerivedProjection = {
  projectionId: string;
  formKey: "daily-consumption-totals" | "makeup";
  plantDate: string;
  revision: number;
  status: ProjectionStatus;
  baseValues: Values;
  effectiveValues: Values;
  sourceRevisions: Array<{ aggregateId: string; revisionId: string; revision: number; plantDate: string }>;
  adjustments: Record<string, FieldValue>;
  warnings: string[];
  updatedAt: string;
};
