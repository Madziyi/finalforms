import Dexie, { type EntityTable } from "dexie";
import { allFields, getForm } from "../../shared/forms";
import { normalizeContext } from "../../shared/safetyContract";
import type { CanonicalRecord, CommandPayload, CommandReceipt, CompletedRecordUpload, ContextInput, FieldValue, Lifecycle, OperationType, OperatorRecord, Values } from "../../shared/types";

export type SyncState = "local"|"waiting"|"syncing"|"confirmed"|"conflict"|"attention";
export type LocalAggregate = {
  aggregateId:string; formKey:string; formVersion:number; checkpointVersion:number; operatorId:string|null; operator:string; date:string; shift:"Day"|"Night"|null; timeSlot:string|null; boilerNumber:2|3|4|null; workingValues:Values; localLifecycle:"draft"|"completed"; serverRecord:CanonicalRecord|null; publishedRecord:CanonicalRecord|null; amendment:boolean; moveIntent:boolean; syncState:SyncState; checkpointAt:string; createdAt:string; updatedAt:string; storageError?:string|null;
};
export type LocalCommandStatus="pending"|"sending"|"retry"|"acked"|"conflict"|"permanent"|"superseded"|"resolved";
export type LocalCommand={commandId:string;aggregateId:string;formKey:string;status:LocalCommandStatus;operation:OperationType;baseRevision:number|null;checkpointVersion:number;payload:CommandPayload;createdAt:string;updatedAt:string;attempts:number;nextAttemptAt:string|null;lastError:string|null;receipt:CommandReceipt|null;supersededBy:string|null};
export type CachedServerRecord={aggregateId:string;formKey:string;date:string;record:CanonicalRecord;cachedAt:string};
export type MetaRow={key:string;value:any;updatedAt:string};
export type LocalEntryStatus = "draft" | "completed";
export type LocalEntry = {
  entryId:string; formKey:string; formVersion:number; contextKey:string|null; context:ContextInput;
  operatorId:string|null; operator:string; values:Values; status:LocalEntryStatus;
  /** Monotonic version of the local snapshot. It is also the upload's version token. */
  localVersion:number;
  createdAt:string; updatedAt:string; completedAt:string|null; temporaryEdit:boolean;
  storageError?:string|null; uploadError?:string|null;
};
export type CompletedSyncStatus = "pending" | "uploading" | "retry" | "failed" | "synced";
export type CompletedSyncItem = {
  entryId:string; payload:CompletedRecordUpload; status:CompletedSyncStatus; attempts:number;
  nextAttemptAt:string|null; lastError:string|null; updatedAt:string;
};

class OfflineDb extends Dexie {
  aggregates!:EntityTable<LocalAggregate,"aggregateId">;
  commands!:EntityTable<LocalCommand,"commandId">;
  operators!:EntityTable<OperatorRecord,"id">;
  serverCache!:EntityTable<CachedServerRecord,"aggregateId">;
  meta!:EntityTable<MetaRow,"key">;
  entries!:EntityTable<LocalEntry,"entryId">;
  completedSync!:EntityTable<CompletedSyncItem,"entryId">;
  constructor(){super("ecc-operator-v1");this.version(1).stores({aggregates:"&aggregateId,formKey,date,updatedAt,syncState",commands:"&commandId,aggregateId,status,createdAt,nextAttemptAt,[aggregateId+createdAt]",operators:"&id,active,name",serverCache:"&aggregateId,formKey,date,cachedAt",meta:"&key,updatedAt"});this.version(2).stores({aggregates:"&aggregateId,formKey,date,updatedAt,syncState",commands:"&commandId,aggregateId,status,createdAt,nextAttemptAt,[aggregateId+createdAt]",operators:"&id,active,name",serverCache:"&aggregateId,formKey,date,cachedAt",meta:"&key,updatedAt",entries:"&entryId,formKey,contextKey,status,updatedAt,[formKey+contextKey]",completedSync:"&entryId,status,updatedAt,nextAttemptAt"});}
}
export const offlineDb=new OfflineDb();
export const localEvents=new BroadcastChannel("ecc-operator-v1-events");

