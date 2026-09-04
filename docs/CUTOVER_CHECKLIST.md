# Production Cutover Checklist

Do not enable operator use until every required item is checked.

## Fresh target

- [ ] `npm install` completed without unresolved audit/build errors.
- [ ] `npm run check` passes.
- [ ] `npm test` passes.
- [ ] `npm run db:reset:local` and `npm run smoke:local` pass.
- [ ] `npm run provision:cloud -- --force-new` used if a truly fresh production database is required.
- [ ] Provisioning reports 7+ operator seed rows and zero operational rows.
- [ ] `wrangler.jsonc` points to the intended new D1 UUID.
- [ ] No legacy operational rows were copied into the new database.

## Secrets and deployment

- [ ] New `DEVICE_TOKEN` created and stored with Wrangler secret.
- [ ] Gemini key configured if Form 9 AI is enabled.
- [ ] New Power Automate trigger URL and backup key configured as Wrangler secrets.
- [ ] No real secret is present in source files, docs, shell history intended for sharing, or Git.
- [ ] `npm run deploy` succeeds.
- [ ] `npm run verify:cloud` succeeds after deploy.

## SharePoint v2

- [ ] `ECC_Operator_Daily_Backup_Template_v2.xlsx` uploaded to Templates.
- [ ] `Populate_ECC_Daily_Backup_v2.ts` installed as the selected Office Script.
- [ ] Power Automate v2 flow built according to `POWER_AUTOMATE_BACKUP_V2.md`.
- [ ] Wrong `X-ECC-Backup-Key` returns 401.
- [ ] Same delivery request twice creates no duplicate immutable artifact set.
- [ ] Canonical JSON, Excel and receipt are all present for a successful generation.
- [ ] Worker/System page changes to Verified only after the exact response is received/reconciled.

## Functional qualification

- [ ] Every scenario in `QUALIFICATION_RUNBOOK.md` passes.
- [ ] All nine forms reviewed on Android tablet dimensions.
- [ ] Form 2 OH-ALK server value matches formula regardless of client-supplied value.
- [ ] Form 8 creates/refreshes Form 5 and Form 6 from exact dates.
- [ ] Form 5 Keep manual/Recalculate workflow tested after historical Form 8 amendment.
- [ ] Timed forms reject duplicate date/time ownership and expose Replace explicitly.
- [ ] Boiler form accepts only 2, 3 and 4.
- [ ] Form 9 photo is not persisted in IndexedDB, D1 or SharePoint.

## First production date

- [ ] If Form 5/6 must be Current on first day, the previous calendar day's real Form 8 has been completed. Do not invent or substitute readings.
- [ ] Tablet PWA installed from final deployed HTTPS URL.
- [ ] Device token saved on each authorized tablet.
- [ ] Offline test performed after installation so the application shell is confirmed cached.
- [ ] Operators know the meanings of Saved on this tablet, Waiting for server, Server confirmed, Attention and Backup Verified.

## Hold point

**Operator activation remains blocked until the qualification evidence is reviewed and the fresh D1 target is confirmed to be the intended production target.**
