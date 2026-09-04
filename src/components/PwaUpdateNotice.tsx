import { CircleAlert, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { checkpointBeforeReload, isEditActive } from "../lib/pwaUpdateCoordinator";

export function PwaUpdateNotice(){
  const{needRefresh:[needRefresh],updateServiceWorker}=useRegisterSW({onRegisteredSW(){/* registration managed by plugin */}});
  const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);const[editActive,setEditActive]=useState(isEditActive());
  useEffect(()=>{const listener=()=>setEditActive(isEditActive());window.addEventListener("ecc-edit-state",listener);return()=>window.removeEventListener("ecc-edit-state",listener);},[]);
  if(!needRefresh)return null;
  async function update(){setBusy(true);setError(null);try{await checkpointBeforeReload();await updateServiceWorker(true);}catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false);}}
  return <div className="pwa-update"><strong>App update ready</strong><span>{editActive?"Finish or leave the active form before updating so temporary edits are not lost.":"The app will update now that no form edit is active."}</span>{error&&<span className="range-warning"><CircleAlert size={14}/>{error}</span>}<button className="primary-button" disabled={busy||editActive} onClick={()=>void update()}><RefreshCw className={busy?"spin":""} size={16}/> {busy?"Updating…":"Update and reload"}</button></div>;
}
