import { ApiError, getMeta, listOperators, uploadCompleted } from "./api";
import { getOperators, listCompletedSync, localEvents, markCompletedFailed, markCompletedRetry, markCompletedSending, migrateV1LocalData, pendingCompletedCount, purgeExpiredLocalData, putOperators, recoverStalledCompletedUploads, settleCompleted } from "./offlineDb";
import { PROTOCOL_VERSION } from "../../shared/safetyContract";

export type SyncSnapshot={online:boolean;running:boolean;pending:number;lastSuccess:string|null;lastError:string|null;compatibility:"unknown"|"compatible"|"update_required"};
let snapshot:SyncSnapshot={online:typeof navigator!=="undefined"?navigator.onLine:false,running:false,pending:0,lastSuccess:null,lastError:null,compatibility:"unknown"};
const listeners=new Set<()=>void>();
let timer:number|null=null;let started=false;
let replaying=false;
function publish(patch:Partial<SyncSnapshot>={}){snapshot={...snapshot,...patch};for(const fn of listeners)fn();}
export function subscribeSync(fn:()=>void){listeners.add(fn);return()=>listeners.delete(fn);}
export function getSyncSnapshot(){return snapshot;}
async function refreshCount(){publish({pending:await pendingCompletedCount(),online:navigator.onLine});}
function eligible(item:{nextAttemptAt:string|null}){return !item.nextAttemptAt||item.nextAttemptAt<=new Date().toISOString();}
async function processOne(item:Awaited<ReturnType<typeof listCompletedSync>>[number]){const localVersion=Number.isInteger(item.payload.localVersion)?Number(item.payload.localVersion):0;if(!await markCompletedSending(item.entryId,localVersion))return;try{const receipt=await uploadCompleted(item.payload);if(["accepted","duplicate"].includes(receipt.outcome))await settleCompleted(item.entryId,localVersion,receipt.record?.revision??receipt.revision);else {const message=receipt.message??"Cloudflare did not accept this local snapshot.";await markCompletedFailed(item.entryId,localVersion,message);publish({lastError:`Upload needs attention: ${message}`});return;}publish({lastSuccess:new Date().toISOString(),lastError:null});}catch(error){const message=error instanceof ApiError?error.message:error instanceof Error?error.message:String(error);await markCompletedRetry(item.entryId,localVersion,message);publish({lastError:`Upload failed: ${message}`});}}
async function replay(){if(!navigator.onLine||replaying)return;await recoverStalledCompletedUploads();const items=(await listCompletedSync()).filter(eligible).sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt));if(!items.length){await refreshCount();return;}if(replaying)return;replaying=true;publish({running:true});try{for(const item of items.slice(0,8))await processOne(item);await refreshCount();}finally{replaying=false;publish({running:false});}}
export async function syncNow(){if(!navigator.onLine){await refreshCount();return;}await replay();}
async function compatibilityCheck(){try{const meta=await getMeta();publish({compatibility:meta.protocolVersion===PROTOCOL_VERSION?"compatible":"update_required"});}catch(error){if(navigator.onLine)publish({lastError:error instanceof Error?error.message:String(error)});}}
async function operatorRefresh(){try{const remote=await listOperators();await putOperators(remote.operators);}catch{await getOperators();}}
export function startSyncEngine(){if(started)return;started=true;void (async()=>{await migrateV1LocalData();await purgeExpiredLocalData();await refreshCount();await compatibilityCheck();if(navigator.onLine){void operatorRefresh();void syncNow();}})();const wake=()=>{publish({online:navigator.onLine});if(navigator.onLine){void compatibilityCheck();void syncNow();}};window.addEventListener("online",wake);window.addEventListener("offline",wake);localEvents.addEventListener("message",()=>{void refreshCount();if(navigator.onLine)void syncNow();});window.addEventListener("ecc-local-change",()=>{void refreshCount();});timer=window.setInterval(()=>{if(navigator.onLine)void syncNow();},5000);}
export function stopSyncEngine(){if(timer!=null)window.clearInterval(timer);timer=null;started=false;}
