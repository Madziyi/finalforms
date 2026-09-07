import { ArrowLeft, Bookmark, CircleAlert, Cloud, CloudOff, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FORMS, getForm } from "../forms";
import { listPublicRecords, listRecords } from "../lib/api";
import { getDeviceToken } from "../lib/device";
import { formatTimestamp } from "../lib/format";
import { listLocalEntries, localEntryFromRecord, type LocalEntry } from "../lib/offlineDb";
import type { CanonicalRecord } from "../types";

function contextLabel(entry:LocalEntry){
  const parts:string[]=[];
  if(entry.context.shift)parts.push(entry.context.shift);
  if(entry.context.timeSlot)parts.push(entry.context.timeSlot);
  if(entry.context.boilerNumber)parts.push(`Boiler ${entry.context.boilerNumber}`);
  return parts.join(" · ");
}

function recordContextLabel(record:CanonicalRecord){
  const parts:string[]=[];
  if(record.shift)parts.push(record.shift);
  if(record.timeSlot)parts.push(record.timeSlot);
  if(record.boilerNumber)parts.push(`Boiler ${record.boilerNumber}`);
  return parts.join(" · ");
}

export function DataPage(){
  const{formKey:routeFormKey}=useParams();
  const navigate=useNavigate();
  const[formKey,setFormKey]=useState(routeFormKey??FORMS[0].key);
  const[entries,setEntries]=useState<LocalEntry[]>([]);
  const[cloudRecords,setCloudRecords]=useState<CanonicalRecord[]>([]);
  const[authenticated,setAuthenticated]=useState(Boolean(getDeviceToken()));
  const[status,setStatus]=useState("all");
  const[fromDate,setFromDate]=useState("");
  const[toDate,setToDate]=useState("");
  const[search,setSearch]=useState("");
  const[message,setMessage]=useState<string|null>(null);
  const[busy,setBusy]=useState(false);
  const form=getForm(formKey);

  useEffect(()=>{if(routeFormKey)setFormKey(routeFormKey);},[routeFormKey]);
  useEffect(()=>{const onToken=()=>setAuthenticated(Boolean(getDeviceToken()));window.addEventListener("ecc-device-token",onToken);return()=>window.removeEventListener("ecc-device-token",onToken);},[]);

  async function load(){
    setBusy(true);setMessage(null);
    try{
      if(authenticated){
        const [local,remote]=await Promise.all([form?.schedule==="derived"?Promise.resolve([] as LocalEntry[]):listLocalEntries(formKey),navigator.onLine?listRecords(formKey):Promise.resolve({records:[] as CanonicalRecord[]})]);
        setEntries(local);
        setCloudRecords(remote.records);
      }else if(navigator.onLine){
        const remote=await listPublicRecords(formKey);
        setEntries([]);
        setCloudRecords(remote.records);
      }else{
        setEntries([]);
        setCloudRecords([]);
      }
    }catch(error){setMessage(error instanceof Error?error.message:"Could not load entries.");}
    finally{setBusy(false);}
  }

  useEffect(()=>{void load();const onChange=()=>void load();window.addEventListener("ecc-local-change",onChange);return()=>window.removeEventListener("ecc-local-change",onChange);},[formKey,authenticated]);

  const mergedEntries=useMemo(()=>{
    const byId=new Map<string,LocalEntry>();
    for(const record of cloudRecords)byId.set(record.aggregateId,localEntryFromRecord(record));
    for(const entry of entries){
      const cloud=byId.get(entry.entryId);
      // A completed local revision wins while it has not yet been acknowledged.
      if(!cloud||entry.status!=="completed"||entry.localVersion>=cloud.localVersion)byId.set(entry.entryId,entry);
    }
    return [...byId.values()].sort((a,b)=>b.context.date.localeCompare(a.context.date)||b.updatedAt.localeCompare(a.updatedAt));
  },[cloudRecords,entries]);

  const filteredLocal=useMemo(()=>mergedEntries.filter(entry=>{
    const entryStatus=entry.uploadError?"attention":entry.status;
    const haystack=(entry.operator??"").toLowerCase();
    const query=search.trim().toLowerCase();
    return(status==="all"||entryStatus===status)&&(!fromDate||entry.context.date>=fromDate)&&(!toDate||entry.context.date<=toDate)&&(!query||haystack.includes(query));
  }),[mergedEntries,status,fromDate,toDate,search]);

  const filteredCloud=useMemo(()=>cloudRecords.filter(record=>{
    const haystack=(record.operator??"").toLowerCase();
    const query=search.trim().toLowerCase();
    return(status==="all"||status==="completed")&&(!fromDate||record.date>=fromDate)&&(!toDate||record.date<=toDate)&&(!query||haystack.includes(query));
  }),[cloudRecords,status,fromDate,toDate,search]);

  function clearFilters(){setStatus("all");setFromDate("");setToDate("");setSearch("");}
  const hasFilters=Boolean(status!=="all"||fromDate||toDate||search.trim());
  const filteredCount=authenticated?filteredLocal.length:filteredCloud.length;

  if(!form)return <div className="empty-state"><h1>Unknown form</h1></div>;
  const isDerived=form.schedule==="derived";
  const offlineDerived=isDerived&&!navigator.onLine;

  return <div className="page-stack data-page">
    <div className="page-hero data-page-hero"><div><Link className="back-link" to="/"><ArrowLeft size={16}/> Back to forms</Link><div className="eyebrow">Historical data</div><h1>Data Viewing</h1><p>Open past entries or select a numerical field to view trends.</p></div><button className="secondary-button" onClick={()=>void load()} disabled={busy}><RefreshCw className={busy?"spin":""} size={17}/> Refresh</button></div>
    {!navigator.onLine&&<div className="notice warning"><CloudOff size={18}/> {authenticated?"Offline. Showing entries saved on this tablet.":"Cloud data is unavailable while this device is offline."}</div>}
    {!authenticated&&navigator.onLine&&<div className="notice"><Cloud size={18}/> Read-only cloud view. New entries require an authorized device.</div>}
    {message&&<div className="notice warning"><CircleAlert size={18}/>{message}</div>}
    <>
      <section className="data-filter-card card-surface" aria-label="Data filters">
        <div className="data-filter-grid">
          <label><span>Form</span><select value={formKey} onChange={e=>navigate(`/data/${e.target.value}`)}>{FORMS.map(item=><option key={item.key} value={item.key}>{item.number}. {item.name}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All entries</option><option value="draft">Drafts</option><option value="completed">Completed</option><option value="attention">Upload attention</option></select></label>
          <label><span>From date</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
          <label><span>To date</span><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label>
          <label className="data-search-field"><span>Operator</span><div className="data-search-input"><Search size={17} aria-hidden="true"/><input type="search" value={search} placeholder="Search operator" onChange={e=>setSearch(e.target.value)}/></div></label>
          {hasFilters&&<button className="secondary-button data-reset-button" type="button" onClick={clearFilters}>Reset filters</button>}
        </div>
      </section>
      <section className="card-surface entries-card">
        <div className="entries-title"><div><h2>Past entries</h2><p>{isDerived?"Latest server-calculated projection per date · read-only":`${filteredCount} ${authenticated?`combined entr${filteredCount===1?"y":"ies"}`:`cloud completed entr${filteredCount===1?"y":"ies"}`} · newest first`}</p></div>{authenticated&&!isDerived&&<Link className="primary-button" to={`/forms/${form.key}/new`}>New/continue entry</Link>}</div>
        {busy?<div className="loading-card plain">Loading entries…</div>:filteredCount===0?<div className="empty-state small"><h3>{offlineDerived?"Server-derived entries unavailable offline":`No ${authenticated?"combined":"cloud completed"} entries yet`}</h3><p>{offlineDerived?"Reconnect to view the current Form 5 or Form 6 projections.":`No ${authenticated?"local or cloud completed":"cloud completed"} entries match this view.`}</p>{hasFilters&&<button className="primary-button inline" type="button" onClick={clearFilters}>Reset filters</button>}</div>:<div className="entries-list">
          {authenticated?filteredLocal.map(entry=><div className="entry-list-row" key={entry.entryId}>
            <div className="entry-primary" data-label="Date"><strong>{entry.context.date}</strong>{contextLabel(entry)&&<span>{contextLabel(entry)}</span>}</div>
            <div className="entry-operator" data-label="Operator"><span>{entry.operator||"Operator not selected"}</span></div>
            <div className="entry-status" data-label="Status"><span className={`status-dot ${isDerived?"completed":entry.uploadError?"attention":entry.status}`}>{isDerived?"system-derived":entry.uploadError?"attention":entry.status}</span></div>
            <div className="entry-saved" data-label="Saved"><Bookmark size={16} aria-hidden="true"/><span>{formatTimestamp(entry.updatedAt)}</span></div>
            <div className="entry-actions" data-label="Actions"><Link className="secondary-button update-button" to={`/data/${entry.formKey}/record/${encodeURIComponent(entry.entryId)}`}>View</Link>{!isDerived&&<Link className="secondary-button update-button" to={`/forms/${entry.formKey}/record/${encodeURIComponent(entry.entryId)}`}>Update</Link>}</div>
          </div>):filteredCloud.map(record=><div className="entry-list-row" key={record.aggregateId}>
            <div className="entry-primary" data-label="Date"><strong>{record.date}</strong>{recordContextLabel(record)&&<span>{recordContextLabel(record)}</span>}</div>
            <div className="entry-operator" data-label="Operator"><span>{record.operator||"Operator not recorded"}</span></div>
            <div className="entry-status" data-label="Status"><span className="status-dot completed">completed</span></div>
            <div className="entry-saved" data-label="Saved"><Bookmark size={16} aria-hidden="true"/><span>{formatTimestamp(record.updatedAt)}</span></div>
            <div className="entry-actions" data-label="Actions"><Link className="secondary-button update-button" to={`/data/${record.formKey}/record/${encodeURIComponent(record.aggregateId)}`}>View</Link></div>
          </div>)}
        </div>}
      </section>
    </>
  </div>;
}
