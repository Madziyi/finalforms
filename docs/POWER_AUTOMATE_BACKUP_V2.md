# ECC Operator Backup v2 — Power Automate / SharePoint Adapter

## Contract

Power Automate is a **delivery adapter only**. It must not calculate Forms 2/5/6, choose plant dates, filter operational records, or own retry policy. Cloudflare/D1 freezes the exact snapshot, hash, generation and filenames. Power Automate stores those immutable bytes, creates Excel, writes a receipt **last**, and echoes the exact identity.

`canonicalJson` is the authoritative export snapshot. It includes the published canonical records plus the current Form 5 and Form 6 derived projections. The Worker has already materialized any export-only display values before it sends the request:

- Form 8 `OAT High` and `OAT Low` are the maximum/minimum completed same-date Form 9 `O.A.T. Memorial` readings.
- Form 2 `Total Steam` and `Total Makeup` are supplied from the current Form 5 projection for all boilers: night shift uses the same plant date, day shift uses the prior plant date, and extra shift is blank.

Those values are included in JSON and Excel so backups are readable and complete. They do **not** turn Form 2 or Form 8 display-only fields into operator-entered values, and Power Automate must not recompute, replace, or omit them.

### SharePoint

Site: `FAC - Trades`

Library: `Documents`

Paths relative to the Documents library:

```text
Energy Conversion Centre/Electronic Forms/ECC Operator Backups/Templates
Energy Conversion Centre/Electronic Forms/ECC Operator Backups/Daily/YYYY/MM
```

Template:

```text
ECC_Operator_Daily_Backup_Template_v2.xlsx
```

Use the generated workbook named above. It must contain these exact worksheet names (the Office Script validates this manifest):

```text
01 Cooling Tower
02 Boiler Water
03 YST-YK Chiller
04 York Chiller
05 Daily Consumption
06 Makeup
07 Pretreatment
08 Integrator
09 Gas Turbine
```

The script clears and rebuilds the contents of these sheets for each immutable generation; the template is a controlled shell, not a manually maintained report.

Each generation produces:

```text
<immutable generation>.json          authoritative canonical snapshot
<immutable generation>.xlsx          human-readable representation
<immutable generation>.receipt.json  completion marker, written last
```

Never delete or overwrite these generation files.

## Trigger

Use **When an HTTP request is received**. `Who can trigger` may be `Anyone`; the Worker adds a second shared-secret header.

Request schema:

```json
{
  "type": "object",
  "properties": {
    "contractVersion": { "type": "string" },
    "deliveryId": { "type": "string" },
    "generationId": { "type": "string" },
    "generationNumber": { "type": "integer" },
    "backupDate": { "type": "string" },
    "payloadHash": { "type": "string" },
    "jsonFileName": { "type": "string" },
    "xlsxFileName": { "type": "string" },
    "receiptFileName": { "type": "string" },
    "canonicalJson": { "type": "string" }
  },
  "required": ["contractVersion","deliveryId","generationId","generationNumber","backupDate","payloadHash","jsonFileName","xlsxFileName","receiptFileName","canonicalJson"]
}
```

## 1. Authenticate

Condition left side must be entered through **Expression / fx**:

```text
trim(string(triggerOutputs()?['headers']?['x-ecc-backup-key']))
```

Operator: `is equal to`

Right: the backup key also stored in Cloudflare as `POWER_AUTOMATE_BACKUP_KEY`.

False branch: **Response 401**

```json
{"success":false,"error":"Invalid backup key"}
```

Do not use only Terminate; the caller requires an HTTP response.

## 2. Validate contract

Condition, fx:

```text
triggerBody()?['contractVersion']
```

must equal:

```text
ecc-backup-v2
```

False → Response 400.

## 3. Composes

Every formula below must be inserted with **fx**. Do not type `outputs(...)` as literal text.

**Backup Date**

```text
triggerBody()?['backupDate']
```

**Year**

```text
substring(outputs('Backup_Date'),0,4)
```

**Month**

```text
substring(outputs('Backup_Date'),5,2)
```

**Year Folder**

```text
concat('Energy Conversion Centre/Electronic Forms/ECC Operator Backups/Daily/',outputs('Year'))
```

**Destination Folder**

```text
concat(outputs('Year_Folder'),'/',outputs('Month'))
```

**Receipt Filter**

```text
concat('FileLeafRef eq ''',triggerBody()?['receiptFileName'],'''')
```

**JSON Filter**

```text
concat('FileLeafRef eq ''',triggerBody()?['jsonFileName'],'''')
```

**Excel Filter**

```text
concat('FileLeafRef eq ''',triggerBody()?['xlsxFileName'],'''')
```

## 4. Ensure year/month folders

Use SharePoint **Create new folder** twice:

1. Folder Path = dynamic output token **Year Folder**
2. Folder Path = dynamic output token **Destination Folder**

Site = FAC - Trades, Library = Documents.

For step 2, configure **Run after** for year-folder step on both success and failure, because “already exists” may be reported as failure. The later lookup is the actual path validation.

For all actions with Library already selected as `Documents`, paths are relative and **must not** begin with `Shared Documents/`.

## 5. Receipt-first idempotency gate

Get files (properties only):

- Library: Documents
- Filter Query: **Receipt Filter** output
- Limit Entries to Folder: **Destination Folder** output
- Top Count: 1

Condition:

