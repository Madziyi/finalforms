import type { CanonicalRecord } from "../../shared/types";
import { listRecords } from "./api";
import { findLocalEntryExcluding, localEntryFromRecord, type LocalEntry } from "./offlineDb";

type CloudLookup = (formKey:string,date:string)=>Promise<{records:CanonicalRecord[]}>;

/** Find another local entry first, then the one canonical cloud owner. */
export async function findOccupiedContext(
  formKey:string,
  contextKey:string,
  date:string,
  currentEntryId:string,
  online:boolean,
  cloudLookup:CloudLookup=listRecords,
):Promise<LocalEntry|null>{
  const local=await findLocalEntryExcluding(formKey,contextKey,currentEntryId);
  if(local)return local;
  if(!online)return null;
  const remote=await cloudLookup(formKey,date);
  const owner=remote.records.find(record=>record.contextKey===contextKey&&record.aggregateId!==currentEntryId);
  return owner?localEntryFromRecord(owner):null;
}
