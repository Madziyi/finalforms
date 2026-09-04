# Delivery Notes — ECC Operator PWA v1 Reliability Rebuild

This package is the clean-slate rebuild. It does **not** reuse the old D1 database or old submission pathway.

## Included

- React/Vite Android-installable PWA
- IndexedDB/Dexie durable local checkpoints and outbox
- explicit draft/complete/amend/move/replace/conflict workflows
- immutable command IDs, fingerprints, D1 command receipts and server revisions
- normalized context ownership and collision protection
- published completed revision separated from in-progress amendment work
- server-authoritative Form 2 OH-ALK calculation
- server-owned Form 5 and Form 6 derived projections from accepted Form 8 revisions
- provenance/manual-adjustment handling for Form 5
- fresh D1 baseline schema and Windows-safe automatic cloud provisioning
- Cloudflare Worker API and backup Workflow
- immutable backup generations with JSON/XLSX/receipt verification contract
- SharePoint Excel template v2 and Office Script v2
- Power Automate v2 setup guide
- architecture, qualification and production-cutover documentation
- local/cloud verification and smoke scripts
- automated tests for formulas, manifest and safety-contract logic

## Intentionally left for Windows

Dependency installation and dependency-level build execution were intentionally left for the target Windows machine.

Run, in order:

```powershell
npm install
npm run check
npm test
npm run db:reset:local
npm run smoke:local
npm run dev
```

After local qualification, create the new Cloudflare database and deploy:

```powershell
npx wrangler login
npm run provision:cloud
powershell -ExecutionPolicy Bypass -File .\scripts\configure-secrets.ps1
npm run deploy
npm run verify:cloud
```

Do not enable operators until the qualification runbook and cutover checklist are complete.