```text
length(body('Get_receipt_files_(properties_only)')?['value'])
```

is greater than `0`.

### Receipt exists

Get its file content and parse the receipt JSON. Verify at minimum:

```text
receipt generationId == trigger generationId
receipt payloadHash == trigger payloadHash
receipt jsonFileName == trigger jsonFileName
receipt xlsxFileName == trigger xlsxFileName
receipt receiptFileName == trigger receiptFileName
receipt success == true
```

If verified, immediately Response 200 with the exact identity body shown in section 11. This is how an ambiguous earlier timeout reconciles without rewriting files.

If a receipt with the expected immutable filename exists but its contents do not match, Response 409 and stop. Do not overwrite it.

### Receipt absent

Continue below.

## 6. Ensure canonical JSON exists

Get files (properties only) using **JSON Filter**, destination folder, Top Count 1.

If absent, SharePoint **Create file**:

- Folder Path = Destination Folder token
- File Name = `triggerBody()?['jsonFileName']` via dynamic content/fx
- File Content = `triggerBody()?['canonicalJson']`

If present, leave it unchanged. Immutable filenames make overwrite unnecessary.

## 7. Ensure Excel file exists

Get template content using path:

```text
/Shared Documents/Energy Conversion Centre/Electronic Forms/ECC Operator Backups/Templates/ECC_Operator_Daily_Backup_Template_v2.xlsx
```

`Get file content using path` expects the site/library path, so `/Shared Documents/...` is appropriate here.

Then Get files (properties only) using **Excel Filter** in Destination Folder.

- If absent: **Create file** from template content.
- If present: reuse it. Do not delete it.

This avoids the SharePoint/Excel lock failure caused by delete-and-immediate-recreate.

## 8. Resolve the Excel file identifier

After creating/reusing the file, use **Get file metadata using path** with fx:

```text
concat(
  '/Shared Documents/',
  outputs('Destination_Folder'),
  '/',
  triggerBody()?['xlsxFileName']
)
```

A short Delay (for example 5–10 seconds) before metadata/script is acceptable if the tenant needs propagation time.

## 9. Run Office Script

Excel Online (Business) → **Run script**:

- file: Identifier from metadata
- script: `Populate ECC Daily Backup v2`

Parameters must be dynamic tokens / fx, not literal text:

**canonicalJson**

```text
triggerBody()?['canonicalJson']
```

**payloadHash**

```text
triggerBody()?['payloadHash']
```

**generationId**

```text
triggerBody()?['generationId']
```

The script validates contract/generation/worksheet manifest, clears and rebuilds exactly nine worksheets, preserves numeric zero vs blank, prevents formula injection for text, and returns a JSON success summary. Derived-projection rows and the Worker-materialized display values are ordinary snapshot fields at this stage: write what the payload contains.

## 10. Write receipt LAST

Only after Run script succeeds, Compose a receipt object/string containing:

```json
{
  "success": true,
  "contractVersion": "ecc-backup-v2",
  "deliveryId": "<trigger deliveryId>",
  "generationId": "<trigger generationId>",
  "generationNumber": 1,
  "backupDate": "YYYY-MM-DD",
  "payloadHash": "<trigger payloadHash>",
  "jsonFileName": "<trigger jsonFileName>",
  "xlsxFileName": "<trigger xlsxFileName>",
  "receiptFileName": "<trigger receiptFileName>"
}
```

Create it in Destination Folder with File Name = `receiptFileName`.

The receipt is the completion marker. It must never be created before Excel succeeds.

If receipt creation encounters “already exists” because two identical deliveries raced, re-run the receipt lookup/verification path instead of creating a new name.

## 11. Response

Response 200 with exactly the identity Cloudflare verifies:

```json
{
  "success": true,
  "contractVersion": "ecc-backup-v2",
  "deliveryId": "@{triggerBody()?['deliveryId']}",
  "generationId": "@{triggerBody()?['generationId']}",
  "generationNumber": "@{triggerBody()?['generationNumber']}",
  "backupDate": "@{triggerBody()?['backupDate']}",
  "payloadHash": "@{triggerBody()?['payloadHash']}",
  "jsonFileName": "@{triggerBody()?['jsonFileName']}",
  "xlsxFileName": "@{triggerBody()?['xlsxFileName']}",
  "receiptFileName": "@{triggerBody()?['receiptFileName']}"
}
```

Use dynamic content tokens or fx for each value. Do not paste the `@{...}` strings as plain text.

## 12. Failure behavior

- Auth/contract errors: explicit 4xx response.
- SharePoint/Excel transient error: allow the flow to fail. Cloudflare Workflow records Reconciling and retries.
- Never manufacture a successful response if the receipt was not written/verified.
- Never rename with `(1)` or random suffixes. The Worker already supplies immutable unique names.
- Never delete previous generation files.

## Final tests

1. Correct key → success.
2. Wrong key → 401.
3. Same envelope twice → same three immutable files, no `(1)` duplicate.
4. Simulate lost HTTP response after receipt write → next Worker retry finds receipt and verifies.
5. Historical D1 amendment → new generation number/files while old generation remains unchanged.
6. Open XLSX → all nine worksheets present; blank remains blank and numeric 0 remains 0.
7. Use a snapshot containing Form 8 OAT extrema and Form 2 day/night totals → those display-only values appear in both the JSON and relevant Excel rows; Form 2 extra-shift totals remain blank.