function contextForAggregate(aggregate:LocalAggregate):ContextInput { return { date:aggregate.date, shift:aggregate.shift, timeSlot:aggregate.timeSlot, boilerNumber:aggregate.boilerNumber }; }
export function localEntryFromAggregate(aggregate:LocalAggregate):LocalEntry {
  let contextKey:string|null=null;
  try { contextKey=normalizeContext(aggregate.formKey,contextForAggregate(aggregate)); } catch { /* incomplete drafts are still recoverable */ }
  return { entryId:aggregate.aggregateId,formKey:aggregate.formKey,formVersion:aggregate.formVersion,contextKey,context:contextForAggregate(aggregate),operatorId:aggregate.operatorId,operator:aggregate.operator,values:structuredClone(aggregate.workingValues),status:aggregate.localLifecycle,localVersion:aggregate.checkpointVersion,createdAt:aggregate.createdAt,updatedAt:aggregate.updatedAt,completedAt:aggregate.localLifecycle==="completed"?aggregate.updatedAt:null,temporaryEdit:aggregate.amendment,storageError:aggregate.storageError??null,uploadError:null };
}
export function aggregateFromEntry(entry:LocalEntry):LocalAggregate {
  return { aggregateId:entry.entryId,formKey:entry.formKey,formVersion:entry.formVersion,checkpointVersion:0,operatorId:entry.operatorId,operator:entry.operator,date:entry.context.date,shift:entry.context.shift??null,timeSlot:entry.context.timeSlot??null,boilerNumber:entry.context.boilerNumber??null,workingValues:structuredClone(entry.values),localLifecycle:entry.status,serverRecord:null,publishedRecord:null,amendment:entry.temporaryEdit,moveIntent:false,syncState:entry.uploadError?"attention":entry.status==="completed"?"waiting":"local",checkpointAt:entry.updatedAt,createdAt:entry.createdAt,updatedAt:entry.updatedAt,storageError:entry.storageError??null };
}

export function localEntryFromRecord(record:CanonicalRecord):LocalEntry {
  const completed=record.lifecycle==="completed";
  return {entryId:record.aggregateId,formKey:record.formKey,formVersion:getForm(record.formKey)?.version??1,contextKey:record.contextKey,context:{date:record.date,shift:record.shift as ContextInput["shift"],timeSlot:record.timeSlot,boilerNumber:record.boilerNumber as ContextInput["boilerNumber"]},operatorId:record.operatorId,operator:record.operator,values:structuredClone(record.values),status:completed?"completed":"draft",localVersion:Math.max(0,record.revision??0),createdAt:record.createdAt,updatedAt:record.updatedAt,completedAt:completed?record.updatedAt:null,temporaryEdit:false,storageError:null,uploadError:null};
}

/** Copy v1 checkpoints into the v2 entry store without deleting the old data. */
export async function migrateV1LocalData() {
  const marker=await offlineDb.meta.get("local_first_migrated"); if(marker) return;
  const old=await offlineDb.aggregates.toArray();
  await offlineDb.transaction("rw",offlineDb.entries,offlineDb.meta,async()=>{
    for(const aggregate of old){
      if(await offlineDb.entries.get(aggregate.aggregateId))continue;
      const next=normalizedEntry(localEntryFromAggregate(aggregate),aggregate.updatedAt);
      const collision=await completedContextCollision(next);
      if(collision){if(collision.status==="completed")continue;await offlineDb.entries.delete(collision.entryId);}
      await offlineDb.entries.put(next);
    }
    await offlineDb.meta.put({key:"local_first_migrated",value:{from:1,to:2,at:new Date().toISOString()},updatedAt:new Date().toISOString()});
  });
}

