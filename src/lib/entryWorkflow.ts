import type { LocalEntry } from "./offlineDb";

export function beginTemporaryEdit(current:LocalEntry){
  return {
    baseline:structuredClone(current),
    working:{...current,localVersion:current.localVersion+1,temporaryEdit:true},
  };
}

/** Prepare a replacement without mutating either durable local entry. */
export function prepareTemporaryReplacement(current:LocalEntry,target:LocalEntry){
  return {
    baseline:structuredClone(current),
    target:structuredClone(target),
    working:{
      ...current,
      entryId:target.entryId,
      createdAt:target.createdAt,
      baseRevision:target.baseRevision??null,
      status:(current.status==="completed"||target.status==="completed"?"completed":"draft") as "completed"|"draft",
      completedAt:target.completedAt??current.completedAt,
      localVersion:Math.max(current.localVersion,target.localVersion)+1,
      temporaryEdit:true,
      uploadError:null,
    },
  };
}
