import { AlertTriangle, RefreshCw } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { PwaUpdateNotice } from "./components/PwaUpdateNotice";
import { checkpointBeforeReload } from "./lib/pwaUpdateCoordinator";
import { getSyncSnapshot, subscribeSync } from "./lib/sync";
import { AttentionPage } from "./pages/AttentionPage";
import { DataPage } from "./pages/DataPage";
import { ExportsPage } from "./pages/ExportsPage";
import { FormEntryPage } from "./pages/FormEntryPage";
import { HomePage } from "./pages/HomePage";
import { SystemPage } from "./pages/SystemPage";
import { TrendPage } from "./pages/TrendPage";
import { RecordViewPage } from "./pages/RecordViewPage";

function CompatibilityGate(){
  const sync=useSyncExternalStore(subscribeSync,getSyncSnapshot,getSyncSnapshot);const location=useLocation();const[busy,setBusy]=useState(false);const[error,setError]=useState<string|null>(null);
  if(sync.compatibility!=="update_required")return null;
  const onForm=/^\/forms\//.test(location.pathname);
  async function reload(){setBusy(true);setError(null);try{await checkpointBeforeReload();window.location.reload();}catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false);}}
  const content=<div className="safety-screen"><div className="safety-screen-icon"><AlertTriangle/></div><h1>App update required</h1><p>This installed version is not allowed to write through the current server protocol. Any open form remains local until the app is updated.</p>{onForm&&<p className="safety-current-form-note">Your current values will be checkpointed on this tablet before reload.</p>}{error&&<p className="safety-recovery-message">{error}</p>}<div className="safety-screen-actions"><button className="primary-button" disabled={busy} onClick={()=>void reload()}><RefreshCw className={busy?"spin":""} size={16}/> {busy?"Saving checkpoint…":"Reload updated app"}</button></div></div>;
  return onForm?<div className="safety-current-form-gate">{content}</div>:<div className="safety-gate">{content}</div>;
}

function RoutedApp(){return <><Routes><Route element={<AppShell/>}><Route index element={<HomePage/>}/><Route path="forms/:formKey/new" element={<FormEntryPage/>}/><Route path="forms/:formKey/record/:aggregateId" element={<FormEntryPage/>}/><Route path="forms/:formKey" element={<FormEntryPage/>}/><Route path="data" element={<DataPage/>}/><Route path="data/:formKey/record/:recordId" element={<RecordViewPage/>}/><Route path="data/:formKey" element={<DataPage/>}/><Route path="trends/:formKey" element={<TrendPage/>}/><Route path="trends/:formKey/:fieldKey" element={<TrendPage/>}/><Route path="attention" element={<AttentionPage/>}/><Route path="exports" element={<ExportsPage/>}/><Route path="system" element={<SystemPage/>}/></Route></Routes><CompatibilityGate/><PwaUpdateNotice/></>}
export default function App(){return <BrowserRouter><RoutedApp/></BrowserRouter>}