export function contextInput(entry:Pick<LocalEntry,"context">):ContextInput { return structuredClone(entry.context); }
export function contextKeyFor(formKey:string,context:ContextInput):string|null { try{return normalizeContext(formKey,context);}catch{return null;} }
export function newLocalEntry(formKey:string,date=new Date().toISOString().slice(0,10)):LocalEntry { const form=getForm(formKey);if(!form)throw new Error("Unknown form");const now=new Date().toISOString();return {entryId:crypto.randomUUID(),formKey,formVersion:form.version,contextKey:contextKeyFor(formKey,{date}),context:{date},operatorId:null,operator:"",values:defaultValues(formKey),status:"draft",localVersion:0,createdAt:now,updatedAt:now,completedAt:null,temporaryEdit:false,storageError:null,uploadError:null}; }
function entryVersion(entry:Pick<LocalEntry,"localVersion">|Partial<LocalEntry>){return Number.isInteger(entry.localVersion)&&Number(entry.localVersion)>=0?Number(entry.localVersion):0;}
function normalizedEntry(entry:LocalEntry,updatedAt=new Date().toISOString()):LocalEntry{return {...entry,localVersion:entryVersion(entry),context:structuredClone(entry.context),contextKey:contextKeyFor(entry.formKey,entry.context),values:structuredClone(entry.values),updatedAt,storageError:null};}
async function completedContextCollision(next:LocalEntry){
  if(!next.contextKey)return null;
  const matches=await (offlineDb.entries.where("[formKey+contextKey]") as any).equals([next.formKey,next.contextKey]).toArray() as LocalEntry[];
  return matches.find((candidate)=>candidate.entryId!==next.entryId&&(candidate.status==="completed"||next.status==="completed"))??null;
}
export class DuplicateContextError extends Error {
  constructor(public readonly collision:LocalEntry){super("This normalized context already has a completed local entry. Open it, replace it explicitly, or choose another context.");this.name="DuplicateContextError";}
}
function assertCompletableEntry(next:LocalEntry){
  if(next.status==="completed"&&!next.contextKey)throw new Error("Completed entries require a complete normalized context.");
}
export async function saveLocalEntry(entry:LocalEntry):Promise<LocalEntry>{const next=normalizedEntry(entry);try{await offlineDb.transaction("rw",offlineDb.entries,async()=>{const existing=await offlineDb.entries.get(next.entryId);if(existing&&entryVersion(existing)>next.localVersion)throw new Error("A newer local entry version already exists on this tablet.");assertCompletableEntry(next);const collision=await completedContextCollision(next);if(collision)throw new DuplicateContextError(collision);await offlineDb.entries.put(next);});emit("entry-saved",{entryId:next.entryId,localVersion:next.localVersion});return next;}catch(error){if(error instanceof DuplicateContextError)throw error;const message=`Local storage save failed: ${error instanceof Error?error.message:String(error)}. Check free space, browser storage permission, and reload only after the entry is safe.`;try{await offlineDb.entries.update(entry.entryId,{storageError:message});}catch{/* the diagnostic itself may be unable to persist */}throw new Error(message);}}
export async function loadLocalEntry(id:string){return offlineDb.entries.get(id);}
export async function listLocalEntries(formKey?:string){return formKey?offlineDb.entries.where("formKey").equals(formKey).reverse().sortBy("updatedAt"):offlineDb.entries.orderBy("updatedAt").reverse().toArray();}
export async function findLocalEntry(formKey:string,key:string){return (await offlineDb.entries.where("[formKey+contextKey]").equals([formKey,key]).first())??null;}
export async function deleteLocalEntry(entryId:string){await offlineDb.transaction("rw",offlineDb.entries,offlineDb.completedSync,async()=>{await offlineDb.entries.delete(entryId);await offlineDb.completedSync.delete(entryId);});emit("entry-deleted",{entryId});}
/** Replace an entry atomically. Used by the duplicate-context flow. */
export async function replaceLocalEntry(sourceEntryId:string,next:LocalEntry,options:{queueCompleted?:boolean}={}){
  const saved=normalizedEntry(next);
  assertCompletableEntry(saved);
  await offlineDb.transaction("rw",offlineDb.entries,offlineDb.completedSync,async()=>{
    const sameContext=await (offlineDb.entries.where("[formKey+contextKey]") as any).equals([saved.formKey,saved.contextKey]).toArray() as LocalEntry[];
    for(const existing of sameContext){
      if(existing.entryId!==saved.entryId){
        await offlineDb.entries.delete(existing.entryId);
        await offlineDb.completedSync.delete(existing.entryId);
      }
    }
    if(sourceEntryId!==saved.entryId)await offlineDb.completedSync.delete(sourceEntryId);
    await offlineDb.entries.put(saved);
    if(saved.status!=="completed") await offlineDb.completedSync.delete(saved.entryId);
    else if(!saved.temporaryEdit&&options.queueCompleted!==false) await putCompletedSync(saved);
    // A temporary edit is a local working copy only. Preserve a same-ID
    // baseline queue item, but never create or replace it with the edit.
  });
  emit("entry-replaced",{entryId:saved.entryId});
  return saved;
}
export async function saveLocalAggregateAsEntry(aggregate:LocalAggregate){const entry=await saveLocalEntry(localEntryFromAggregate(aggregate));return {...aggregateFromEntry(entry),checkpointVersion:aggregate.checkpointVersion,serverRecord:aggregate.serverRecord,publishedRecord:aggregate.publishedRecord};}
export async function discardTemporaryEdit(baseline:LocalEntry,minimumVersion=entryVersion(baseline)){const current=await offlineDb.entries.get(baseline.entryId);const restored={...baseline,temporaryEdit:false,localVersion:Math.max(entryVersion(baseline),entryVersion(current??baseline),minimumVersion)+1,uploadError:null};if(restored.status==="completed")return replaceLocalEntry(restored.entryId,restored,{queueCompleted:false});return saveLocalEntry(restored);}
export async function localEntryToRecord(entry:LocalEntry):Promise<CanonicalRecord>{const contextKey=entry.contextKey??contextKeyFor(entry.formKey,entry.context)??entry.context.date;const version=entryVersion(entry);return {aggregateId:entry.entryId,formKey:entry.formKey,contextKey,revision:version,publishedRevision:entry.status==="completed"?version:null,lifecycle:entry.status,operatorId:entry.operatorId,operator:entry.operator,date:entry.context.date,shift:entry.context.shift??null,timeSlot:entry.context.timeSlot??null,boilerNumber:entry.context.boilerNumber??null,values:structuredClone(entry.values),createdAt:entry.createdAt,updatedAt:entry.updatedAt,provenance:{source:"local-first",status:entry.status,localVersion:version,uploadError:entry.uploadError??null}};}
async function putCompletedSync(entry:LocalEntry){const record=await localEntryToRecord(entry);const payload:CompletedRecordUpload={protocolVersion:2,record:record as CanonicalRecord & {lifecycle:"completed"},localVersion:entryVersion(entry),clientUpdatedAt:entry.updatedAt};const existing=await offlineDb.completedSync.get(entry.entryId);const existingVersion=existing?entryVersion({localVersion:existing.payload.localVersion}):-1;if(existing&&existingVersion>payload.localVersion)return existing;const item:CompletedSyncItem={entryId:entry.entryId,payload,status:"pending",attempts:0,nextAttemptAt:null,lastError:null,updatedAt:new Date().toISOString()};await offlineDb.completedSync.put(item);return item;}
export async function enqueueCompleted(entry:LocalEntry){if(entry.status!=="completed")throw new Error("Only completed entries can be uploaded.");if(entry.temporaryEdit)throw new Error("Temporary edits must be explicitly completed before upload.");let item:CompletedSyncItem|null=null;await offlineDb.transaction("rw",offlineDb.completedSync,offlineDb.entries,async()=>{const current=await offlineDb.entries.get(entry.entryId);if(current&&entryVersion(current)>entryVersion(entry)){item=await offlineDb.completedSync.get(entry.entryId)??null;return;}item=await putCompletedSync(entry);await offlineDb.entries.update(entry.entryId,{uploadError:null});});const queued=item as CompletedSyncItem|null;if(!queued)throw new Error("No completed upload was queued.");emit("completed-queued",{entryId:entry.entryId,localVersion:queued.payload.localVersion});return queued;}
export async function pendingCompletedCount(){return offlineDb.completedSync.where("status").anyOf(["pending","uploading","retry"]).count();}
export async function listCompletedSync(){return offlineDb.completedSync.where("status").anyOf(["pending","uploading","retry"]).toArray();}
export async function markCompletedSending(entryId:string,localVersion:number){let claimed=false;const now=new Date().toISOString();await offlineDb.transaction("rw",offlineDb.completedSync,async()=>{const item=await offlineDb.completedSync.get(entryId);const eligibleStatus=item?.status==="pending"||item?.status==="retry";if(!item||!eligibleStatus||entryVersion({localVersion:item.payload.localVersion})!==localVersion||(item.nextAttemptAt!==null&&item.nextAttemptAt>now))return;await offlineDb.completedSync.update(entryId,{status:"uploading",attempts:item.attempts+1,updatedAt:now,lastError:null});claimed=true;});return claimed;}
export async function markCompletedRetry(entryId:string,localVersion:number,error:string){let changed=false;await offlineDb.transaction("rw",offlineDb.completedSync,offlineDb.entries,async()=>{const current=await offlineDb.completedSync.get(entryId);if(!current||current.status!=="uploading"||entryVersion({localVersion:current.payload.localVersion})!==localVersion)return;const seconds=Math.min(300,Math.max(2,2**Math.min(current.attempts,8)));const now=new Date().toISOString();await offlineDb.completedSync.update(entryId,{status:"retry",nextAttemptAt:new Date(Date.now()+seconds*1000).toISOString(),lastError:error,updatedAt:now});const entry=await offlineDb.entries.get(entryId);if(entry&&entryVersion(entry)===localVersion)await offlineDb.entries.update(entryId,{uploadError:error});changed=true;});if(changed)emit("completed-upload-failed",{entryId,error,localVersion});return changed;}
export async function settleCompleted(entryId:string,localVersion:number){let changed=false;const now=new Date().toISOString();await offlineDb.transaction("rw",offlineDb.completedSync,offlineDb.entries,async()=>{const item=await offlineDb.completedSync.get(entryId);if(!item||item.status!=="uploading"||entryVersion({localVersion:item.payload.localVersion})!==localVersion)return;await offlineDb.completedSync.update(entryId,{status:"synced",lastError:null,nextAttemptAt:null,updatedAt:now});const entry=await offlineDb.entries.get(entryId);if(entry&&entryVersion(entry)===localVersion)await offlineDb.entries.update(entryId,{uploadError:null});changed=true;});if(changed)emit("completed-uploaded",{entryId,localVersion});return changed;}
export async function localUploadFailures(){return offlineDb.completedSync.where("status").anyOf(["retry","failed"]).reverse().sortBy("updatedAt");}
export async function purgeExpiredLocalData(now=new Date()){const cutoff=new Date(now);cutoff.setMonth(cutoff.getMonth()-14);const iso=cutoff.toISOString();const entries=await offlineDb.entries.where("updatedAt").below(iso).toArray();if(!entries.length)return 0;await offlineDb.transaction("rw",offlineDb.entries,offlineDb.completedSync,async()=>{for(const entry of entries){await offlineDb.entries.delete(entry.entryId);await offlineDb.completedSync.delete(entry.entryId);}});emit("expired-local-data-purged",{count:entries.length});return entries.length;}
function checkpointComparable(value:LocalAggregate){return JSON.stringify({formKey:value.formKey,formVersion:value.formVersion,operatorId:value.operatorId,operator:value.operator,date:value.date,shift:value.shift,timeSlot:value.timeSlot,boilerNumber:value.boilerNumber,workingValues:value.workingValues,localLifecycle:value.localLifecycle,amendment:value.amendment,moveIntent:value.moveIntent});}
async function writeCheckpoint(next:LocalAggregate){
  await offlineDb.transaction("rw",offlineDb.aggregates,offlineDb.meta,async()=>{
    const existing=await offlineDb.aggregates.get(next.aggregateId);
    if(existing&&existing.checkpointVersion>next.checkpointVersion) throw new Error("A newer durable checkpoint already exists from another tab. Reload this record before continuing.");
    if(existing&&existing.checkpointVersion===next.checkpointVersion){
      if(checkpointComparable(existing)!==checkpointComparable(next)) throw new Error("This exact checkpoint version was changed in another tab. Reload the latest tablet checkpoint before continuing.");
      return;
    }
    await offlineDb.aggregates.put(next);
    await offlineDb.meta.put({key:"last_checkpoint",value:{aggregateId:next.aggregateId,version:next.checkpointVersion,at:next.checkpointAt},updatedAt:next.checkpointAt});
  });
}

