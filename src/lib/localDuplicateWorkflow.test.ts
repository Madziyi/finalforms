import "fake-indexeddb/auto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalRecordId } from "../../shared/canonical";
import { normalizeContext } from "../../shared/safetyContract";
import type { CanonicalRecord, ContextInput } from "../../shared/types";
import { findOccupiedContext } from "./contextOwner";
import { beginTemporaryEdit, prepareTemporaryReplacement } from "./entryWorkflow";
import {
  adoptExistingEntry,
  completeLocalEntry,
  DuplicateContextError,
  loadLocalEntry,
  localEntryFromRecord,
  newLocalEntry,
  offlineDb,
  saveLocalEntry,
  type LocalEntry,
} from "./offlineDb";

const formKey="boiler-water-control-tests";
const context:ContextInput={date:"2026-09-07",shift:"Day",boilerNumber:2};

function selectedDraft(values:LocalEntry["values"]={}):LocalEntry{
  return {
    ...newLocalEntry(formKey,context.date),
    context:structuredClone(context),
    contextKey:normalizeContext(formKey,context),
    operatorId:"operator-marj",
    operator:"Marj",
    values,
    localVersion:1,
  };
}

async function completedEntry(values:LocalEntry["values"]={reading:1},localVersion=4){
  const now=new Date().toISOString();
  return saveLocalEntry({
    ...selectedDraft(values),
    entryId:canonicalRecordId(formKey,context),
    status:"completed",
    localVersion,
    completedAt:now,
    baseRevision:localVersion,
  });
}

function cloudRecord(values:LocalEntry["values"]={reading:7}):CanonicalRecord{
  const id=canonicalRecordId(formKey,context);
  return {
    aggregateId:id,
    formKey,
    contextKey:normalizeContext(formKey,context),
    revision:3,
    generation:3,
    publishedRevision:3,
    lifecycle:"completed",
    operatorId:"operator-marj",
    operator:"Marj",
    date:context.date,
    shift:"Day",
    timeSlot:null,
    boilerNumber:2,
    values,
    createdAt:"2026-09-07T12:00:00.000Z",
    updatedAt:"2026-09-07T12:00:00.000Z",
  };
}

