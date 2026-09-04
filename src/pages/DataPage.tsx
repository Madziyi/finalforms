import { ArrowLeft, ArrowRight, Bookmark, CircleAlert, CloudOff, ExternalLink, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { FORMS, getForm } from "../forms";
import { formatTimestamp } from "../lib/format";
import { listLocalEntries, type LocalEntry } from "../lib/offlineDb";

function contextLabel(entry:LocalEntry){
  const parts:string[]=[];
  if(entry.context.shift)parts.push(entry.context.shift);
  if(entry.context.timeSlot)parts.push(entry.context.timeSlot);
  if(entry.context.boilerNumber)parts.push(`Boiler ${entry.context.boilerNumber}`);
  return parts.join(" · ");
}

export function DataPage(){
  const{formKey:routeFormKey}=useParams();
  const navigate=useNavigate();
  const[formKey,setFormKey]=useState(routeFormKey??FORMS[0].key);
  const[entries,setEntries]=useState<LocalEntry[]>([]);
  const[status,setStatus]=useState("all");
  const[fromDate,setFromDate]=useState("");
  const[toDate,setToDate]=useState("");
  const[search,setSearch]=useState("");
  const[message,setMessage]=useState<string|null>(null);
  const[busy,setBusy]=useState(false);
  const form=getForm(formKey);

  useEffect(()=>{if(routeFormKey)setFormKey(routeFormKey);},[routeFormKey]);

  async function load(){
    setBusy(true);setMessage(null);
    try{setEntries(await listLocalEntries(formKey));}
    catch(error){setMessage(error instanceof Error?error.message:"Could not load local entries.");}
    finally{setBusy(false);}
  }

  useEffect(()=>{void load();const onChange=()=>void load();window.addEventListener("ecc-local-change",onChange);return()=>window.removeEventListener("ecc-local-change",onChange);},[formKey]);

  const filtered=useMemo(()=>entries.filter(entry=>{
    const entryStatus=entry.uploadError?"attention":entry.status;
    const haystack=`${entry.context.date} ${contextLabel(entry)} ${entry.operator} ${entry.entryId}`.toLowerCase();
    const query=search.trim().toLowerCase();
    return(status==="all"||entryStatus===status)
      &&(!fromDate||entry.context.date>=fromDate)
      &&(!toDate||entry.context.date<=toDate)
      &&(!query||haystack.includes(query));
  }),[entries,status,fromDate,toDate,search]);

  function clearFilters(){setStatus("all");setFromDate("");setToDate("");setSearch("");}
  const hasFilters=Boolean(status!=="all"||fromDate||toDate||search.trim());

  if(!form)return <div className="empty-state"><h1>Unknown form</h1></div>;

  return <div className="page-stack data-page">
    <div className="page-hero data-page-hero"><div><Link className="back-link" to="/"><ArrowLeft size={16}/> Back to forms</Link><div className="eyebrow">Historical data</div><h1>Data Viewing</h1><p>Open past entries or select a numerical field to view trends.</p></div><button className="secondary-button" onClick={()=>void load()} disabled={busy}><RefreshCw className={busy?"spin":""} size={17}/> Refresh</button></div>
    {!navigator.onLine&&<div className="notice warning"><CloudOff size={18}/> Offline. Showing entries saved on this tablet.</div>}
    {message&&<div className="notice warning"><CircleAlert size={18}/>{message}</div>}
    {form.schedule==="derived"?<section className="card-surface"><div className="entries-title"><div><h2>Local projection</h2><p>Forms 5 and 6 are calculated from completed local Form 8 entries.</p></div></div><div className="empty-state small"><p>This form is read-only and has no independent entry store.</p><Link className="primary-button inline" to={`/forms/${form.key}`}>Open projection <ExternalLink size={16}/></Link></div></section>:<>
      <section className="data-filter-card card-surface" aria-label="Data filters">
        <div className="data-filter-grid">
          <label><span>Form</span><select value={formKey} onChange={e=>navigate(`/data/${e.target.value}`)}>{FORMS.map(item=><option key={item.key} value={item.key}>{item.number}. {item.name}</option>)}</select></label>
          <label><span>Status</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All local entries</option><option value="draft">Drafts</option><option value="completed">Completed</option><option value="attention">Upload attention</option></select></label>
          <label><span>From date</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)}/></label>
          <label><span>To date</span><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)}/></label>
          <label className="data-search-field"><span>Search</span><div className="data-search-input"><Search size={17} aria-hidden="true"/><input type="search" value={search} placeholder="Date, operator, or entry ID" onChange={e=>setSearch(e.target.value)}/></div></label>
          {hasFilters&&<button className="secondary-button data-reset-button" type="button" onClick={clearFilters}>Reset filters</button>}
        </div>
      </section>
      <section className="card-surface entries-card">
        <div className="entries-title"><div><h2>Entries</h2><p>{filtered.length} local entr{filtered.length===1?"y":"ies"} · newest first</p></div><Link className="primary-button" to={`/forms/${form.key}/new`}>New entry</Link></div>
        {busy?<div className="loading-card plain">Loading entries…</div>:filtered.length===0?<div className="empty-state small"><h3>No entries yet</h3><p>No local entries match this view.</p>{hasFilters&&<button className="primary-button inline" type="button" onClick={clearFilters}>Reset filters</button>}</div>:<div className="entries-list">
          {filtered.map(entry=>{const entryStatus=entry.uploadError?"attention":entry.status;return <div className="entry-list-row" key={entry.entryId}>
            <div className="entry-primary" data-label="Date"><strong>{entry.context.date}</strong>{contextLabel(entry)&&<span>{contextLabel(entry)}</span>}</div>
            <div className="entry-operator" data-label="Operator"><span>{entry.operator||"Operator not selected"}</span></div>
            <div className="entry-status" data-label="Status"><span className={`status-dot ${entryStatus}`}>{entryStatus}</span></div>
            <div className="entry-saved" data-label="Saved"><Bookmark size={16} aria-hidden="true"/><span>{formatTimestamp(entry.updatedAt)}</span></div>
            <div className="entry-actions" data-label="Actions"><Link className="text-button" to={`/forms/${entry.formKey}/record/${encodeURIComponent(entry.entryId)}`}>View <ArrowRight size={16}/></Link><Link className="secondary-button update-button" to={`/forms/${entry.formKey}/record/${encodeURIComponent(entry.entryId)}`}>Update</Link></div>
          </div>;})}
        </div>}
      </section>
    </>}
  </div>;
}