function emit(type:string,payload?:unknown){localEvents.postMessage({type,payload,at:Date.now()});window.dispatchEvent(new CustomEvent("ecc-local-change",{detail:{type,payload}}));}

export function defaultValues(formKey:string):Values{const form=getForm(formKey);const values:Values={};if(form)for(const field of allFields(form))if(field.defaultValue!==undefined)values[field.key]=field.defaultValue;return values;}
export function newLocalAggregate(formKey:string,date=new Date().toISOString().slice(0,10)):LocalAggregate{const form=getForm(formKey);if(!form)throw new Error("Unknown form");const now=new Date().toISOString();return{aggregateId:crypto.randomUUID(),formKey,formVersion:form.version,checkpointVersion:0,operatorId:null,operator:"",date,shift:null,timeSlot:null,boilerNumber:null,workingValues:defaultValues(formKey),localLifecycle:"draft",serverRecord:null,publishedRecord:null,amendment:false,moveIntent:false,syncState:"local",checkpointAt:now,createdAt:now,updatedAt:now,storageError:null};}

export async function checkpointAggregate(input:LocalAggregate):Promise<LocalAggregate>{
  const now=new Date().toISOString();const next={...input,checkpointVersion:input.checkpointVersion+1,checkpointAt:now,updatedAt:now,storageError:null};
  try{await writeCheckpoint(next);await saveLocalEntry(localEntryFromAggregate(next));emit("checkpoint",{aggregateId:next.aggregateId});return next;}catch(error){throw new Error(`Local storage checkpoint failed: ${error instanceof Error?error.message:String(error)}`);}
}