describe("local duplicate-context workflow",()=>{
  beforeAll(()=>{
    if(typeof window==="undefined")Object.defineProperty(globalThis,"window",{value:new EventTarget(),configurable:true});
  });

  beforeEach(async()=>{
    await offlineDb.open();
    await offlineDb.transaction("rw",offlineDb.entries,offlineDb.completedSync,async()=>{
      await offlineDb.entries.clear();
      await offlineDb.completedSync.clear();
    });
  });

  afterAll(()=>offlineDb.close());

  it("promotes an autosaved UUID draft without colliding with itself",async()=>{
    const draft=await saveLocalEntry(selectedDraft({reading:10}));
    const completed=await completeLocalEntry({...draft,status:"completed",localVersion:2,completedAt:new Date().toISOString()});

    expect(completed.entryId).toBe(canonicalRecordId(formKey,context));
    expect(await loadLocalEntry(draft.entryId)).toBeUndefined();
    expect(await offlineDb.completedSync.get(completed.entryId)).toMatchObject({status:"pending"});
  });

  it("detects a different local draft at the same normalized context",async()=>{
    const existing=await saveLocalEntry(selectedDraft({reading:1}));
    const another={...selectedDraft({reading:2}),entryId:crypto.randomUUID()};

    await expect(saveLocalEntry(another)).rejects.toMatchObject({
      name:"DuplicateContextError",
      collision:{entryId:existing.entryId},
    });
  });

  it("does not ignore an existing canonical ID during UUID promotion",async()=>{
    const existing=await completedEntry({reading:11},5);
    const source=await saveLocalEntry(newLocalEntry(formKey,context.date));
    const selected={...source,...selectedDraft({reading:12}),entryId:source.entryId,localVersion:source.localVersion+1,status:"completed" as const,completedAt:new Date().toISOString()};

    await expect(completeLocalEntry(selected,{sourceEntryId:source.entryId})).rejects.toBeInstanceOf(DuplicateContextError);
    expect(await loadLocalEntry(existing.entryId)).toMatchObject({values:{reading:11},localVersion:5});
    expect(await loadLocalEntry(source.entryId)).toBeDefined();
  });

  it("does not let the current draft suppress the occupied cloud-context lookup",async()=>{
    const current=await saveLocalEntry(selectedDraft());
    const lookup=vi.fn(async()=>({records:[cloudRecord()]}));

    const owner=await findOccupiedContext(formKey,normalizeContext(formKey,context),context.date,current.entryId,true,lookup);

    expect(lookup).toHaveBeenCalledOnce();
    expect(owner).toMatchObject({entryId:canonicalRecordId(formKey,context),status:"completed"});
  });

  it("keeps the completed target unchanged until replacement Complete",async()=>{
    const target=await completedEntry({reading:20},4);
    const source=await saveLocalEntry(newLocalEntry(formKey,context.date));
    const current={...source,...selectedDraft({reading:99}),entryId:source.entryId,localVersion:2};
    const prepared=prepareTemporaryReplacement(current,target);

    expect(await loadLocalEntry(target.entryId)).toMatchObject({values:{reading:20},localVersion:4});
    const saved=await completeLocalEntry({...prepared.working,status:"completed",temporaryEdit:false,completedAt:new Date().toISOString()},{
      sourceEntryId:prepared.baseline.entryId,
      expectedSourceVersion:prepared.baseline.localVersion,
      expectedTarget:{entryId:prepared.target.entryId,localVersion:prepared.target.localVersion,contextKey:prepared.target.contextKey},
    });
    expect(saved).toMatchObject({entryId:target.entryId,values:{reading:99},status:"completed",temporaryEdit:false});
    expect(await offlineDb.completedSync.get(target.entryId)).toMatchObject({status:"pending"});
  });

  it("opens an existing local owner without changing it",async()=>{
    const target=await completedEntry({reading:21},4);
    const source=await saveLocalEntry(newLocalEntry(formKey,context.date));

    const opened=await adoptExistingEntry(source.entryId,target,true);

    expect(opened).toEqual(target);
    expect(await loadLocalEntry(target.entryId)).toEqual(target);
    expect(await loadLocalEntry(source.entryId)).toBeUndefined();
  });

  it("opens a cloud owner by caching it and discarding only the source draft",async()=>{
    const target=localEntryFromRecord(cloudRecord({reading:22}));
    const source=await saveLocalEntry(newLocalEntry(formKey,context.date));

    const opened=await adoptExistingEntry(source.entryId,target,true);

    expect(opened).toEqual(target);
    expect(await loadLocalEntry(target.entryId)).toEqual(target);
    expect(await loadLocalEntry(source.entryId)).toBeUndefined();
  });

  it("replaces a cloud owner only when Complete commits the queued record",async()=>{
    const target=localEntryFromRecord(cloudRecord({reading:23}));
    const source=await saveLocalEntry(newLocalEntry(formKey,context.date));
    const current={...source,...selectedDraft({reading:100}),entryId:source.entryId,localVersion:2};
    const prepared=prepareTemporaryReplacement(current,target);

    expect(await loadLocalEntry(target.entryId)).toBeUndefined();
    const saved=await completeLocalEntry(prepared.working,{
      sourceEntryId:prepared.baseline.entryId,
      expectedSourceVersion:prepared.baseline.localVersion,
      expectedTarget:{entryId:prepared.target.entryId,localVersion:prepared.target.localVersion,contextKey:prepared.target.contextKey},
    });

    expect(saved).toMatchObject({entryId:target.entryId,values:{reading:100},status:"completed"});
    expect(await loadLocalEntry(source.entryId)).toBeUndefined();
    expect(await offlineDb.completedSync.get(target.entryId)).toMatchObject({
      status:"pending",
      payload:{baseRevision:target.baseRevision},
    });
  });

  it("refuses to apply a replacement to a context other than the selected target",async()=>{
    const target=await completedEntry({reading:20},4);
    const source=await saveLocalEntry(newLocalEntry(formKey,context.date));
    const current={...source,...selectedDraft({reading:99}),entryId:source.entryId,localVersion:2};
    const prepared=prepareTemporaryReplacement(current,target);
    prepared.working.context={...prepared.working.context,shift:"Night"};

    await expect(completeLocalEntry(prepared.working,{
      sourceEntryId:prepared.baseline.entryId,
      expectedSourceVersion:prepared.baseline.localVersion,
      expectedTarget:{entryId:prepared.target.entryId,localVersion:prepared.target.localVersion,contextKey:prepared.target.contextKey},
    })).rejects.toThrow("no longer owns this context");
    expect(await loadLocalEntry(target.entryId)).toMatchObject({values:{reading:20},localVersion:4});
    expect(await loadLocalEntry(source.entryId)).toBeDefined();
  });

  it("discards temporary completed edits on cancel or reload",async()=>{
    const durable=await completedEntry({reading:30},3);
    const edit=beginTemporaryEdit(durable);
    edit.working.values={reading:999};

    const reloaded=await loadLocalEntry(durable.entryId);
    expect(reloaded).toMatchObject({values:{reading:30},temporaryEdit:false});
    expect(reloaded).toEqual(edit.baseline);
  });

  it("continues to persist ordinary drafts across reload",async()=>{
    const saved=await saveLocalEntry(selectedDraft({reading:44}));
    expect(await loadLocalEntry(saved.entryId)).toEqual(saved);
  });
});
