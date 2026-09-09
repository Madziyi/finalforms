const DISPLAY_NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  useGrouping: true,
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

export function displayNumber(value: number) {
  const rounded = Number(value.toFixed(3));
  return DISPLAY_NUMBER_FORMAT.format(Object.is(rounded, -0) ? 0 : rounded);
}
export function historyLabel(point:{plant_date?:string;measured_at?:string}){const date=point.plant_date??point.measured_at?.slice(0,10)??"";const time=point.measured_at?.slice(11,16);return time&&time!=="23:59"?`${date.slice(5)} ${time}`:date.slice(5);}
export function measurementLabel(point:{plant_date?:string;measured_at?:string},mode:"shift"|"time-slot"|"daily"="daily"){
  const date=point.plant_date??point.measured_at?.slice(0,10)??"";
  if(!date)return "";
  const friendlyDate=new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short"}).format(new Date(`${date}T12:00:00`));
  const time=point.measured_at?.slice(11,16);
  if(mode==="shift")return `${friendlyDate} ${time==="23:00"?"N":"D"}`;
  if(mode==="time-slot"&&time&&time!=="23:59")return `${friendlyDate} ${time}`;
  return friendlyDate;
}
export function formatTimestamp(value?:string|null){if(!value)return"—";const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString();}
export function todayPlantDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