export async function persistCheckpoint(input:LocalAggregate):Promise<LocalAggregate>{
  const now=new Date().toISOString();const next={...input,checkpointAt:now,updatedAt:now,storageError:null};
  try{await writeCheckpoint(next);await saveLocalEntry(localEntryFromAggregate(next));emit("checkpoint",{aggregateId:next.aggregateId});return next;}catch(error){throw new Error(`Local storage checkpoint failed: ${error instanceof Error?error.message:String(error)}`);}
}
export async function loadLocalAggregate(id:string){return offlineDb.aggregates.get(id);}
export async function listLocalAggregates(formKey?:string){return formKey?offlineDb.aggregates.where("formKey").equals(formKey).reverse().sortBy("updatedAt"):offlineDb.aggregates.orderBy("updatedAt").reverse().toArray();}
export async function cacheServerRecords(records:CanonicalRecord[]){const now=new Date().toISOString();await offlineDb.transaction("rw",offlineDb.serverCache,async()=>{for(const r of records)await offlineDb.serverCache.put({aggregateId:r.aggregateId,formKey:r.formKey,date:r.date,record:r,cachedAt:now});});emit("server-cache");}
export async function cachedRecords(formKey:string){return (await offlineDb.serverCache.where("formKey").equals(formKey).toArray()).sort((a,b)=>b.date.localeCompare(a.date)).map((x)=>x.record);}
/** Cache remote records without replacing a newer local draft or edit. */
export async function cacheServerEntries(records:CanonicalRecord[]){
  const now=new Date().toISOString();
  await offlineDb.transaction("rw",offlineDb.entries,offlineDb.serverCache,async()=>{
    for(const record of records){
      if(!(await offlineDb.entries.get(record.aggregateId))){
        const next=normalizedEntry(localEntryFromRecord(record),record.updatedAt);
        if(!(await completedContextCollision(next)))await offlineDb.entries.put(next);
      }
      await offlineDb.serverCache.put({aggregateId:record.aggregateId,formKey:record.formKey,date:record.date,record,cachedAt:now});
    }
  });
  emit("server-entries-cached",{count:records.length});
}
export async function hydrateServerRecord(current:CanonicalRecord,published:CanonicalRecord|null){
  const existing=await offlineDb.aggregates.get(current.aggregateId);const now=new Date().toISOString();const isOpenAmendment=Boolean(published&&current.revision!==published.revision&&current.lifecycle==="draft");
  const unsettled=existing?(await offlineDb.commands.where("aggregateId").equals(current.aggregateId).toArray()).some(c=>["pending","sending","retry","conflict","permanent"].includes(c.status)):false;
  const preserveLocal=Boolean(existing&&(unsettled||["local","waiting","syncing","conflict","attention"].includes(existing.syncState)));
  const record:LocalAggregate=existing?{
    ...existing,
    formVersion:getForm(current.formKey)?.version??existing.formVersion,
    operatorId:preserveLocal?existing.operatorId:current.operatorId,operator:preserveLocal?existing.operator:current.operator,
    date:preserveLocal?existing.date:current.date,shift:preserveLocal?existing.shift:current.shift as any,timeSlot:preserveLocal?existing.timeSlot:current.timeSlot,boilerNumber:preserveLocal?existing.boilerNumber:current.boilerNumber as any,
    workingValues:preserveLocal?existing.workingValues:structuredClone(current.values),localLifecycle:preserveLocal?existing.localLifecycle:(current.lifecycle==="completed"?"completed":"draft"),
    serverRecord:current,publishedRecord:published,amendment:preserveLocal?existing.amendment:isOpenAmendment,moveIntent:preserveLocal?existing.moveIntent:false,
    syncState:preserveLocal?existing.syncState:"confirmed",updatedAt:now
  }:{aggregateId:current.aggregateId,formKey:current.formKey,formVersion:getForm(current.formKey)?.version??1,checkpointVersion:0,operatorId:current.operatorId,operator:current.operator,date:current.date,shift:current.shift as any,timeSlot:current.timeSlot,boilerNumber:current.boilerNumber as any,workingValues:structuredClone(current.values),localLifecycle:current.lifecycle==="completed"?"completed":"draft",serverRecord:current,publishedRecord:published,amendment:isOpenAmendment,moveIntent:false,syncState:"confirmed",checkpointAt:now,createdAt:current.createdAt,updatedAt:now};
  await offlineDb.aggregates.put(record);await cacheServerRecords([published??current]);return record;
}

