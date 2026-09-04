/**
 * ECC Operator Daily Backup v2
 *
 * Power Automate parameters:
 *   canonicalJson: exact immutable JSON string sent by the Worker
 *   payloadHash: SHA-256 of canonicalJson calculated by the Worker
 *   generationId: immutable backup generation UUID
 *
 * The script is intentionally idempotent: rerunning it with the same generation
 * clears and rebuilds the nine worksheets from the same canonical JSON.
 */
function main(
  workbook: ExcelScript.Workbook,
  canonicalJson: string,
  payloadHash: string,
  generationId: string
): string {
  type JsonObject = { [key: string]: unknown };
  interface BackupForm {
    formId: string;
    formName: string;
    formVersion: number;
    worksheetName: string;
    standardColumns: string[];
    fieldKeys: string[];
    entries: JsonObject[];
  }
  interface BackupPayload {
    schemaVersion: number;
    contractVersion: string;
    backupDate: string;
    generatedAt: string;
    generationId: string;
    generationNumber: number;
    snapshotBoundary: string;
    forms: BackupForm[];
  }

  const backup = JSON.parse(canonicalJson) as BackupPayload;
  if (!backup || backup.contractVersion !== "ecc-backup-v2" || !Array.isArray(backup.forms)) {
    throw new Error("Invalid ECC v2 backup payload.");
  }
  if (backup.generationId !== generationId) {
    throw new Error("Generation ID does not match the canonical JSON.");
  }
  if (!/^[a-f0-9]{64}$/i.test(payloadHash)) {
    throw new Error("payloadHash must be a 64-character SHA-256 hex digest.");
  }
  if (backup.forms.length !== 9) {
    throw new Error(`Expected 9 form manifests; received ${backup.forms.length}.`);
  }
  const expectedSheets = [
    "01 Cooling Tower", "02 Boiler Water", "03 YST-YK Chiller",
    "04 York Chiller", "05 Daily Consumption", "06 Makeup",
    "07 Pretreatment", "08 Integrator", "09 Gas Turbine",
  ];
  const receivedSheets = backup.forms.map((form) => form.worksheetName);
  if (new Set(receivedSheets).size !== receivedSheets.length || expectedSheets.some((name) => !receivedSheets.includes(name))) {
    throw new Error("The v2 worksheet manifest is incomplete, duplicated, or unexpected.");
  }

  let totalEntries = 0;
  const populatedSheets: string[] = [];
  for (const form of backup.forms) {
    let worksheet = workbook.getWorksheet(form.worksheetName);
    if (!worksheet) worksheet = workbook.addWorksheet(form.worksheetName);

    const entries = Array.isArray(form.entries) ? form.entries : [];
    const columns: string[] = [];
    const seen = new Set<string>();
    const addColumn = (key: string) => {
      if (key && !seen.has(key)) { seen.add(key); columns.push(key); }
    };
    (form.standardColumns ?? []).forEach(addColumn);
    (form.fieldKeys ?? []).forEach(addColumn);
    for (const entry of entries) Object.keys(entry ?? {}).forEach(addColumn);
    if (columns.length === 0) throw new Error(`No columns declared for ${form.worksheetName}.`);

    const used = worksheet.getUsedRange();
    if (used) used.clear(ExcelScript.ClearApplyTo.all);

    const matrix: (string | number | boolean)[][] = [columns];
    for (const entry of entries) {
      const materialized: JsonObject = {
        ...entry,
        backupGenerationId: generationId,
        payloadHash,
        snapshotBoundary: backup.snapshotBoundary,
      };
      matrix.push(columns.map((key) => toExcelValue(materialized[key])));
    }

    const target = worksheet.getRangeByIndexes(0, 0, matrix.length, columns.length);
    target.setValues(matrix);
    target.getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.center);

    const header = worksheet.getRangeByIndexes(0, 0, 1, columns.length);
    header.getFormat().getFill().setColor("#17243A");
    header.getFormat().getFont().setColor("#FFFFFF");
    header.getFormat().getFont().setBold(true);
    header.getFormat().setWrapText(true);
    header.getFormat().setHorizontalAlignment(ExcelScript.HorizontalAlignment.center);
    header.getFormat().setVerticalAlignment(ExcelScript.VerticalAlignment.center);
    header.getFormat().setRowHeight(34);

    worksheet.getFreezePanes().freezeRows(1);
    worksheet.getAutoFilter().remove();
    worksheet.getAutoFilter().apply(target);
    target.getFormat().autofitColumns();
    target.getFormat().autofitRows();

    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const column = worksheet.getRangeByIndexes(0, columnIndex, Math.max(matrix.length, 1), 1);
      const key = columns[columnIndex];
      const width = column.getFormat().getColumnWidth();
      if (["sourceRevisions", "manualAdjustments", "warnings"].includes(key)) {
        column.getFormat().setColumnWidth(260);
        column.getFormat().setWrapText(true);
      } else if (width > 210) {
        column.getFormat().setColumnWidth(210);
      } else if (width < 75) {
        column.getFormat().setColumnWidth(75);
      }
    }
    totalEntries += entries.length;
    populatedSheets.push(form.worksheetName);
  }

  return JSON.stringify({
    success: true,
    contractVersion: backup.contractVersion,
    backupDate: backup.backupDate,
    generationId,
    generationNumber: backup.generationNumber,
    payloadHash,
    snapshotBoundary: backup.snapshotBoundary,
    totalEntries,
    populatedSheets,
  });

  function toExcelValue(value: unknown): string | number | boolean {
    if (value === null || value === undefined) return "";
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (typeof value === "string") return /^[=+\-@]/.test(value) ? "'" + value : value;
    return JSON.stringify(value);
  }
}
