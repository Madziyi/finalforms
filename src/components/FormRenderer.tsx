import { LineChart } from "lucide-react";
import { useState } from "react";
import type { FieldDefinition, FieldValue, FormDefinition, Values } from "../types";
import { NumericField } from "./NumericField";
import { TrendModal } from "./TrendModal";

export type HistoryMap=Record<string,Array<{aggregate_id:string;plant_date:string;measured_at:string;numeric_value:number}>>;

function GenericField({field,value,onChange,onTrend,disabled,allowCalculatedEdits}:{field:FieldDefinition;value:FieldValue|undefined;onChange:(v:FieldValue)=>void;onTrend:()=>void;disabled:boolean;allowCalculatedEdits:boolean}){
  if(field.type==="select"){
    const selectValue=typeof value==="string"?value:"";
    const selectDisabled=disabled||(field.calculated&&!allowCalculatedEdits);
    const options=field.options??[];
    return <div className="generic-field"><div><div className="field-title-line"><span className="field-title">{field.label}</span>{field.trendable&&<button className="trend-link" type="button" onClick={onTrend} title={`View trend for ${field.label}`} aria-label={`View trend for ${field.label}`}><LineChart size={17}/></button>}</div>{field.helpText&&<div className="history-empty">{field.helpText}</div>}</div>{options.length===2?<div className="toggle-row select-toggles" role="group" aria-label={field.label}>{options.map(o=>{const selected=selectValue===o.value;return <button type="button" key={o.value} disabled={selectDisabled} className={`toggle-button ${selected?"selected":""}`} aria-pressed={selected} onClick={()=>onChange(o.value)}>{o.label}</button>})}</div>:<select disabled={selectDisabled} value={selectValue} onChange={e=>onChange(e.target.value||null)}><option value="">Select…</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}</div>;
  }
  if(field.type==="paired-number"){
    const pair=typeof value==="object"&&value!==null&&"first" in value?value:{first:null,second:null};
    return <div className="generic-field"><div><span className="field-title">{field.label}</span></div><div className="duration-inputs">{(["first","second"] as const).map((key,i)=><label key={key}><span>{field.pairedLabels?.[i]??key}</span><input type="number" step="any" disabled={disabled} value={pair[key]??""} onChange={e=>onChange({...pair,[key]:e.target.value===""?null:Number(e.target.value)})}/></label>)}</div></div>;
  }
  if(field.type==="duration"){
    const minutes=typeof value==="number"?value:0;const hours=Math.floor(minutes/60);const mins=minutes%60;
    return <div className="generic-field"><div><span className="field-title">{field.label}</span></div><div className="duration-inputs"><label><span>Hours</span><input type="number" min="0" disabled={disabled} value={value==null?"":hours} onChange={e=>{const h=e.target.value===""?0:Number(e.target.value);onChange(h*60+mins);}}/></label><label><span>Minutes</span><input type="number" min="0" max="59" disabled={disabled} value={value==null?"":mins} onChange={e=>{const m=e.target.value===""?0:Number(e.target.value);onChange(hours*60+m);}}/></label></div></div>;
  }
  return <div className="generic-field"><div><span className="field-title">{field.label}</span>{field.helpText&&<div className="history-empty">{field.helpText}</div>}</div><input disabled={disabled||(field.calculated&&!allowCalculatedEdits)} value={typeof value==="string"?value:""} onChange={e=>onChange(e.target.value||null)}/></div>;
}

export function FormRenderer({form,values,history,onChange,onTrend,disabled=false,allowCalculatedEdits=false}:{form:FormDefinition;values:Values;history:HistoryMap;onChange:(key:string,value:FieldValue)=>void;onTrend:(key:string)=>void;disabled?:boolean;allowCalculatedEdits?:boolean}){
  const [trendFieldKey,setTrendFieldKey]=useState<string|null>(null);
  const fields=form.sections.flatMap((section)=>section.fields);
  const trendField=fields.find((field)=>field.key===trendFieldKey&&field.trendable);
  const historyMode: "shift" | "time-slot" | "daily"=form.hasShift?"shift":form.hasTimeSlot?"time-slot":"daily";
  const openTrend=(key:string)=>setTrendFieldKey(key);

  return <><div className="form-sections">{form.sections.map(section=><section key={section.key} className={`form-section ${section.fields.every(f=>f.optional)?"optional-section":""}`}><div className="section-title-block"><h2>{section.title}</h2>{section.description&&<p>{section.description}</p>}</div><div className="section-fields">{section.fields.map(field=>field.type==="number"||field.type==="computed"?<NumericField key={field.key} field={field} value={values[field.key]} history={history[field.key]??[]} onChange={v=>onChange(field.key,v)} onTrend={()=>openTrend(field.key)} historyMode={historyMode} disabled={disabled} allowCalculatedEdits={allowCalculatedEdits}/>:<GenericField key={field.key} field={field} value={values[field.key]} onChange={v=>onChange(field.key,v)} onTrend={()=>openTrend(field.key)} disabled={disabled} allowCalculatedEdits={allowCalculatedEdits}/>)}</div></section>)}</div>{trendField&&<TrendModal formKey={form.key} field={trendField} initialPoints={history[trendField.key]??[]} onClose={()=>setTrendFieldKey(null)}/>}</>;
}