function commandFor(aggregate:LocalAggregate,operation:OperationType,extra:Partial<CommandPayload>={}):CommandPayload{return{protocolVersion:1,commandId:crypto.randomUUID(),aggregateId:aggregate.aggregateId,formKey:aggregate.formKey,formVersion:aggregate.formVersion,operation,baseRevision:aggregate.serverRecord?.revision??null,operatorId:aggregate.operatorId,operator:aggregate.operator,context:{date:aggregate.date,shift:aggregate.shift,timeSlot:aggregate.timeSlot,boilerNumber:aggregate.boilerNumber},lifecycle:(operation==="complete"||operation==="amend_complete"||operation==="move"||operation==="replace")?"completed":operation==="resolve_conflict"?aggregate.localLifecycle:"draft",values:structuredClone(aggregate.workingValues),clientObservedAt:new Date().toISOString(),...extra};}
export async function queueCommand(aggregate:LocalAggregate,operation:OperationType,extra:Partial<CommandPayload>={}):Promise<LocalCommand>{const payload=commandFor(aggregate,operation,extra);const now=new Date().toISOString();const command:LocalCommand={commandId:payload.commandId,aggregateId:aggregate.aggregateId,formKey:aggregate.formKey,status:"pending",operation,baseRevision:payload.baseRevision,checkpointVersion:aggregate.checkpointVersion,payload,createdAt:now,updatedAt:now,attempts:0,nextAttemptAt:null,lastError:null,receipt:null,supersededBy:null};await offlineDb.transaction("rw",offlineDb.commands,offlineDb.aggregates,async()=>{await offlineDb.commands.add(command);await offlineDb.aggregates.update(aggregate.aggregateId,{localLifecycle:aggregate.localLifecycle,syncState:"waiting",updatedAt:now});});emit("command-queued",{commandId:command.commandId,aggregateId:aggregate.aggregateId});return command;}
export async function pendingCount(){return offlineDb.commands.where("status").anyOf(["pending","retry","sending"]).count();}
export async function unresolvedCommands(){return offlineDb.commands.where("status").anyOf(["conflict","permanent"]).reverse().sortBy("updatedAt");}

