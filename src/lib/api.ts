import type { CanonicalRecord, CompletedRecordUpload, OperatorRecord, SyncReceipt } from "../../shared/types";
import { getDeviceToken } from "./device";

export class ApiError extends Error {
  constructor(message:string, public status:number, public code:string, public details?:unknown) { super(message); }
}
async function request<T>(path:string, init:RequestInit={}):Promise<T> {
  const headers=new Headers(init.headers); const token=getDeviceToken(); if(token) headers.set("X-ECC-Device-Token",token);
  if(init.body && !headers.has("Content-Type")) headers.set("Content-Type","application/json");
  const response=await fetch(path,{...init,headers});
  if(!response.ok){ const body:any=await response.json().catch(()=>({})); throw new ApiError(body?.error?.message??`HTTP ${response.status}`,response.status,body?.error?.code??"http_error",body?.error?.details); }
  return response.json() as Promise<T>;
}
async function timedRequest<T>(path:string, init:RequestInit, timeoutMs:number):Promise<T>{
  const controller=new AbortController();
  const externalSignal=init.signal;
  const onAbort=()=>controller.abort();
  externalSignal?.addEventListener("abort",onAbort,{once:true});
  const timeout=window.setTimeout(()=>controller.abort(),timeoutMs);
  try{return await request<T>(path,{...init,signal:controller.signal});}
  finally{window.clearTimeout(timeout);externalSignal?.removeEventListener("abort",onAbort);}
}
export function getMeta(){return request<{protocolVersion:number;schemaVersion:number;serverTime:string;plantTimeZone:string;backupContractVersion:string}>("/api/meta");}
export function listOperators(){return request<{operators:OperatorRecord[]}>("/api/operators");}
export function createOperator(name:string){return request<{operator:OperatorRecord}>("/api/operators",{method:"POST",body:JSON.stringify({name})});}
export function updateOperator(id:string,patch:{name?:string;active?:boolean}){return request<{operator:OperatorRecord}>(`/api/operators/${encodeURIComponent(id)}`,{method:"PATCH",body:JSON.stringify(patch)});}
export function uploadCompleted(payload:CompletedRecordUpload){return timedRequest<SyncReceipt>("/api/completed",{method:"POST",body:JSON.stringify(payload)},5_000);}
export function listRecords(formKey?:string,date?:string,signal?:AbortSignal){const p=new URLSearchParams();if(formKey)p.set("formKey",formKey);if(date)p.set("date",date);return timedRequest<{records:CanonicalRecord[]}>(`/api/records?${p}`,{signal},5_000);}
export function listPublicRecords(formKey:string,date?:string,signal?:AbortSignal){const p=new URLSearchParams({formKey});if(date)p.set("date",date);return timedRequest<{records:CanonicalRecord[]}>(`/api/public/records?${p}`,{signal},5_000);}
export function getPublicRecord(id:string,signal?:AbortSignal){return timedRequest<{record:CanonicalRecord}>(`/api/public/records/${encodeURIComponent(id)}`,{signal},5_000);}
export function getRecord(id:string,signal?:AbortSignal){return timedRequest<{current:CanonicalRecord;published:CanonicalRecord|null}>(`/api/records/${encodeURIComponent(id)}`,{signal},5_000);}
export function getRecordHistory(id:string){return request<{revisions:Array<CanonicalRecord & {operation:string;isPublished:boolean;revisionCreatedAt:string}>}>(`/api/records/${encodeURIComponent(id)}/history`);}
export function getTrend(formKey:string,fieldKey:string,limit=5,signal?:AbortSignal){const p=new URLSearchParams({formKey,fieldKey,limit:String(limit)});return timedRequest<{points:Array<{aggregate_id:string;plant_date:string;measured_at:string;numeric_value:number}>}>(`/api/trend?${p}`,{signal},5_000);}
export function getPublicTrend(formKey:string,fieldKey:string,limit=5,signal?:AbortSignal){const p=new URLSearchParams({formKey,fieldKey,limit:String(limit)});return timedRequest<{points:Array<{aggregate_id:string;plant_date:string;measured_at:string;numeric_value:number}>}>(`/api/public/trend?${p}`,{signal},5_000);}
export async function getHistoryBatch(formKey:string){
  const controller=new AbortController();
  const timeout=window.setTimeout(()=>controller.abort(),5_000);
  try{
    return await request<{history:Record<string,Array<{aggregate_id:string;plant_date:string;measured_at:string;numeric_value:number}>>}>(`/api/history-batch?formKey=${encodeURIComponent(formKey)}`,{signal:controller.signal});
  }finally{
    window.clearTimeout(timeout);
  }
}
export function getAttention(){return request<{items:any[]}>("/api/attention");}
export function getBackupStatus(date?:string){return request<{generations:any[]}>(`/api/backups/status${date?`?date=${encodeURIComponent(date)}`:""}`);}
export function runBackup(plantDate:string){return request<{accepted:boolean;plantDate:string;workflowInstanceId:string;status:any}>("/api/backups/run",{method:"POST",body:JSON.stringify({plantDate})});}
export function workflowStatus(id:string){return request<any>(`/api/backups/workflow/${encodeURIComponent(id)}`);}
export function exportUrl(formKey:string){const token=getDeviceToken(); const u=new URL(`/api/export?formKey=${encodeURIComponent(formKey)}`,location.origin); return {url:u.toString(),token};}

async function blobToBase64(blob:Blob){const buffer=await blob.arrayBuffer();let binary="";const bytes=new Uint8Array(buffer);const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary);}
async function compressImage(blob:Blob){
  const bitmap=await createImageBitmap(blob); const max=1900; const scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height)); const canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale); const ctx=canvas.getContext("2d"); if(!ctx) return blob;ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close(); return await new Promise<Blob>((resolve)=>canvas.toBlob((b)=>resolve(b??blob),"image/jpeg",0.84));
}
export async function extractForm9(blob:Blob){const compressed=await compressImage(blob);const imageBase64=await blobToBase64(compressed);return request<{values:Record<string,number|null>;needsCheck:string[]}>("/api/ai/extract",{method:"POST",body:JSON.stringify({imageBase64,mimeType:compressed.type||"image/jpeg"})});}
