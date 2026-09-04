const AI_FIELDS = [
  "generator_stator_phase_a", "generator_stator_phase_b", "generator_stator_phase_c", "generator_drive_end", "generator_non_drive_end", "generator_forward_thrust", "generator_aft_thrust", "lube_reservoir", "lube_supply", "gearbox_lube_return", "combustion_air_inlet", "skid_enclosure", "water_level", "steam_flow", "feed_water_flow", "condenser_steam_flow", "natural_gas_temperature", "vibration_generator_nde", "vibration_gearbox", "vibration_turbine_case", "status_monitor_comp_fuel_flow", "ops_kilowatts", "varx_kilovars", "st60_61_turbine_speed", "dcs_calculated_tit", "turbine_outlet_temperature", "compressor_discharge", "gas_pressure_natural",
] as const;

type AiFieldKey = (typeof AI_FIELDS)[number];
type Region = "left" | "middle" | "right";
type Guide = { tag: string; description: string; unit: string; region: Region };

export const AI_FIELD_GUIDES: Record<AiFieldKey, Guide> = {
  generator_stator_phase_a:{tag:"TE-68A",description:"Generator Stator Phase A",unit:"Deg F",region:"left"}, generator_stator_phase_b:{tag:"TE-68B",description:"Generator Stator Phase B",unit:"Deg F",region:"left"}, generator_stator_phase_c:{tag:"TE-68C",description:"Generator Stator Phase C",unit:"Deg F",region:"left"}, generator_drive_end:{tag:"TE-63A",description:"Generator Drive End",unit:"Deg F",region:"left"}, generator_non_drive_end:{tag:"TE-63B",description:"Generator Non-Drive End",unit:"Deg F",region:"left"}, generator_forward_thrust:{tag:"TE-64A",description:"Generator Forward Thrust Pad",unit:"Deg F",region:"left"}, generator_aft_thrust:{tag:"TE-64B",description:"Generator Aft Thrust Bearing",unit:"Deg F",region:"left"}, lube_reservoir:{tag:"TE-40",description:"Lube Oil Tank Temp",unit:"Deg F",region:"left"}, lube_supply:{tag:"TE-41",description:"Lube Oil Supply Temp",unit:"Deg F",region:"left"}, gearbox_lube_return:{tag:"TE-31",description:"Gearbox Lube Oil Return Temp",unit:"Deg F",region:"left"}, combustion_air_inlet:{tag:"TE-61A",description:"Compressor Inlet Temp (Air Temp)",unit:"Deg F",region:"left"}, skid_enclosure:{tag:"TE-61",description:"Skid Enclosure Temp",unit:"Deg F",region:"left"},
  water_level:{tag:"LT-700",description:"HRSG Drum Level",unit:"in WC",region:"middle"}, steam_flow:{tag:"FT-702",description:"HRSG Steam Flow",unit:"LB/HR",region:"middle"}, feed_water_flow:{tag:"FT-701",description:"HRSG Feed Water Flow",unit:"LB/HR",region:"middle"}, condenser_steam_flow:{tag:"FT-855",description:"Condenser Steam Flow",unit:"LB/HR",region:"middle"}, natural_gas_temperature:{tag:"TE-10",description:"Natural Gas Temp",unit:"Deg F",region:"middle"}, vibration_generator_nde:{tag:"VT-64",description:"Generator Non-Drive End",unit:"in/sec",region:"middle"}, vibration_gearbox:{tag:"VT-63",description:"Gearbox Vibration",unit:"in/sec",region:"middle"}, vibration_turbine_case:{tag:"VT-65",description:"Turbine Vibration",unit:"mils",region:"middle"},
  status_monitor_comp_fuel_flow:{tag:"FT-11",description:"Natural Fuel Gas Flow / Natural Gas Fuel Flow",unit:"SCFM",region:"right"}, ops_kilowatts:{tag:"KV",description:"Generator Kilowatts",unit:"KW",region:"right"}, varx_kilovars:{tag:"VARX",description:"Generator Kilovars",unit:"KVAR",region:"right"}, st60_61_turbine_speed:{tag:"ST-60 / ST-61",description:"Turbine Speed RPM",unit:"RPM",region:"right"}, dcs_calculated_tit:{tag:"CTIT",description:"Calculated Turbine Inlet Temp",unit:"Deg F",region:"right"}, turbine_outlet_temperature:{tag:"TOT",description:"Turbine Outlet Temp",unit:"Deg F",region:"right"}, compressor_discharge:{tag:"PT-60",description:"Compressor Discharge Press",unit:"PSI",region:"right"}, gas_pressure_natural:{tag:"PT-10",description:"Natural Gas Supply Press",unit:"PSI",region:"right"},
};

const RESPONSE_ALIASES: Record<string, AiFieldKey> = { natural_gas_flow:"status_monitor_comp_fuel_flow", natural_fuel_gas_flow:"status_monitor_comp_fuel_flow", natural_gas_fuel_flow:"status_monitor_comp_fuel_flow" };

export function buildAiCapturePrompt() {
  const fields=AI_FIELDS.map(key=>{const g=AI_FIELD_GUIDES[key];return `- ${key}: tag "${g.tag}"; description "${g.description}"; unit "${g.unit}"; ${g.region} detail column`;}).join("\n");
  return `You are reading a fixed-format gas turbine DCS operator log screen.
Extract ONLY values that are visibly present in the supplied image.
Never infer, repair, normalize, or replace an abnormal-looking value.
If a value cannot be read confidently, return null and add its key to "needsCheck".

Read only the three detailed "Tag / Description" columns.
For each requested field:
1. Find its large tag code in the specified detail column.
2. Read the number at the right side of that exact horizontal row.
3. Confirm the smaller description and unit belong to the same row.
4. Preserve the displayed precision and sign.

Return JSON only in this exact shape:
{"values":{"field_key":number|null},"needsCheck":["field_key"]}
Map each detailed tag row to its matching field key below. Return a number when readable; numeric strings are also accepted.
The FT-11 row labeled "Natural Fuel Gas Flow" or "Natural Gas Fuel Flow" must be returned as "status_monitor_comp_fuel_flow".
The allowed field keys and their screen anchors are:
${fields}
Do not return keys outside this list.`;
}

export function normalizeAiCaptureResponse(parsed: unknown) {
  const result=parsed as {values?:Record<string,unknown>;needsCheck?:unknown}|null;
  const values={} as Record<AiFieldKey,number|null>;
  for(const key of AI_FIELDS){const raw=result?.values?.[key];const value=typeof raw==="number"?raw:typeof raw==="string"&&raw.trim()?Number(raw):NaN;values[key]=Number.isFinite(value)?value:null;}
  const needsCheck=Array.isArray(result?.needsCheck)?[...new Set(result.needsCheck.filter((key):key is string=>typeof key==="string").map(key=>RESPONSE_ALIASES[key]??key).filter((key):key is AiFieldKey=>AI_FIELDS.includes(key as AiFieldKey)))]:[];
  return {values,needsCheck};
}