export async function markSending(command:LocalCommand){const attempts=command.attempts+1;await offlineDb.commands.update(command.commandId,{status:"sending",attempts,updatedAt:new Date().toISOString(),lastError:null});await offlineDb.aggregates.update(command.aggregateId,{syncState:"syncing"});}
export async function markRetry(commandId:string,error:string,attempts:number){const seconds=Math.min(300,Math.max(2,2**Math.min(attempts,8)));const next=new Date(Date.now()+seconds*1000).toISOString();const cmd=await offlineDb.commands.get(commandId);if(!cmd)return;await offlineDb.commands.update(commandId,{status:"retry",lastError:error,nextAttemptAt:next,updatedAt:new Date().toISOString()});await offlineDb.aggregates.update(cmd.aggregateId,{syncState:"waiting"});emit("sync-retry");}
export async function markPermanent(commandId:string,error:string,receipt:CommandReceipt|null=null){const cmd=await offlineDb.commands.get(commandId);if(!cmd)return;await offlineDb.commands.update(commandId,{status:"permanent",lastError:error,receipt,updatedAt:new Date().toISOString()});await offlineDb.aggregates.update(cmd.aggregateId,{syncState:"attention"});emit("sync-attention");}
export async function markConflict(commandId:string,receipt:CommandReceipt){const cmd=await offlineDb.commands.get(commandId);if(!cmd)return;await offlineDb.commands.update(commandId,{status:"conflict",lastError:receipt.message??"Conflict",receipt,updatedAt:new Date().toISOString()});await offlineDb.aggregates.update(cmd.aggregateId,{syncState:"conflict"});emit("sync-conflict");}

async function rebaseNextPending(aggregateId:string,acceptedRevision:number){const pending=(await offlineDb.commands.where("aggregateId").equals(aggregateId).toArray()).filter((c)=>c.status==="pending"||c.status==="retry").sort((a,b)=>a.createdAt.localeCompare(b.createdAt));const next=pending[0];if(!next||next.payload.baseRevision===acceptedRevision)return;if(next.operation==="replace"||next.operation==="resolve_conflict")return;const newId=crypto.randomUUID();const now=new Date().toISOString();const payload={...structuredClone(next.payload),commandId:newId,baseRevision:acceptedRevision,clientObservedAt:now};const rebased:LocalCommand={...next,commandId:newId,status:"pending",baseRevision:acceptedRevision,payload,createdAt:now,updatedAt:now,attempts:0,nextAttemptAt:null,lastError:null,receipt:null,supersededBy:null};await offlineDb.transaction("rw",offlineDb.commands,async()=>{await offlineDb.commands.update(next.commandId,{status:"superseded",supersededBy:newId,updatedAt:now});await offlineDb.commands.add(rebased);});}
export async function settleAck(commandId:string,receipt:CommandReceipt){const cmd=await offlineDb.commands.get(commandId);if(!cmd)return;const aggregate=await offlineDb.aggregates.get(cmd.aggregateId);const now=new Date().toISOString();await offlineDb.transaction("rw",offlineDb.commands,offlineDb.aggregates,offlineDb.serverCache,async()=>{await offlineDb.commands.update(commandId,{status:"acked",receipt,lastError:null,nextAttemptAt:null,updatedAt:now});if(aggregate&&receipt.record){const noNewerLocal=aggregate.checkpointVersion===cmd.checkpointVersion;await offlineDb.aggregates.update(aggregate.aggregateId,{serverRecord:receipt.record,publishedRecord:receipt.record.publishedRevision===receipt.record.revision?receipt.record:aggregate.publishedRecord,syncState:noNewerLocal?"confirmed":"waiting",workingValues:noNewerLocal?receipt.record.values:aggregate.workingValues,localLifecycle:noNewerLocal&&receipt.record.lifecycle==="completed"?"completed":aggregate.localLifecycle,amendment:noNewerLocal&&receipt.record.lifecycle==="completed"?false:aggregate.amendment,moveIntent:false,updatedAt:now});await offlineDb.serverCache.put({aggregateId:receipt.record.aggregateId,formKey:receipt.record.formKey,date:receipt.record.date,record:receipt.record,cachedAt:now});}else if(aggregate){await offlineDb.aggregates.update(aggregate.aggregateId,{syncState:aggregate.checkpointVersion===cmd.checkpointVersion?"confirmed":"waiting",updatedAt:now});}});if(receipt.revision!=null)await rebaseNextPending(cmd.aggregateId,receipt.revision);emit("sync-acked",{commandId,aggregateId:cmd.aggregateId});}

export async function resolveLocalConflict(command:LocalCommand,choice:"local"|"server"){const aggregate=await offlineDb.aggregates.get(command.aggregateId);const server=command.receipt?.conflict;if(!aggregate||!server)throw new Error("Conflict evidence is unavailable.");const working=choice==="local"?command.payload.values:server.values;const context=choice==="local"?command.payload.context:{date:server.date,shift:server.shift as any,timeSlot:server.timeSlot,boilerNumber:server.boilerNumber as any};const temp={...aggregate,workingValues:working,date:context.date,shift:context.shift??null,timeSlot:context.timeSlot??null,boilerNumber:context.boilerNumber??null,serverRecord:server};const queued=await queueCommand(temp,"resolve_conflict",{baseRevision:server.revision,resolution:{choice,serverRevision:server.revision},values:working,context});await offlineDb.commands.update(command.commandId,{status:"resolved",supersededBy:queued.commandId,updatedAt:new Date().toISOString()});emit("conflict-resolution-queued");return queued;}
export async function replaceCollision(command:LocalCommand){const aggregate=await offlineDb.aggregates.get(command.aggregateId);const destination=command.receipt?.conflict;if(!aggregate||!destination)throw new Error("Collision evidence is unavailable.");const temp={...aggregate,serverRecord:aggregate.serverRecord};const queued=await queueCommand(temp,"replace",{baseRevision:aggregate.serverRecord?.revision??null,replacement:{destinationAggregateId:destination.aggregateId,destinationRevision:destination.revision},context:command.payload.context,values:command.payload.values,lifecycle:command.payload.lifecycle});await offlineDb.commands.update(command.commandId,{status:"resolved",supersededBy:queued.commandId,updatedAt:new Date().toISOString()});emit("replace-queued");return queued;}

export async function putOperators(records:OperatorRecord[]){await offlineDb.transaction("rw",offlineDb.operators,async()=>{await offlineDb.operators.clear();await offlineDb.operators.bulkPut(records);});emit("operators");}
export async function getOperators(){const rows=await offlineDb.operators.toArray();if(rows.length)return rows;return[["operator-marj","Marj"],["operator-justin","Justin"],["operator-kyle","Kyle"],["operator-mikolaj","Mikolaj"],["operator-richard","Richard"],["operator-jordon","Jordon"],["operator-other","Other"]].map(([id,name])=>({id,name,active:true,createdAt:"",updatedAt:""}));}

export async function discardUnresolved(commandId:string){const cmd=await offlineDb.commands.get(commandId);if(!cmd)return;await offlineDb.commands.update(commandId,{status:"resolved",updatedAt:new Date().toISOString()});const remaining=(await offlineDb.commands.where("aggregateId").equals(cmd.aggregateId).toArray()).some(c=>c.status==="conflict"||c.status==="permanent");await offlineDb.aggregates.update(cmd.aggregateId,{syncState:remaining?"attention":"confirmed"});emit("unresolved-discarded");}
export async function retryAsNewCommand(commandId:string){const cmd=await offlineDb.commands.get(commandId);if(!cmd)throw new Error("Command not found.");const newId=crypto.randomUUID();const now=new Date().toISOString();const server=(await offlineDb.aggregates.get(cmd.aggregateId))?.serverRecord;const payload={...structuredClone(cmd.payload),commandId:newId,baseRevision:server?.revision??cmd.payload.baseRevision,clientObservedAt:now};const next:LocalCommand={...cmd,commandId:newId,status:"pending",baseRevision:payload.baseRevision,payload,createdAt:now,updatedAt:now,attempts:0,nextAttemptAt:null,lastError:null,receipt:null,supersededBy:null};await offlineDb.transaction("rw",offlineDb.commands,offlineDb.aggregates,async()=>{await offlineDb.commands.update(commandId,{status:"superseded",supersededBy:newId,updatedAt:now});await offlineDb.commands.add(next);await offlineDb.aggregates.update(cmd.aggregateId,{syncState:"waiting"});});emit("command-retried");return next;}
