var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// shared/forms.ts
var n = /* @__PURE__ */ __name((key, label, options = {}) => ({ key, label, type: "number", trendable: true, ...options }), "n");
var t = /* @__PURE__ */ __name((key, label, options = {}) => ({ key, label, type: "text", ...options }), "t");
var section = /* @__PURE__ */ __name((key, title, fields, description) => ({
  key,
  title,
  fields,
  description
}), "section");
var range = /* @__PURE__ */ __name((label, min, max) => ({ label, min, max }), "range");
var FORMS = [
  {
    key: "ecc-cooling-tower-water-control-tests",
    number: 1,
    version: 3,
    name: "ECC Cooling Tower Water Control Tests",
    backupWorksheetName: "01 Cooling Tower",
    schedule: "shift",
    hasShift: true,
    sections: [
      section("cooling-tower", "ECC Cooling Tower Water Control Tests", [
        n("ct_meter", "CT Meter"),
        n("conductivity", "Conductivity", { target: range("1100\u20131200", 1100, 1200) }),
        n("ph", "pH", { target: range("8.3\u20139.0", 8.3, 9) }),
        n("f_chlorine", "F-Chlorine", { target: range("0.5\u20131.0", 0.5, 1), optional: true, infrequent: true }),
        n("orp", "ORP", { helpText: "Target TBD" }),
        n("ptsa", "PTSA (New Molybdenum)", { unit: "ppb", target: range("90\u2013110 ppb", 90, 110) }),
        { key: "pump_sp_st", label: "Pump Sp/St", type: "paired-number", pairedLabels: ["Sp", "St"], trendable: false }
      ]),
      section("chilled-water", "ECC Chilled Water", [
        n("chilled_conductivity", "Conductivity Record", { optional: true, infrequent: true }),
        n("chilled_ph", "pH", { target: range("8.5\u201310", 8.5, 10), optional: true, infrequent: true }),
        n("chilled_po4", "PO4", { unit: "ppm", target: range("8\u201315 ppm", 8, 15), optional: true, infrequent: true }),
        { key: "chilled_additions", label: "Additions \u2014 Pump Run Time", type: "duration", optional: true, infrequent: true, trendable: true }
      ])
    ]
  },
  {
    key: "boiler-water-control-tests",
    number: 2,
    version: 3,
    name: "Boiler Water Control Tests",
    backupWorksheetName: "02 Boiler Water",
    schedule: "shift",
    hasShift: true,
    hasBoiler: true,
    sections: [
      section("chemistry", "Boiler Chemistry", [
        n("p_alk_burette", "P-ALK Burette Reading", { trendable: false, showHistory: false, recordVisible: false }),
        n("p_alk", "P-ALK", { target: range("350\u2013600", 350, 600), calculated: true }),
        n("m_alk_burette", "M-ALK Burette Reading", { trendable: false, showHistory: false, recordVisible: false }),
        n("m_alk", "M-ALK", { target: range("400\u2013800", 400, 800), calculated: true }),
        n("oh_alk", "OH-ALK", { target: range("200\u2013600", 200, 600), calculated: true, helpText: "Calculated: (P-ALK \xD7 2) - M-ALK" }),
        n("blr_cond", "BLR COND", { target: range("3700\u20134200", 3700, 4200) }),
        n("sulfite", "SULFITE", { target: range("30\u201360", 30, 60) }),
        n("blr_mo", "BLR MO", { target: range("0.75\u20131.5", 0.75, 1.5) }),
        n("ph", "pH", { target: range("10\u201311.5", 10, 11.5) })
      ]),
      section("operating", "Operating / Chemical Data", [
        n("steam_total", "Steam Total", { calculated: true, trendable: false, helpText: "Derived from Daily Consumption Totals for the applicable handover." }),
        n("makeup_total", "Makeup Total", { calculated: true, trendable: false, helpText: "Derived from Daily Consumption Totals for the applicable handover." }),
        n("am", "AM", { unit: "L" }),
        n("so3", "SO3", { unit: "L" }),
        n("sc", "SC", { unit: "L" }),
        n("bd", "BD", { unit: "Turn" })
      ])
    ]
  },
  {
    key: "yst-yk-chiller",
    number: 3,
    version: 1,
    name: "YST/YK Chiller",
    backupWorksheetName: "03 YST-YK Chiller",
    schedule: "time-slot",
    hasTimeSlot: true,
    sections: [
      section("general", "General", [
        n("hour_meter", "Hour Meter Reading"),
        n("oat", "OAT"),
        { key: "drive", label: "Drive", type: "select", options: [{ label: "YST", value: "YST" }, { label: "YK", value: "YK" }] }
      ]),
      section("motor", "Motor", [
        n("motor_full_load_amps", "% Full Load Amps (YK)", { unit: "%" }),
        n("motor_input_power", "Input Power"),
        n("motor_output_voltage", "Output Voltage"),
        n("motor_vsd_frequency", "VSD Frequency", { unit: "Hz" })
      ]),
      section("turbine", "Turbine", [
        n("turbine_steam_flow", "Steam Flow", { unit: "lbs/hr" }),
        n("turbine_governor_valve", "% Governor Valve (YST)", { unit: "%" }),
        n("turbine_speed", "Speed"),
        n("turbine_speed_setpoint", "Speed Setpoint"),
        n("turbine_exhaust_pressure", "Exhaust Pressure"),
        n("turbine_bearing_de", "Bearing Temperature (DE)"),
        n("turbine_bearing_nde", "Bearing Temperature (NDE)")
      ]),
      section("condenser", "Condenser", [
        n("condenser_entering_temp", "Entering Temperature"),
        n("condenser_leaving_temp", "Leaving Temperature"),
        n("condenser_pressure", "Pressure"),
        n("condenser_saturation_temp", "Saturation Temperature"),
        n("condenser_flow_gpm", "Flow Rate", { unit: "GPM" })
      ]),
      section("evaporator", "Evaporator", [
        n("evaporator_entering_temp", "Entering Temperature"),
        n("evaporator_leaving_temp", "Leaving Temperature"),
        n("evaporator_pressure", "Pressure"),
        n("evaporator_saturation_temp", "Saturation Temperature"),
        n("evaporator_flow_gpm", "Flow Rate", { unit: "GPM" })
      ]),
      section("compressor", "Compressor", [
        n("compressor_oil_pressure", "Oil Pressure"),
        n("compressor_oil_sump_temp", "Oil Sump Temperature"),
        n("compressor_discharge_temp", "Discharge Temperature"),
        { key: "compressor_oil_level", label: "Oil Level", type: "select", options: [{ label: "OK", value: "OK" }, { label: "Low", value: "Low" }] },
        n("compressor_hgbp", "HGBP", { unit: "%" }),
        n("compressor_prv", "PRV", { unit: "%" })
      ])
    ]
  },
  {
    key: "york-centrifugal-chiller",
    number: 4,
    version: 1,
    name: "York Centrifugal Chiller",
    backupWorksheetName: "04 York Chiller",
    schedule: "time-slot",
    hasTimeSlot: true,
    description: "Entry order follows the operators' physical walk-through order.",
    sections: [
      section("readings", "Readings", [
        { key: "oat_db_wb", label: "1. Outside Air Temperature D.B./W.B.", type: "paired-number", pairedLabels: ["DB", "WB"], trendable: false },
        n("evap_chw_inlet_pressure", "2. Evaporator \u2014 Chilled Water \u2014 Inlet Pressure"),
        n("evap_chw_outlet_pressure", "3. Evaporator \u2014 Chilled Water \u2014 Outlet Pressure"),
        { key: "compressor_oil_level", label: "4. Compressor \u2014 Oil Level", type: "select", options: [{ label: "OK", value: "OK" }, { label: "Low", value: "Low" }] },
        n("motor_volts", "5. Compressor \u2014 Motor \u2014 Volts"),
        n("motor_amps", "6. Compressor \u2014 Motor \u2014 Amps"),
        n("cond_water_inlet_pressure", "7. Condenser \u2014 Water \u2014 Inlet Pressure"),
        n("cond_water_outlet_pressure", "8. Condenser \u2014 Water \u2014 Outlet Pressure"),
        n("evap_chw_inlet_temp", "9. Evaporator \u2014 Chilled Water \u2014 Inlet Temperature"),
        n("evap_chw_outlet_temp", "10. Evaporator \u2014 Chilled Water \u2014 Outlet Temperature"),
        n("evap_freon_suction_pressure", "11. Evaporator \u2014 Freon Suction Pressure"),
        n("cond_freon_discharge_pressure", "12. Condenser \u2014 Freon \u2014 Discharge Pressure"),
        n("compressor_oil_pressure", "13. Compressor \u2014 Oil Pressure"),
        n("cond_water_inlet_temp", "14. Condenser \u2014 Water \u2014 Inlet Temperature"),
        n("cond_water_outlet_temp", "15. Condenser \u2014 Water \u2014 Outlet Temperature"),
        n("motor_full_load_amps", "16. Compressor \u2014 Motor \u2014 % Full Load Amps", { unit: "%" }),
        n("hour_meter", "17. Hour Meter Reading"),
        n("compressor_suction_temp", "18. Compressor \u2014 Suction Temperature"),
        n("compressor_discharge_temp", "19. Compressor \u2014 Discharge Temperature"),
        n("compressor_oil_temp", "20. Compressor \u2014 Oil Temperature"),
        n("cond_freon_discharge_temp", "21. Condenser \u2014 Freon \u2014 Discharge Temperature")
      ])
    ]
  },
  {
    key: "daily-consumption-totals",
    number: 5,
    version: 2,
    name: "Daily Consumption Totals",
    backupWorksheetName: "05 Daily Consumption",
    schedule: "derived",
    derivedFrom: "integrator-readings",
    description: "Read-only local projection from the exact completed Form 8 records for this date and the previous calendar date.",
    sections: [
      section("weather", "Outside Air Temperature", [
        n("oat_high", "OAT High", { calculated: true }),
        n("oat_low", "OAT Low", { calculated: true })
      ]),
      section("boiler-2", "Boiler 2", [
        n("boiler2_gas_used", "Gas Used", { calculated: true }),
        n("boiler2_steam_used", "Boiler Steam", { calculated: true })
      ]),
      section("boiler-3", "Boiler 3", [
        n("boiler3_gas_used", "Gas Used", { calculated: true, optional: true }),
        n("boiler3_steam_used", "Boiler Steam", { calculated: true, optional: true }),
        n("boiler3_lbs_steam_per_cuft_gas", "LBS. STM per CU.FT. GAS", { calculated: true, optional: true })
      ]),
      section("boiler-4", "Boiler 4", [
        n("boiler4_gas_used", "Gas Used", { calculated: true, optional: true }),
        n("boiler4_steam_used", "Boiler Steam", { calculated: true, optional: true }),
        n("boiler4_lbs_steam_per_cuft_gas", "LBS. STM per CU.FT. GAS", { calculated: true, optional: true })
      ]),
      section("daily-totals", "Daily Totals", [
        n("total_steam", "Total Steam", { calculated: true }),
        n("average_flow_hr", "Average Flow/Hr.", { calculated: true }),
        n("makeup_water_gallon", "Make-Up Water \u2014 Gallon", { calculated: true }),
        n("makeup_percent", "%", { calculated: true, helpText: "Make-Up Water Gallon \xF7 Total Steam \xD7 1000" })
      ])
    ]
  },
  {
    key: "makeup",
    number: 6,
    version: 2,
    name: "Makeup",
    backupWorksheetName: "06 Makeup",
    schedule: "derived",
    derivedFrom: "integrator-readings",
    description: "Read-only local projection from the exact current and previous calendar-date Form 8 records.",
    sections: [
      section("readings", "Derived Makeup Readings", [
        n("cw_makeup_current", "C.W. Makeup \u2014 Current Reading", { calculated: true }),
        n("cw_makeup_used", "C.W. Makeup \u2014 Daily Usage", { calculated: true, helpText: "Current date C.W. Makeup minus previous calendar date C.W. Makeup" }),
        n("tower_makeup_current", "Tower Makeup \u2014 Current Reading", { calculated: true })
      ])
    ]
  },
  {
    key: "boiler-water-pretreatment-condensate-tests",
    number: 7,
    version: 1,
    name: "Boiler Water Pretreatment & Condensate Tests",
    backupWorksheetName: "07 Pretreatment",
    schedule: "shift",
    hasShift: true,
    sections: [
      section("softener", "Softener", [
        n("softener_th", "TH", { target: range("< 0.5", void 0, 0.5) }),
        n("softener_conductivity", "Conductivity", { optional: true, infrequent: true })
      ]),
      section("feedwater", "Feedwater", [
        n("feedwater_th", "TH", { target: range("< 0.5", void 0, 0.5) }),
        n("feedwater_conductivity", "Conductivity"),
        n("feedwater_ph", "pH", { target: range("8.4\u20139.5", 8.4, 9.5) })
      ]),
      section("condensate", "Condensate", [
        n("condensate_th", "TH", { target: range("< 0.2", void 0, 0.2) }),
        n("condensate_conductivity", "Conductivity", { target: range("10\u201350", 10, 50) }),
        n("condensate_ph", "pH", { target: range("8\u20139", 8, 9) })
      ])
    ]
  },
  {
    key: "integrator-readings",
    number: 8,
    version: 2,
    name: "Integrator Readings",
    backupWorksheetName: "08 Integrator",
    schedule: "daily",
    description: "Completing this form deterministically refreshes Forms 5 and 6 from the exact accepted revision.",
    sections: [
      section("weather", "Outside Air Temperature", [
        n("oat_high", "OAT High", { unit: "\xB0F", calculated: true, optional: true, helpText: "Derived from completed Form 9 O.A.T. Memorial readings for this date." }),
        n("oat_low", "OAT Low", { unit: "\xB0F", calculated: true, optional: true, helpText: "Derived from completed Form 9 O.A.T. Memorial readings for this date." })
      ]),
      section("water-steam", "Water / Steam", [
        n("softener1", "Softener 1", { optional: true }),
        n("softener2", "Softener 2", { optional: true }),
        n("reverse_osmosis", "Reverse Osmosis", { optional: true }),
        n("gas_boiler2", "Gas \u2014 Boiler 2", { optional: true }),
        n("steam_boiler2", "Steam \u2014 Boiler 2", { optional: true }),
        n("gas_boiler3", "Gas \u2014 Boiler 3", { optional: true }),
        n("steam_boiler3", "Steam \u2014 Boiler 3", { optional: true }),
        n("gas_boiler4", "Gas \u2014 Boiler 4", { optional: true }),
        n("steam_boiler4", "Steam \u2014 Boiler 4", { optional: true }),
        n("hotwell_makeup", "Hotwell Makeup", { optional: true })
      ]),
      section("electric-gas", "Electrical / Gas", [
        n("generated_kwh", "Generated KWH", { optional: true }),
        n("utility_kwh", "Utility KWH", { defaultValue: 24e4 }),
        n("dump_cond_steam", "Dump Cond. Steam", { optional: true }),
        n("cw_makeup", "C.W. Makeup", { optional: true }),
        n("tower_makeup", "Tower Makeup", { optional: true })
      ])
    ]
  },
  {
    key: "gas-turbine-log-sheet",
    number: 9,
    version: 1,
    name: "GAS TURBINE LOG SHEET",
    backupWorksheetName: "09 Gas Turbine",
    schedule: "time-slot",
    hasTimeSlot: true,
    aiAssisted: true,
    description: "Take a guided photo of the DCS log screen, verify extracted readings, then fill the remaining manual fields.",
    sections: [
      section("oat-memorial", "O.A.T. Memorial", [
        n("oat_memorial", "O.A.T. Memorial", { optional: true })
      ]),
      section("dcs-readings", "DCS / Main Log Readings", [
        n("generator_stator_phase_a", "Generator Stator Phase A", { unit: "\xB0F", aiExtract: true }),
        n("generator_stator_phase_b", "Generator Stator Phase B", { unit: "\xB0F", aiExtract: true }),
        n("generator_stator_phase_c", "Generator Stator Phase C", { unit: "\xB0F", aiExtract: true }),
        n("generator_drive_end", "Generator Drive End", { unit: "\xB0F", aiExtract: true }),
        n("generator_non_drive_end", "Generator Non-Drive End", { unit: "\xB0F", aiExtract: true }),
        n("generator_forward_thrust", "Generator Forward Thrust", { unit: "\xB0F", aiExtract: true }),
        n("generator_aft_thrust", "Generator Aft Thrust", { unit: "\xB0F", aiExtract: true }),
        n("lube_reservoir", "Lube Reservoir", { unit: "\xB0F", aiExtract: true }),
        n("lube_supply", "Lube Supply", { unit: "\xB0F", aiExtract: true }),
        n("gearbox_lube_return", "Gearbox Lube Return", { unit: "\xB0F", aiExtract: true }),
        n("combustion_air_inlet", "Combustion Air Inlet", { unit: "\xB0F", aiExtract: true }),
        n("skid_enclosure", "Skid Enclosure", { unit: "\xB0F", aiExtract: true }),
        n("water_level", "Water Level", { aiExtract: true }),
        n("steam_flow", "Steam Flow", { unit: "lbs/hr", aiExtract: true }),
        n("feed_water_flow", "Feed Water Flow", { aiExtract: true }),
        n("condenser_steam_flow", "Condenser Steam Flow", { aiExtract: true }),
        n("natural_gas_temperature", "Natural Gas Temperature", { unit: "\xB0F", aiExtract: true }),
        n("vibration_generator_nde", "Generator Non-Drive End Vibration", { unit: "in/sec", aiExtract: true }),
        n("vibration_gearbox", "Gearbox Vibration", { unit: "in/sec", aiExtract: true }),
        n("vibration_turbine_case", "Turbine Case Vibration", { unit: "mils", aiExtract: true }),
        n("status_monitor_comp_fuel_flow", "Status Monitor Comp. Fuel Flow", { aiExtract: true }),
        n("ops_kilowatts", "Kilowatts", { aiExtract: true }),
        n("varx_kilovars", "Kilovars", { aiExtract: true }),
        n("st60_61_turbine_speed", "ST60/61 Turbine Speed", { unit: "RPM", aiExtract: true }),
        n("dcs_calculated_tit", "DCS Calculated TIT", { unit: "\xB0F", aiExtract: true }),
        n("turbine_outlet_temperature", "Turbine Outlet Temperatures", { unit: "\xB0F", aiExtract: true }),
        n("compressor_discharge", "Compressor Discharge", { unit: "PSI", aiExtract: true }),
        n("gas_pressure_natural", "Gas Pressure Natural", { unit: "PSI", aiExtract: true })
      ]),
      section("front-panel", "Front Panel", [
        n("front_calculated_tit", "Calculated TIT", { unit: "\xB0F" }),
        n("front_starts", "Starts"),
        n("front_hour_meter", "Hour Meter"),
        { key: "gas_detection_ch1", label: "Gas Detection CH1 % LEL", type: "select", options: [{ label: "OK", value: "OK" }, { label: "Alarm", value: "Alarm" }] },
        { key: "gas_detection_ch2", label: "Gas Detection CH2 % LEL", type: "select", options: [{ label: "OK", value: "OK" }, { label: "Alarm", value: "Alarm" }] }
      ]),
      section("middle-panel", "Middle Panel", [
        n("middle_kilovars", "Kilovars"),
        n("middle_kilowatts", "Kilowatts"),
        n("generator_volts_ab", "Generator Volts A & B"),
        n("generator_volts_bc", "Generator Volts B & C"),
        n("generator_volts_ca", "Generator Volts C & A"),
        n("generator_amps_a", "Generator Amps A Phase"),
        n("generator_amps_b", "Generator Amps B Phase"),
        n("generator_amps_c", "Generator Amps C Phase"),
        n("generator_frequency", "Generator Frequency", { unit: "Hz" })
      ]),
      section("generator-skid", "Generator Skid", [
        n("gas_fuel_manifold_pressure", "Gas Fuel Manifold Pressure"),
        n("turbine_lube_supply_pressure", "Turbine Lube Supply Pressure"),
        n("gearbox_pump_discharge_pressure", "Gearbox Pump Discharge Pressure"),
        n("combustion_air_inlet_delta_p", "Combustion Air Inlet Delta P", { unit: "H2O" }),
        n("gearbox_lube_oil_supply_pressure", "Gearbox Lube Oil Supply Pressure"),
        n("lube_oil_filter_delta_p", "Lube Oil Filter Delta P", { unit: "PSIP" }),
        n("generator_bearing_lube_supply", "Generator Bearing Lube Supply", { unit: "PSI" }),
        n("lube_oil_tank_level", "Lube Oil Tank Level", { unit: "%" }),
        n("turbine_lube_inlet_pressure", "Turbine Lube Inlet Pressure", { unit: "PSI" })
      ]),
      section("optional", "Additional / Infrequent Readings", [
        n("boiler1_steam_flow", "Boiler 1 Steam Flow", { optional: true, infrequent: true }),
        n("boiler3_steam_flow", "Boiler 3 Steam Flow", { optional: true, infrequent: true }),
        n("boiler4_steam_flow", "Boiler 4 Steam Flow", { optional: true, infrequent: true }),
        n("relative_humidity", "Relative Humidity", { unit: "%", optional: true, infrequent: true }),
        n("temperature_monitor_f5", "Temperature Monitor - F5", { optional: true, infrequent: true }),
        t("control_mode", "Control Mode", { optional: true, infrequent: true }),
        n("status_monitor_f1_raw_fuel_flow", "Status Monitor F1 Raw Fuel Flow", { optional: true, infrequent: true }),
        n("vibration_monitor_f6_v", "Vibration Monitor F6 V", { optional: true, infrequent: true }),
        n("h20_injector", "H20 Injector", { optional: true, infrequent: true }),
        n("start_motor_cooling_oil_pressure", "Start Motor Cooling Oil Pressure", { optional: true, infrequent: true }),
        n("front_turbine_speed", "Front Panel Turbine Speed", { unit: "RPM", optional: true, infrequent: true })
      ], "These readings are normally skipped. Fill them only when needed.")
    ]
  }
];
var FORM_MAP = new Map(FORMS.map((form) => [form.key, form]));
function getForm(formKey) {
  return FORM_MAP.get(formKey);
}
__name(getForm, "getForm");
function allFields(form) {
  return form.sections.flatMap((section2) => section2.fields);
}
__name(allFields, "allFields");

// worker/domain/aiCapture.ts
var AI_FIELDS = [
  "generator_stator_phase_a",
  "generator_stator_phase_b",
  "generator_stator_phase_c",
  "generator_drive_end",
  "generator_non_drive_end",
  "generator_forward_thrust",
  "generator_aft_thrust",
  "lube_reservoir",
  "lube_supply",
  "gearbox_lube_return",
  "combustion_air_inlet",
  "skid_enclosure",
  "water_level",
  "steam_flow",
  "feed_water_flow",
  "condenser_steam_flow",
  "natural_gas_temperature",
  "vibration_generator_nde",
  "vibration_gearbox",
  "vibration_turbine_case",
  "status_monitor_comp_fuel_flow",
  "ops_kilowatts",
  "varx_kilovars",
  "st60_61_turbine_speed",
  "dcs_calculated_tit",
  "turbine_outlet_temperature",
  "compressor_discharge",
  "gas_pressure_natural"
];
var AI_FIELD_GUIDES = {
  generator_stator_phase_a: { tag: "TE-68A", description: "Generator Stator Phase A", unit: "Deg F", region: "left" },
  generator_stator_phase_b: { tag: "TE-68B", description: "Generator Stator Phase B", unit: "Deg F", region: "left" },
  generator_stator_phase_c: { tag: "TE-68C", description: "Generator Stator Phase C", unit: "Deg F", region: "left" },
  generator_drive_end: { tag: "TE-63A", description: "Generator Drive End", unit: "Deg F", region: "left" },
  generator_non_drive_end: { tag: "TE-63B", description: "Generator Non-Drive End", unit: "Deg F", region: "left" },
  generator_forward_thrust: { tag: "TE-64A", description: "Generator Forward Thrust Pad", unit: "Deg F", region: "left" },
  generator_aft_thrust: { tag: "TE-64B", description: "Generator Aft Thrust Bearing", unit: "Deg F", region: "left" },
  lube_reservoir: { tag: "TE-40", description: "Lube Oil Tank Temp", unit: "Deg F", region: "left" },
  lube_supply: { tag: "TE-41", description: "Lube Oil Supply Temp", unit: "Deg F", region: "left" },
  gearbox_lube_return: { tag: "TE-31", description: "Gearbox Lube Oil Return Temp", unit: "Deg F", region: "left" },
  combustion_air_inlet: { tag: "TE-61A", description: "Compressor Inlet Temp (Air Temp)", unit: "Deg F", region: "left" },
  skid_enclosure: { tag: "TE-61", description: "Skid Enclosure Temp", unit: "Deg F", region: "left" },
  water_level: { tag: "LT-700", description: "HRSG Drum Level", unit: "in WC", region: "middle" },
  steam_flow: { tag: "FT-702", description: "HRSG Steam Flow", unit: "LB/HR", region: "middle" },
  feed_water_flow: { tag: "FT-701", description: "HRSG Feed Water Flow", unit: "LB/HR", region: "middle" },
  condenser_steam_flow: { tag: "FT-855", description: "Condenser Steam Flow", unit: "LB/HR", region: "middle" },
  natural_gas_temperature: { tag: "TE-10", description: "Natural Gas Temp", unit: "Deg F", region: "middle" },
  vibration_generator_nde: { tag: "VT-64", description: "Generator Non-Drive End", unit: "in/sec", region: "middle" },
  vibration_gearbox: { tag: "VT-63", description: "Gearbox Vibration", unit: "in/sec", region: "middle" },
  vibration_turbine_case: { tag: "VT-65", description: "Turbine Vibration", unit: "mils", region: "middle" },
  status_monitor_comp_fuel_flow: { tag: "FT-11", description: "Natural Fuel Gas Flow / Natural Gas Fuel Flow", unit: "SCFM", region: "right" },
  ops_kilowatts: { tag: "KV", description: "Generator Kilowatts", unit: "KW", region: "right" },
  varx_kilovars: { tag: "VARX", description: "Generator Kilovars", unit: "KVAR", region: "right" },
  st60_61_turbine_speed: { tag: "ST-60 / ST-61", description: "Turbine Speed RPM", unit: "RPM", region: "right" },
  dcs_calculated_tit: { tag: "CTIT", description: "Calculated Turbine Inlet Temp", unit: "Deg F", region: "right" },
  turbine_outlet_temperature: { tag: "TOT", description: "Turbine Outlet Temp", unit: "Deg F", region: "right" },
  compressor_discharge: { tag: "PT-60", description: "Compressor Discharge Press", unit: "PSI", region: "right" },
  gas_pressure_natural: { tag: "PT-10", description: "Natural Gas Supply Press", unit: "PSI", region: "right" }
};
var RESPONSE_ALIASES = { natural_gas_flow: "status_monitor_comp_fuel_flow", natural_fuel_gas_flow: "status_monitor_comp_fuel_flow", natural_gas_fuel_flow: "status_monitor_comp_fuel_flow" };
function buildAiCapturePrompt() {
  const fields = AI_FIELDS.map((key) => {
    const g = AI_FIELD_GUIDES[key];
    return `- ${key}: tag "${g.tag}"; description "${g.description}"; unit "${g.unit}"; ${g.region} detail column`;
  }).join("\n");
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
__name(buildAiCapturePrompt, "buildAiCapturePrompt");
function normalizeAiCaptureResponse(parsed) {
  const result = parsed;
  const values = {};
  for (const key of AI_FIELDS) {
    const raw = result?.values?.[key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
    values[key] = Number.isFinite(value) ? value : null;
  }
  const needsCheck = Array.isArray(result?.needsCheck) ? [...new Set(result.needsCheck.filter((key) => typeof key === "string").map((key) => RESPONSE_ALIASES[key] ?? key).filter((key) => AI_FIELDS.includes(key)))] : [];
  return { values, needsCheck };
}
__name(normalizeAiCaptureResponse, "normalizeAiCaptureResponse");

// shared/safetyContract.ts
var PROTOCOL_VERSION = 3;
var APP_SCHEMA_VERSION = 3;
var BOILER_VALUES = [2, 3, 4];
var SHIFT_OPTIONS = ["Day", "Night", "Extra"];
var TIME_SLOTS = ["03:00", "07:00", "11:00", "15:00", "19:00", "23:00"];
function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
__name(isIsoDate, "isIsoDate");
function normalizeContext(formKey, input) {
  const form = getForm(formKey);
  if (!form) throw new Error(`Unknown form: ${formKey}`);
  if (!isIsoDate(input.date)) throw new Error("A valid plant date is required.");
  const parts = [input.date];
  if (form.hasShift) {
    if (!SHIFT_OPTIONS.includes(input.shift)) throw new Error("Day, Night, or Extra shift is required.");
    parts.push(`shift=${input.shift}`);
  }
  if (form.hasTimeSlot) {
    if (!input.timeSlot || !TIME_SLOTS.includes(input.timeSlot)) throw new Error("A valid four-hour time slot is required.");
    parts.push(`time=${input.timeSlot}`);
  }
  if (form.hasBoiler) {
    if (!BOILER_VALUES.includes(input.boilerNumber)) throw new Error("Boiler must be 2, 3, or 4.");
    parts.push(`boiler=${input.boilerNumber}`);
  }
  return parts.join("|");
}
__name(normalizeContext, "normalizeContext");
function shiftMeasuredAt(date, shift) {
  const time = shift === "Extra" ? "06:00:00" : shift === "Day" ? "12:00:00" : "23:59:00";
  return `${date}T${time}`;
}
__name(shiftMeasuredAt, "shiftMeasuredAt");
function nextCalendarDate(date, delta2) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta2));
  return dt.toISOString().slice(0, 10);
}
__name(nextCalendarDate, "nextCalendarDate");

// worker/domain/hash.ts
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`).join(",")}}`;
}
__name(stableStringify, "stableStringify");
async function sha256Hex(input) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256Hex, "sha256Hex");

// shared/form8Oat.ts
function deriveForm8OatExtrema(records, sourceDate, fieldKey) {
  const slots = /* @__PURE__ */ new Set();
  const readings = [];
  for (const record of records) {
    if (record.date !== sourceDate || record.temporaryEdit) continue;
    if (record.status !== void 0 && record.status !== "completed") continue;
    if (record.lifecycle !== void 0 && record.lifecycle !== "completed") continue;
    const value = record.values[fieldKey];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const slot = record.timeSlot ?? "";
    if (slots.has(slot)) continue;
    slots.add(slot);
    readings.push(value);
  }
  if (!readings.length) return { status: "hidden", values: {} };
  return { status: "ready", values: { oat_high: Math.max(...readings), oat_low: Math.min(...readings) } };
}
__name(deriveForm8OatExtrema, "deriveForm8OatExtrema");

// worker/domain/exportMaterialization.ts
function form2TotalsSourceDate(date, shift) {
  if (shift === "Night") return date;
  if (shift === "Day") return nextCalendarDate(date, -1);
  return null;
}
__name(form2TotalsSourceDate, "form2TotalsSourceDate");
function materializeExportValues(formKey, date, shift, storedValues, sources) {
  const values = { ...storedValues };
  if (formKey === "integrator-readings") {
    const extrema = deriveForm8OatExtrema(sources.form9Oat, date, "oat_memorial");
    values.oat_high = extrema.status === "ready" ? extrema.values.oat_high ?? null : null;
    values.oat_low = extrema.status === "ready" ? extrema.values.oat_low ?? null : null;
  }
  if (formKey === "boiler-water-control-tests") {
    values.steam_total = null;
    values.makeup_total = null;
    const sourceDate = form2TotalsSourceDate(date, shift);
    const projection = sourceDate ? sources.form5Projections.find((candidate) => candidate.plantDate === sourceDate && candidate.status === "current") : void 0;
    if (projection) {
      values.steam_total = projection.values.total_steam ?? null;
      values.makeup_total = projection.values.makeup_water_gallon ?? null;
    }
  }
  return values;
}
__name(materializeExportValues, "materializeExportValues");

// worker/domain/backup.ts
var BACKUP_CONTRACT_VERSION = "ecc-backup-v2";
var STANDARD_COLUMNS = [
  "backupGenerationId",
  "payloadHash",
  "snapshotBoundary",
  "recordType",
  "aggregateId",
  "revisionId",
  "revision",
  "date",
  "time",
  "shift",
  "boilerNumber",
  "operator",
  "operatorId",
  "status",
  "formVersion",
  "sourceRevisions",
  "manualAdjustments",
  "warnings"
];
function torontoDate(now = /* @__PURE__ */ new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = /* @__PURE__ */ __name((type) => parts.find((p) => p.type === type)?.value ?? "", "get");
  return `${get("year")}-${get("month")}-${get("day")}`;
}
__name(torontoDate, "torontoDate");
function previousTorontoDate(now = /* @__PURE__ */ new Date()) {
  return nextCalendarDate(torontoDate(now), -1);
}
__name(previousTorontoDate, "previousTorontoDate");
function flattenPublished(row, values = JSON.parse(row.values_json)) {
  return {
    recordType: "published_revision",
    aggregateId: row.canonical_id,
    revisionId: `${row.canonical_id}@r${row.revision}`,
    revision: Number(row.revision),
    date: row.plant_date,
    time: row.time_slot,
    shift: row.shift,
    boilerNumber: row.boiler_number,
    operator: row.operator_name,
    operatorId: row.operator_id,
    status: row.lifecycle,
    formVersion: Number(row.form_version),
    sourceRevisions: null,
    manualAdjustments: null,
    warnings: null,
    ...values
  };
}
__name(flattenPublished, "flattenPublished");
function flattenProjection(row) {
  return {
    recordType: "derived_projection",
    aggregateId: row.projection_id,
    revisionId: row.projection_id,
    revision: Number(row.revision),
    date: row.plant_date,
    time: null,
    shift: null,
    boilerNumber: null,
    operator: "System",
    operatorId: null,
    status: row.status,
    formVersion: 2,
    sourceRevisions: JSON.parse(row.source_revisions_json),
    manualAdjustments: null,
    warnings: JSON.parse(row.warnings_json),
    ...JSON.parse(row.effective_values_json)
  };
}
__name(flattenProjection, "flattenProjection");
async function buildBackupGeneration(db, plantDate) {
  const existing = await db.prepare(`SELECT * FROM backup_generations WHERE plant_date=? ORDER BY generation_number DESC LIMIT 1`).bind(plantDate).first();
  const dirty = await db.prepare(`SELECT last_dirty_at FROM backup_dirty_dates WHERE plant_date=?`).bind(plantDate).first();
  if (existing?.canonical_json && existing.payload_hash && existing.status !== "verified" && (!dirty || dirty.last_dirty_at <= existing.created_at)) return { ready: true, generation: existing };
  if (existing?.status === "verified" && (!dirty || dirty.last_dirty_at <= existing.created_at)) return { ready: true, generation: existing };
  if (existing?.status === "not_ready" && (!dirty || dirty.last_dirty_at <= existing.created_at)) return { ready: false, reason: existing.last_error ?? "Backup generation is waiting for dependencies." };
  const previousDate = nextCalendarDate(plantDate, -1);
  const [publishedResult, projectionResult, sourceProjectionResult, boundaryResult] = await db.batch([
    db.prepare(`SELECT canonical_id,revision,form_key,form_version,'completed' AS lifecycle,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,created_at FROM canonical_records WHERE plant_date=? ORDER BY form_key,time_slot,shift,boiler_number,canonical_id`).bind(plantDate),
    db.prepare(`SELECT projection_id,form_key,plant_date,revision,status,source_revisions_json,effective_values_json,warnings_json FROM derived_projections WHERE plant_date=? ORDER BY form_key`).bind(plantDate),
    // Form 2 Day rows on plantDate use the current Form 5 projection from the
    // previous date. Read both dates in this batch so the frozen backup has a
    // single D1 snapshot boundary for the row and its source projection.
    db.prepare(`SELECT plant_date,status,effective_values_json FROM derived_projections WHERE form_key='daily-consumption-totals' AND plant_date IN (?,?) ORDER BY plant_date`).bind(plantDate, previousDate),
    db.prepare(`SELECT CURRENT_TIMESTAMP AS boundary`)
  ]);
  const snapshotBoundary = String(boundaryResult.results?.[0]?.boundary ?? (/* @__PURE__ */ new Date()).toISOString());
  const publishedRows = publishedResult.results ?? [];
  const projectionRows = projectionResult.results ?? [];
  const form5ProjectionSources = (sourceProjectionResult.results ?? []).map((row) => ({
    plantDate: String(row.plant_date),
    status: String(row.status),
    values: JSON.parse(row.effective_values_json)
  }));
  const form9OatSources = publishedRows.filter((row) => row.form_key === "gas-turbine-log-sheet").map((row) => ({
    date: row.plant_date,
    timeSlot: row.time_slot,
    values: JSON.parse(row.values_json),
    status: row.lifecycle,
    lifecycle: row.lifecycle
  }));
  const materializationSources = { form9Oat: form9OatSources, form5Projections: form5ProjectionSources };
  const generationId = crypto.randomUUID();
  const generationNumber = Number(existing?.generation_number ?? 0) + 1;
  const forms = [];
  for (const form of FORMS) {
    const fieldKeys = allFields(form).map((f) => f.key);
    let entries = [];
    if (form.number === 5 || form.number === 6) {
      const projection = projectionRows.find((p) => p.form_key === form.key);
      if (projection) entries = [flattenProjection(projection)];
    } else {
      entries = publishedRows.filter((r) => r.form_key === form.key).map((row) => flattenPublished(row, materializeExportValues(
        form.key,
        row.plant_date,
        row.shift,
        JSON.parse(row.values_json),
        materializationSources
      )));
    }
    forms.push({ formId: form.key, formName: form.name, formVersion: form.version, worksheetName: form.backupWorksheetName, standardColumns: STANDARD_COLUMNS, fieldKeys, entries });
  }
  for (const form of forms) for (const entry of form.entries) {
    entry.backupGenerationId = generationId;
    entry.snapshotBoundary = snapshotBoundary;
    entry.payloadHash = null;
  }
  const payload = { schemaVersion: 2, contractVersion: BACKUP_CONTRACT_VERSION, backupDate: plantDate, generatedAt: snapshotBoundary, generationId, generationNumber, snapshotBoundary, forms };
  const authoritativeJson = stableStringify(payload);
  const authoritativeHash = await sha256Hex(authoritativeJson);
  const deliveryId = generationId;
  const shortHash = authoritativeHash.slice(0, 12);
  const xlsxFileName = `ECC_Operator_Backup_${plantDate}_G${String(generationNumber).padStart(3, "0")}_${shortHash}.xlsx`;
  const jsonFileName = `ECC_Operator_Backup_${plantDate}_G${String(generationNumber).padStart(3, "0")}_${shortHash}.json`;
  const receiptFileName = `ECC_Operator_Backup_${plantDate}_G${String(generationNumber).padStart(3, "0")}_${shortHash}_${generationId}.receipt.json`;
  const statements = [
    db.prepare(`INSERT INTO backup_generations(generation_id,plant_date,generation_number,snapshot_boundary,status,canonical_json,payload_hash,delivery_id,ready_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(generationId, plantDate, generationNumber, snapshotBoundary, "ready", authoritativeJson, authoritativeHash, deliveryId),
    db.prepare(`INSERT INTO backup_deliveries(delivery_id,generation_id,status,request_hash) VALUES(?,?,?,?)`).bind(deliveryId, generationId, "pending", authoritativeHash)
  ];
  for (const row of publishedRows) statements.push(db.prepare(`INSERT INTO backup_generation_items(generation_id,item_type,item_id,form_key,revision_number) VALUES(?,?,?,?,?)`).bind(generationId, "record", row.canonical_id, row.form_key, Number(row.revision)));
  for (const row of projectionRows) statements.push(db.prepare(`INSERT INTO backup_generation_items(generation_id,item_type,item_id,form_key,revision_number) VALUES(?,?,?,?,?)`).bind(generationId, "projection", row.projection_id, row.form_key, Number(row.revision)));
  await db.batch(statements);
  return { ready: true, generation: { generation_id: generationId, plant_date: plantDate, generation_number: generationNumber, snapshot_boundary: snapshotBoundary, status: "ready", canonical_json: authoritativeJson, payload_hash: authoritativeHash, delivery_id: deliveryId, created_at: snapshotBoundary, workflow_instance_id: null, xlsxFileName, jsonFileName, receiptFileName } };
}
__name(buildBackupGeneration, "buildBackupGeneration");
async function getGeneration(db, generationId) {
  return db.prepare(`SELECT * FROM backup_generations WHERE generation_id=?`).bind(generationId).first();
}
__name(getGeneration, "getGeneration");
async function deliverBackupGeneration(env, generationId) {
  const generation = await getGeneration(env.DB, generationId);
  if (!generation?.canonical_json || !generation.payload_hash || !generation.delivery_id) throw new Error("Backup generation is not frozen and ready.");
  if (generation.status === "verified") return { outcome: "verified" };
  if (!env.POWER_AUTOMATE_BACKUP_URL || !env.POWER_AUTOMATE_BACKUP_KEY) {
    await env.DB.prepare(`UPDATE backup_generations SET status='failed',last_error='Power Automate secrets are not configured.' WHERE generation_id=?`).bind(generationId).run();
    await env.DB.prepare(`UPDATE backup_deliveries SET status='failed',last_error='Power Automate secrets are not configured.',updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(generation.delivery_id).run();
    return { outcome: "permanent_failure", message: "Power Automate secrets are not configured." };
  }
  const shortHash = generation.payload_hash.slice(0, 12);
  const jsonFileName = `ECC_Operator_Backup_${generation.plant_date}_G${String(generation.generation_number).padStart(3, "0")}_${shortHash}.json`;
  const xlsxFileName = `ECC_Operator_Backup_${generation.plant_date}_G${String(generation.generation_number).padStart(3, "0")}_${shortHash}.xlsx`;
  const receiptFileName = `ECC_Operator_Backup_${generation.plant_date}_G${String(generation.generation_number).padStart(3, "0")}_${shortHash}_${generation.generation_id}.receipt.json`;
  const envelope = {
    contractVersion: BACKUP_CONTRACT_VERSION,
    deliveryId: generation.delivery_id,
    generationId: generation.generation_id,
    generationNumber: Number(generation.generation_number),
    backupDate: generation.plant_date,
    payloadHash: generation.payload_hash,
    jsonFileName,
    xlsxFileName,
    receiptFileName,
    canonicalJson: generation.canonical_json
  };
  await env.DB.batch([
    env.DB.prepare(`UPDATE backup_generations SET status='delivering',attempt_count=attempt_count+1,last_error=NULL WHERE generation_id=?`).bind(generationId),
    env.DB.prepare(`UPDATE backup_deliveries SET status='delivering',attempt_count=attempt_count+1,started_at=COALESCE(started_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(generation.delivery_id)
  ]);
  let response;
  try {
    response = await fetch(env.POWER_AUTOMATE_BACKUP_URL, { method: "POST", headers: { "Content-Type": "application/json", "X-ECC-Backup-Key": env.POWER_AUTOMATE_BACKUP_KEY }, body: stableStringify(envelope) });
  } catch (error) {
    const message = `Delivery network outcome is ambiguous: ${String(error)}`;
    await env.DB.batch([
      env.DB.prepare(`UPDATE backup_generations SET status='reconciling',last_error=? WHERE generation_id=?`).bind(message, generationId),
      env.DB.prepare(`UPDATE backup_deliveries SET status='reconciling',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(message, generation.delivery_id)
    ]);
    throw error;
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const message = `Power Automate returned HTTP ${response.status}: ${text.slice(0, 1200)}`;
    const permanent = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429;
    await env.DB.batch([
      env.DB.prepare(`UPDATE backup_generations SET status=?,last_error=? WHERE generation_id=?`).bind(permanent ? "failed" : "reconciling", message, generationId),
      env.DB.prepare(`UPDATE backup_deliveries SET status=?,last_error=?,response_json=?,updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(permanent ? "failed" : "reconciling", message, JSON.stringify(body), generation.delivery_id)
    ]);
    if (permanent) return { outcome: "permanent_failure", response: body, message };
    throw new Error(message);
  }
  const verified = body?.success === true && body?.generationId === generation.generation_id && body?.payloadHash === generation.payload_hash && body?.jsonFileName === jsonFileName && body?.xlsxFileName === xlsxFileName && body?.receiptFileName === receiptFileName;
  if (!verified) {
    const message = "Power Automate response did not echo the exact generation ID, payload hash, and immutable filenames.";
    await env.DB.batch([
      env.DB.prepare(`UPDATE backup_generations SET status='reconciling',last_error=? WHERE generation_id=?`).bind(message, generationId),
      env.DB.prepare(`UPDATE backup_deliveries SET status='reconciling',last_error=?,response_json=?,updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(message, JSON.stringify(body), generation.delivery_id)
    ]);
    throw new Error(message);
  }
  await env.DB.batch([
    env.DB.prepare(`UPDATE backup_generations SET status='verified',verified_at=CURRENT_TIMESTAMP,last_error=NULL WHERE generation_id=?`).bind(generationId),
    env.DB.prepare(`UPDATE backup_deliveries SET status='verified',response_json=?,json_file_name=?,xlsx_file_name=?,last_error=NULL,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE delivery_id=?`).bind(JSON.stringify(body), body.jsonFileName ?? jsonFileName, body.xlsxFileName ?? xlsxFileName, generation.delivery_id),
    env.DB.prepare(`DELETE FROM backup_dirty_dates WHERE plant_date=? AND last_dirty_at <= ?`).bind(generation.plant_date, generation.created_at)
  ]);
  return { outcome: "verified", response: body };
}
__name(deliverBackupGeneration, "deliverBackupGeneration");
async function backupStatus(db, plantDate) {
  const where = plantDate ? "WHERE g.plant_date=?" : "";
  const stmt = db.prepare(`SELECT g.*,d.status delivery_status,d.attempt_count delivery_attempts,d.json_file_name,d.xlsx_file_name,d.last_error delivery_error FROM backup_generations g LEFT JOIN backup_deliveries d ON d.generation_id=g.generation_id ${where} ORDER BY g.plant_date DESC,g.generation_number DESC LIMIT 100`);
  const result = plantDate ? await stmt.bind(plantDate).all() : await stmt.all();
  return result.results ?? [];
}
__name(backupStatus, "backupStatus");
async function dirtyDates(db, throughDate) {
  const result = throughDate ? await db.prepare(`SELECT plant_date FROM backup_dirty_dates WHERE plant_date<=? ORDER BY plant_date LIMIT 30`).bind(throughDate).all() : await db.prepare(`SELECT plant_date FROM backup_dirty_dates ORDER BY plant_date LIMIT 30`).all();
  return (result.results ?? []).map((r) => r.plant_date);
}
__name(dirtyDates, "dirtyDates");

// shared/canonical.ts
var CANONICAL_ID_SEPARATOR = "-";
function canonicalRecordId(formKey, context) {
  const form = getForm(formKey);
  if (!form) throw new Error(`Unknown form: ${formKey}`);
  const input = typeof context === "string" ? { date: context } : context;
  const date = input.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Canonical IDs require an ISO plant date.");
  const parts = [`F${String(form.number).padStart(2, "0")}`, date];
  if (form.hasTimeSlot) {
    if (!input.timeSlot || !/^\d{2}:\d{2}$/.test(input.timeSlot)) throw new Error("Canonical IDs require a time slot.");
    parts.push(input.timeSlot.replace(":", ""));
  }
  if (form.hasShift) {
    if (input.shift !== "Day" && input.shift !== "Night" && input.shift !== "Extra") throw new Error("Canonical IDs require a shift.");
    parts.push(input.shift === "Night" ? "1" : input.shift === "Day" ? "2" : "3");
  }
  if (form.hasBoiler) {
    if (!input.boilerNumber) throw new Error("Canonical IDs require a boiler.");
    parts.push(String(input.boilerNumber));
  }
  return parts.join(CANONICAL_ID_SEPARATOR);
}
__name(canonicalRecordId, "canonicalRecordId");
function isCanonicalRecordId(formKey, id) {
  const form = getForm(formKey);
  return typeof id === "string" && Boolean(form) && id.startsWith(`F${String(form.number).padStart(2, "0")}-`);
}
__name(isCanonicalRecordId, "isCanonicalRecordId");

// shared/formulas.ts
var DERIVED_FORMULA_VERSION = 1;
function number(values, key) {
  const value = values[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
__name(number, "number");
function delta(current, previous, label, warnings) {
  if (current == null || previous == null) return null;
  const result = current - previous;
  if (result < 0) {
    warnings.push(`${label}: current cumulative reading is below the previous calendar-date reading.`);
  }
  return result;
}
__name(delta, "delta");
function ratio(numerator, denominator) {
  return numerator == null || denominator == null || denominator <= 0 ? null : numerator / denominator;
}
__name(ratio, "ratio");
function sumAvailable(values) {
  const numbers = values.filter((value) => value != null);
  return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) : null;
}
__name(sumAvailable, "sumAvailable");
function calculateOhAlk(pAlk, mAlk) {
  return typeof pAlk === "number" && Number.isFinite(pAlk) && typeof mAlk === "number" && Number.isFinite(mAlk) ? pAlk * 2 - mAlk : null;
}
__name(calculateOhAlk, "calculateOhAlk");
function calculateForm5And6(input) {
  const { currentValues, previousValues, currentDate, previousDate, hasCurrent, hasPrevious } = input;
  const warnings = [];
  const dependencyStatus = hasCurrent && hasPrevious ? "current" : "waiting";
  if (!hasCurrent) warnings.push(`Waiting for completed Form 8 on ${currentDate}.`);
  if (!hasPrevious) warnings.push(`Waiting for completed Form 8 on previous calendar date ${previousDate}.`);
  const b3Gas = delta(number(currentValues, "gas_boiler3"), number(previousValues, "gas_boiler3"), "Boiler 3 gas", warnings);
  const b3Steam = delta(number(currentValues, "steam_boiler3"), number(previousValues, "steam_boiler3"), "Boiler 3 steam", warnings);
  const b4Gas = delta(number(currentValues, "gas_boiler4"), number(previousValues, "gas_boiler4"), "Boiler 4 gas", warnings);
  const b4Steam = delta(number(currentValues, "steam_boiler4"), number(previousValues, "steam_boiler4"), "Boiler 4 steam", warnings);
  const makeup = delta(number(currentValues, "hotwell_makeup"), number(previousValues, "hotwell_makeup"), "Hotwell makeup", warnings);
  const b2Steam = number(currentValues, "steam_boiler2");
  const totalSteam = dependencyStatus === "current" ? sumAvailable([b2Steam, b3Steam, b4Steam]) : null;
  const form5 = {
    oat_high: number(currentValues, "oat_high"),
    oat_low: number(currentValues, "oat_low"),
    boiler2_gas_used: number(currentValues, "gas_boiler2"),
    boiler2_steam_used: b2Steam,
    boiler3_gas_used: dependencyStatus === "current" ? b3Gas : null,
    boiler3_steam_used: dependencyStatus === "current" ? b3Steam : null,
    boiler3_lbs_steam_per_cuft_gas: dependencyStatus === "current" ? ratio(b3Steam, b3Gas) : null,
    boiler4_gas_used: dependencyStatus === "current" ? b4Gas : null,
    boiler4_steam_used: dependencyStatus === "current" ? b4Steam : null,
    boiler4_lbs_steam_per_cuft_gas: dependencyStatus === "current" ? ratio(b4Steam, b4Gas) : null,
    total_steam: totalSteam,
    average_flow_hr: totalSteam == null ? null : totalSteam / 24,
    makeup_water_gallon: dependencyStatus === "current" ? makeup : null,
    makeup_percent: totalSteam == null || totalSteam === 0 || makeup == null ? null : makeup / totalSteam * 1e3
  };
  const cwDelta = delta(number(currentValues, "cw_makeup"), number(previousValues, "cw_makeup"), "C.W. Makeup", warnings);
  const form6 = {
    cw_makeup_current: number(currentValues, "cw_makeup"),
    cw_makeup_used: dependencyStatus === "current" ? cwDelta : null,
    tower_makeup_current: number(currentValues, "tower_makeup")
  };
  return { status: dependencyStatus, form5, form6, warnings };
}
__name(calculateForm5And6, "calculateForm5And6");

// worker/domain/trends.ts
function derivedNumericStatements(db, input) {
  const form = getForm(input.formKey);
  const trendable = new Set(allFields(form).filter((field) => field.trendable).map((field) => field.key));
  const statements = [
    db.prepare(`UPDATE derived_numeric_observations SET is_current=0 WHERE projection_id=?`).bind(input.projectionId)
  ];
  const measuredAt2 = `${input.plantDate}T23:59:00`;
  for (const [fieldKey, value] of Object.entries(input.values)) {
    if (!trendable.has(fieldKey) || typeof value !== "number" || !Number.isFinite(value)) continue;
    statements.push(
      db.prepare(`INSERT INTO derived_numeric_observations(projection_id,projection_revision,form_key,field_key,plant_date,measured_at,numeric_value,is_current) VALUES(?,?,?,?,?,?,?,1)`).bind(input.projectionId, input.projectionRevision, input.formKey, fieldKey, input.plantDate, measuredAt2, value)
    );
  }
  return statements;
}
__name(derivedNumericStatements, "derivedNumericStatements");

// worker/domain/derivations.ts
var FORMULA_VERSION = DERIVED_FORMULA_VERSION;
async function sourceForDate(db, plantDate) {
  const latest = await db.prepare(`SELECT canonical_id,revision,plant_date,values_json FROM canonical_records WHERE form_key='integrator-readings' AND plant_date=? LIMIT 1`).bind(plantDate).first();
  return latest ? { revision_id: `${latest.canonical_id}@r${latest.revision}`, aggregate_id: latest.canonical_id, revision: Number(latest.revision), plant_date: latest.plant_date, values_json: latest.values_json } : null;
}
__name(sourceForDate, "sourceForDate");
async function oatSourcesForDate(db, plantDate) {
  const result = await db.prepare(`
    SELECT canonical_id,revision,plant_date,time_slot,values_json
    FROM canonical_records
    WHERE form_key='gas-turbine-log-sheet' AND plant_date=?
    ORDER BY time_slot,revision DESC,canonical_id
  `).bind(plantDate).all();
  const rows = (result.results ?? []).map((row) => ({
    revision_id: `${row.canonical_id}@r${row.revision}`,
    aggregate_id: row.canonical_id,
    revision: Number(row.revision),
    plant_date: row.plant_date,
    time_slot: row.time_slot ?? null,
    values_json: row.values_json
  }));
  return {
    rows,
    records: rows.map((row) => ({
      date: row.plant_date,
      timeSlot: row.time_slot,
      values: JSON.parse(row.values_json),
      status: "completed",
      lifecycle: "completed"
    }))
  };
}
__name(oatSourcesForDate, "oatSourcesForDate");
function sourceRefs(rows) {
  return rows.map((r) => ({ aggregateId: r.aggregate_id, revisionId: r.revision_id, revision: Number(r.revision), plantDate: r.plant_date }));
}
__name(sourceRefs, "sourceRefs");
function applyForm5OatExtrema(form5Values, sourceRecords, sourceDate) {
  const extrema = deriveForm8OatExtrema(sourceRecords, sourceDate, "oat_memorial");
  return {
    ...form5Values,
    oat_high: extrema.status === "ready" ? extrema.values.oat_high ?? null : null,
    oat_low: extrema.status === "ready" ? extrema.values.oat_low ?? null : null
  };
}
__name(applyForm5OatExtrema, "applyForm5OatExtrema");
async function upsertProjection(db, formKey, plantDate, baseValues, status, refs, warnings) {
  const existing = await db.prepare(`SELECT projection_id,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json FROM derived_projections WHERE form_key=? AND plant_date=?`).bind(formKey, plantDate).first();
  const projectionId = existing?.projection_id ?? canonicalRecordId(formKey, plantDate);
  await db.prepare(`UPDATE projection_adjustments SET active=0,superseded_at=COALESCE(superseded_at,CURRENT_TIMESTAMP) WHERE projection_id=? AND active=1`).bind(projectionId).run();
  await db.prepare(`UPDATE attention_items SET resolved_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE plant_date=? AND resolved_at IS NULL AND code IN ('daily-consumption-totals_manual_adjustment_review','makeup_manual_adjustment_review')`).bind(plantDate).run();
  const refsJson = stableStringify(refs);
  const baseJson = stableStringify(baseValues);
  const warningsJson = stableStringify(warnings);
  const effective = { ...baseValues };
  const effectiveJson = stableStringify(effective);
  const finalStatus = status;
  const unchanged = existing && existing.status === finalStatus && Number(existing.formula_version) === FORMULA_VERSION && stableStringify(JSON.parse(existing.source_revisions_json)) === refsJson && stableStringify(JSON.parse(existing.base_values_json)) === baseJson && stableStringify(JSON.parse(existing.effective_values_json)) === effectiveJson && stableStringify(JSON.parse(existing.warnings_json)) === warningsJson;
  if (unchanged) return { projectionId, revision: Number(existing.revision), status: finalStatus, changed: false };
  const revision = Number(existing?.revision ?? 0) + 1;
  const statements = [];
  if (existing) {
    statements.push(db.prepare(`UPDATE derived_projections SET revision=?,status=?,formula_version=?,source_revisions_json=?,base_values_json=?,effective_values_json=?,warnings_json=?,updated_at=CURRENT_TIMESTAMP WHERE projection_id=?`).bind(revision, finalStatus, FORMULA_VERSION, refsJson, baseJson, effectiveJson, warningsJson, projectionId));
  } else {
    statements.push(db.prepare(`INSERT INTO derived_projections(projection_id,form_key,plant_date,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(projectionId, formKey, plantDate, revision, finalStatus, FORMULA_VERSION, refsJson, baseJson, effectiveJson, warningsJson));
  }
  statements.push(...derivedNumericStatements(db, {
    projectionId,
    projectionRevision: revision,
    formKey,
    plantDate,
    values: effective
  }));
  statements.push(db.prepare(`INSERT INTO backup_dirty_dates(plant_date,reason,first_dirty_at,last_dirty_at) VALUES(?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
    ON CONFLICT(plant_date) DO UPDATE SET reason=excluded.reason,last_dirty_at=CURRENT_TIMESTAMP`).bind(plantDate, `${formKey} projection revision changed`));
  await db.batch(statements);
  return { projectionId, revision, status: finalStatus, changed: true };
}
__name(upsertProjection, "upsertProjection");
async function recomputeDerivedDate(db, plantDate) {
  const previousDate = nextCalendarDate(plantDate, -1);
  const current = await sourceForDate(db, plantDate);
  const previous = await sourceForDate(db, previousDate);
  const refs = sourceRefs([...previous ? [previous] : [], ...current ? [current] : []]);
  const currentValues = current ? JSON.parse(current.values_json) : {};
  const previousValues = previous ? JSON.parse(previous.values_json) : {};
  const oatSources = await oatSourcesForDate(db, plantDate);
  const calculated = calculateForm5And6({
    currentValues,
    previousValues,
    currentDate: plantDate,
    previousDate,
    hasCurrent: Boolean(current),
    hasPrevious: Boolean(previous)
  });
  const dependencyStatus = calculated.status;
  const warnings = calculated.warnings;
  const form5 = applyForm5OatExtrema(calculated.form5, oatSources.records, plantDate);
  const form6 = calculated.form6;
  const form5Refs = sourceRefs([
    ...previous ? [previous] : [],
    ...current ? [current] : [],
    ...oatSources.rows
  ]);
  const form5Result = await upsertProjection(db, "daily-consumption-totals", plantDate, form5, dependencyStatus, form5Refs, warnings);
  const form6Result = await upsertProjection(db, "makeup", plantDate, form6, dependencyStatus, refs, warnings);
  return { plantDate, form5: form5Result, form6: form6Result, warnings };
}
__name(recomputeDerivedDate, "recomputeDerivedDate");

// worker/domain/validation.ts
var DomainError = class extends Error {
  constructor(code, message, status = 400, details) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
  }
  code;
  status;
  details;
  static {
    __name(this, "DomainError");
  }
};
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
__name(isFiniteNumber, "isFiniteNumber");
function validateFieldValue(field, value) {
  if (value === null) return;
  switch (field.type) {
    case "number":
    case "computed":
      if (!isFiniteNumber(value)) throw new DomainError("invalid_value", `${field.label} must be a finite number or blank.`);
      return;
    case "duration":
      if (!isFiniteNumber(value) || value < 0 || !Number.isInteger(value)) throw new DomainError("invalid_value", `${field.label} must be whole minutes or blank.`);
      return;
    case "text":
      if (typeof value !== "string") throw new DomainError("invalid_value", `${field.label} must be text or blank.`);
      return;
    case "select": {
      if (typeof value !== "string" || !field.options?.some((option) => option.value === value)) throw new DomainError("invalid_value", `${field.label} contains an invalid selection.`);
      return;
    }
    case "paired-number": {
      if (typeof value !== "object" || value === null || Array.isArray(value) || !("first" in value) || !("second" in value)) throw new DomainError("invalid_value", `${field.label} must contain both paired readings.`);
      const pair = value;
      if (!(pair.first === null || isFiniteNumber(pair.first)) || !(pair.second === null || isFiniteNumber(pair.second))) throw new DomainError("invalid_value", `${field.label} contains an invalid paired reading.`);
      return;
    }
  }
}
__name(validateFieldValue, "validateFieldValue");
function validateFormValues(formKey, formVersion, context, rawValues) {
  const form = getForm(formKey);
  if (!form) throw new DomainError("unknown_form", "Unknown form.");
  if (formVersion !== form.version) throw new DomainError("form_version", `Form version ${form.version} is required.`, 409);
  if (form.schedule === "derived") {
    throw new DomainError("derived_readonly", "Derived forms are server-owned.", 409);
  }
  if (!rawValues || typeof rawValues !== "object" || Array.isArray(rawValues)) throw new DomainError("invalid_values", "values must be an object.");
  if (form.hasBoiler && !BOILER_VALUES.includes(context.boilerNumber)) throw new DomainError("invalid_boiler", "Boiler must be 2, 3, or 4.");
  let contextKey;
  try {
    contextKey = normalizeContext(formKey, context);
  } catch (error) {
    throw new DomainError("invalid_context", error instanceof Error ? error.message : String(error));
  }
  const allowed = new Map(allFields(form).map((f) => [f.key, f]));
  const values = {};
  for (const [key, value] of Object.entries(rawValues)) {
    const field = allowed.get(key);
    if (!field) throw new DomainError("unknown_field", `Unknown field ${key}.`);
    if (field.calculated && formKey === "boiler-water-control-tests" && ["p_alk", "m_alk", "oh_alk"].includes(key)) continue;
    validateFieldValue(field, value);
    values[key] = value;
  }
  if (formKey === "boiler-water-control-tests") {
    const pBurette = values.p_alk_burette;
    const mBurette = values.m_alk_burette;
    values.p_alk = isFiniteNumber(pBurette) ? pBurette * 40 : null;
    values.m_alk = isFiniteNumber(mBurette) ? mBurette * 40 : null;
    values.oh_alk = calculateOhAlk(values.p_alk, values.m_alk);
  }
  return { values, contextKey };
}
__name(validateFormValues, "validateFormValues");

// worker/domain/db.ts
async function openAttention(db, input) {
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO attention_items(attention_id,aggregate_id,plant_date,category,code,severity,message,details_json) VALUES(?,?,?,?,?,?,?,?)`).bind(id, input.aggregateId ?? null, input.plantDate ?? null, input.category, input.code, input.severity, input.message, input.details == null ? null : JSON.stringify(input.details)).run();
  return id;
}
__name(openAttention, "openAttention");

// worker/domain/localFirst.ts
function canonical(row) {
  return {
    aggregateId: String(row.canonical_id),
    formKey: String(row.form_key),
    contextKey: String(row.context_key),
    revision: Number(row.revision),
    generation: Number(row.generation),
    publishedRevision: Number(row.revision),
    lifecycle: "completed",
    operatorId: row.operator_id ?? null,
    operator: String(row.operator_name),
    date: String(row.plant_date),
    shift: row.shift ?? null,
    timeSlot: row.time_slot ?? null,
    boilerNumber: row.boiler_number == null ? null : Number(row.boiler_number),
    values: JSON.parse(row.values_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    provenance: { source: "canonical-sync", generation: Number(row.generation), revision: Number(row.revision) }
  };
}
__name(canonical, "canonical");
function tombstoneRecord(row) {
  return {
    aggregateId: row.canonical_id,
    formKey: row.form_key,
    contextKey: row.context_key,
    revision: Number(row.revision),
    generation: Number(row.generation),
    publishedRevision: null,
    lifecycle: "superseded",
    operatorId: null,
    operator: "System",
    date: row.context_key?.slice(0, 10) ?? "",
    shift: null,
    timeSlot: null,
    boilerNumber: null,
    values: {},
    createdAt: row.tombstoned_at,
    updatedAt: row.tombstoned_at,
    provenance: { source: "canonical-sync", tombstone: true, movedToId: row.moved_to_id }
  };
}
__name(tombstoneRecord, "tombstoneRecord");
function generationOf(payload) {
  return payload.generation ?? payload.localVersion;
}
__name(generationOf, "generationOf");
function measuredAt(record) {
  if (record.timeSlot) return `${record.date}T${record.timeSlot}:00`;
  return shiftMeasuredAt(record.date, record.shift);
}
__name(measuredAt, "measuredAt");
function deleteNumericObservationStatements(db, obsoleteAggregateIds) {
  const statements = [];
  const deleted = /* @__PURE__ */ new Set();
  for (const aggregateId of obsoleteAggregateIds) {
    if (deleted.has(aggregateId)) continue;
    deleted.add(aggregateId);
    statements.push(db.prepare(`DELETE FROM numeric_observations WHERE aggregate_id=?`).bind(aggregateId));
  }
  return statements;
}
__name(deleteNumericObservationStatements, "deleteNumericObservationStatements");
function insertNumericObservationStatements(db, record) {
  const statements = [];
  const observedAt = measuredAt(record);
  const indexableFields = new Map(allFields(getForm(record.formKey)).map((field) => [field.key, field]));
  for (const [fieldKey, value] of Object.entries(record.values)) {
    const field = indexableFields.get(fieldKey);
    if (field?.showHistory === false || field?.trendable === false && field.type !== "paired-number") continue;
    if (typeof value === "number" && Number.isFinite(value)) {
      statements.push(db.prepare(`INSERT INTO numeric_observations(aggregate_id,form_key,field_key,plant_date,measured_at,numeric_value,is_published) VALUES(?,?,?,?,?,?,1)`).bind(record.aggregateId, record.formKey, fieldKey, record.date, observedAt, value));
      continue;
    }
    if (typeof value === "object" && value !== null && "first" in value && "second" in value) {
      for (const [part, numericValue] of [["first", value.first], ["second", value.second]]) {
        if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) continue;
        statements.push(db.prepare(`INSERT INTO numeric_observations(aggregate_id,form_key,field_key,plant_date,measured_at,numeric_value,is_published) VALUES(?,?,?,?,?,?,1)`).bind(record.aggregateId, record.formKey, `${fieldKey}:${part}`, record.date, observedAt, numericValue));
      }
    }
  }
  return statements;
}
__name(insertNumericObservationStatements, "insertNumericObservationStatements");
function validateCompletedUpload(input) {
  if (!input || typeof input !== "object") throw new DomainError("invalid_upload", "Completed upload must be an object.", 422);
  const payload = input;
  const record = payload.record;
  if (payload.protocolVersion !== PROTOCOL_VERSION || !record || record.lifecycle !== "completed") throw new DomainError("incompatible", `Canonical sync protocol ${PROTOCOL_VERSION} is required.`, 426);
  const form = getForm(String(record.formKey));
  if (!form || form.schedule === "derived") throw new DomainError("invalid_upload", "Only operator-completed forms may be uploaded.", 422);
  if (typeof record.aggregateId !== "string" || !isCanonicalRecordId(form.key, record.aggregateId)) throw new DomainError("invalid_identity", "aggregateId must be a globally unique form-prefixed canonical ID.", 422);
  if (typeof payload.syncId !== "string" || !payload.syncId.trim()) throw new DomainError("invalid_sync_id", "syncId is required.", 422);
  if (typeof record.operatorId !== "string" || !record.operatorId.trim() || typeof record.operator !== "string" || !record.operator.trim()) throw new DomainError("operator_required", "Select an operator before completing a record.", 422);
  if (typeof record.date !== "string") throw new DomainError("invalid_context", "A valid plant date is required.", 422);
  const generation = generationOf(payload);
  if (!Number.isInteger(generation) || Number(generation) < 1) throw new DomainError("invalid_generation", "generation must be a positive integer.", 422);
  if (payload.baseRevision !== null && payload.baseRevision !== void 0 && (!Number.isInteger(payload.baseRevision) || Number(payload.baseRevision) < 0)) throw new DomainError("invalid_revision", "baseRevision must be a non-negative integer or null.", 422);
  if (typeof payload.clientUpdatedAt !== "string" || !Number.isFinite(Date.parse(payload.clientUpdatedAt))) throw new DomainError("invalid_timestamp", "clientUpdatedAt must be an ISO timestamp.", 422);
  if (payload.movedFromId != null && (typeof payload.movedFromId !== "string" || !isCanonicalRecordId(form.key, payload.movedFromId))) throw new DomainError("invalid_move", "movedFromId must use the same form-prefixed canonical ID namespace.", 422);
  let contextKey;
  try {
    contextKey = normalizeContext(form.key, { date: record.date, shift: record.shift, timeSlot: record.timeSlot, boilerNumber: record.boilerNumber });
  } catch (error) {
    throw new DomainError("invalid_context", error instanceof Error ? error.message : String(error), 422);
  }
  if (record.contextKey != null && record.contextKey !== contextKey) throw new DomainError("invalid_context", "Record context does not match its date and context fields.", 422);
  if (record.aggregateId !== canonicalRecordId(form.key, { date: record.date, shift: record.shift, timeSlot: record.timeSlot, boilerNumber: record.boilerNumber })) throw new DomainError("invalid_identity", "aggregateId must exactly match the selected operational context.", 422);
  const normalized = validateFormValues(form.key, form.version, { date: record.date, shift: record.shift, timeSlot: record.timeSlot, boilerNumber: record.boilerNumber }, record.values);
  if (!Number.isInteger(payload.localVersion) || Number(payload.localVersion) < 1) throw new DomainError("invalid_revision", "localVersion must be a positive revision number.", 422);
  record.contextKey = normalized.contextKey;
  record.values = normalized.values;
  record.generation = Number(generation);
  record.revision = Number(payload.localVersion);
  record.publishedRevision = null;
  return { protocolVersion: PROTOCOL_VERSION, syncId: payload.syncId, record, generation: Number(generation), localVersion: Number(payload.localVersion), baseRevision: payload.baseRevision == null ? null : Number(payload.baseRevision), clientUpdatedAt: new Date(payload.clientUpdatedAt).toISOString(), movedFromId: payload.movedFromId ?? null };
}
__name(validateCompletedUpload, "validateCompletedUpload");
async function saveReceipt(db, result, payload, hash) {
  await db.prepare(`INSERT OR IGNORE INTO canonical_sync_receipts(sync_id,canonical_id,generation,request_hash,outcome,response_json) VALUES(?,?,?,?,?,?)`).bind(payload.syncId, result.aggregateId, Number(payload.generation ?? payload.localVersion), hash, result.outcome, JSON.stringify(result)).run();
}
__name(saveReceipt, "saveReceipt");
async function upsertCompletedRecord(db, input) {
  const payload = validateCompletedUpload(input);
  const record = payload.record;
  const form = getForm(record.formKey);
  const hash = await sha256Hex(stableStringify(payload));
  const priorReceipt = await db.prepare(`SELECT request_hash,response_json FROM canonical_sync_receipts WHERE sync_id=?`).bind(payload.syncId).first();
  if (priorReceipt) {
    if (priorReceipt.request_hash !== hash) throw new DomainError("sync_id_reused", "This sync ID was already used for different contents.", 409);
    const prior = JSON.parse(priorReceipt.response_json);
    return { ...prior, outcome: prior.outcome === "accepted" ? "duplicate" : prior.outcome };
  }
  const oldTombstone = await db.prepare(`SELECT * FROM canonical_record_tombstones WHERE canonical_id=?`).bind(record.aggregateId).first();
  if (oldTombstone && !payload.movedFromId && Number(payload.generation) <= oldTombstone.generation) {
    const result2 = { syncId: payload.syncId, aggregateId: record.aggregateId, outcome: "moved", movedToId: oldTombstone.moved_to_id, record: tombstoneRecord(oldTombstone), message: "This canonical ID was moved; use the destination ID." };
    await saveReceipt(db, result2, payload, hash);
    return result2;
  }
  const current = await db.prepare(`SELECT * FROM canonical_records WHERE canonical_id=?`).bind(record.aggregateId).first();
  const contextOwner = await db.prepare(`SELECT * FROM canonical_records WHERE form_key=? AND context_key=?`).bind(record.formKey, record.contextKey).first();
  const generation = Number(payload.generation ?? payload.localVersion);
  if (contextOwner && contextOwner.canonical_id !== record.aggregateId && !payload.movedFromId) {
    const result2 = { syncId: payload.syncId, aggregateId: record.aggregateId, outcome: "collision", conflict: canonical(contextOwner), message: "Another canonical record already owns this context. Replace it explicitly if intended." };
    await saveReceipt(db, result2, payload, hash);
    return result2;
  }
  if (current) {
    if (generation < Number(current.generation) || generation === Number(current.generation) && Number(payload.localVersion) <= Number(current.revision)) {
      const result2 = { syncId: payload.syncId, aggregateId: record.aggregateId, outcome: "stale", record: canonical(current), message: "An equal or newer revision is already stored." };
      await saveReceipt(db, result2, payload, hash);
      return result2;
    }
    if (payload.baseRevision !== current.revision) {
      const result2 = { syncId: payload.syncId, aggregateId: record.aggregateId, outcome: "conflict", conflict: canonical(current), message: "The canonical record changed before this generation was uploaded." };
      await saveReceipt(db, result2, payload, hash);
      return result2;
    }
  }
  const source = payload.movedFromId ? await db.prepare(`SELECT * FROM canonical_records WHERE canonical_id=?`).bind(payload.movedFromId).first() : null;
  if (payload.movedFromId && !source) {
    const destination = await db.prepare(`SELECT * FROM canonical_records WHERE canonical_id=?`).bind(record.aggregateId).first();
    if (destination) {
      const result2 = { syncId: payload.syncId, aggregateId: record.aggregateId, outcome: "duplicate", record: canonical(destination), message: "The moved destination is already stored." };
      await saveReceipt(db, result2, payload, hash);
      return result2;
    }
    throw new DomainError("move_source_missing", "The source canonical ID no longer exists and the destination is not stored.", 409);
  }
  if (source && payload.baseRevision !== source.revision) {
    const result2 = { syncId: payload.syncId, aggregateId: record.aggregateId, outcome: "conflict", conflict: canonical(source), message: "The source record changed before this move was uploaded." };
    await saveReceipt(db, result2, payload, hash);
    return result2;
  }
  const effectiveGeneration = source ? Number(source.generation) + 1 : generation;
  const nextRevision = source ? 1 : Number(payload.localVersion);
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const createdAt = current?.created_at ?? source?.created_at ?? record.createdAt ?? now;
  const savedRecord = { ...record, revision: nextRevision, generation: effectiveGeneration, publishedRevision: nextRevision, updatedAt: now, createdAt, provenance: { source: "canonical-sync", generation: effectiveGeneration, revision: nextRevision, movedFromId: payload.movedFromId ?? null } };
  const affectedDates = /* @__PURE__ */ new Set([record.date]);
  if (source) affectedDates.add(source.plant_date);
  const result = { syncId: payload.syncId, aggregateId: record.aggregateId, outcome: "accepted", revision: nextRevision, record: savedRecord, affectedDates: [...affectedDates].sort().flatMap((date) => [date, nextCalendarDate(date, 1)]) };
  const statements = [];
  const obsoleteAggregateIds = /* @__PURE__ */ new Set([record.aggregateId]);
  if (source) obsoleteAggregateIds.add(source.canonical_id);
  if (current) obsoleteAggregateIds.add(current.canonical_id);
  statements.push(...deleteNumericObservationStatements(db, obsoleteAggregateIds));
  if (source) statements.push(db.prepare(`INSERT OR REPLACE INTO canonical_record_tombstones(canonical_id,form_key,context_key,moved_to_id,generation,revision) VALUES(?,?,?,?,?,?)`).bind(source.canonical_id, source.form_key, source.context_key, record.aggregateId, source.generation, source.revision), db.prepare(`DELETE FROM canonical_records WHERE canonical_id=?`).bind(source.canonical_id));
  if (oldTombstone) statements.push(db.prepare(`DELETE FROM canonical_record_tombstones WHERE canonical_id=?`).bind(record.aggregateId));
  if (current) statements.push(db.prepare(`DELETE FROM canonical_records WHERE canonical_id=?`).bind(current.canonical_id));
  statements.push(db.prepare(`INSERT INTO canonical_records(canonical_id,form_key,form_version,context_key,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,generation,revision,created_at,updated_at,client_updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(savedRecord.aggregateId, savedRecord.formKey, form.version, savedRecord.contextKey, savedRecord.operatorId, savedRecord.operator, savedRecord.date, savedRecord.shift, savedRecord.timeSlot, savedRecord.boilerNumber, JSON.stringify(savedRecord.values), effectiveGeneration, nextRevision, createdAt, now, payload.clientUpdatedAt));
  statements.push(...insertNumericObservationStatements(db, savedRecord));
  for (const date of affectedDates) {
    statements.push(db.prepare(`INSERT INTO backup_dirty_dates(plant_date,reason) VALUES(?,?) ON CONFLICT(plant_date) DO UPDATE SET reason=excluded.reason,last_dirty_at=CURRENT_TIMESTAMP`).bind(date, `Canonical ${form.key} revision changed`));
    if (form.key === "integrator-readings") statements.push(db.prepare(`UPDATE derived_projections SET status='stale',updated_at=CURRENT_TIMESTAMP WHERE plant_date=?`).bind(date));
  }
  statements.push(db.prepare(`UPDATE app_metadata SET value='false',updated_at=CURRENT_TIMESTAMP WHERE key='fresh_database'`), db.prepare(`INSERT INTO canonical_sync_receipts(sync_id,canonical_id,generation,request_hash,outcome,response_json) VALUES(?,?,?,?,?,?)`).bind(payload.syncId, savedRecord.aggregateId, generation, hash, result.outcome, JSON.stringify(result)));
  await db.batch(statements);
  return result;
}
__name(upsertCompletedRecord, "upsertCompletedRecord");
async function listLatestCompleted(db, formKey, date) {
  const args = [];
  const clauses = [];
  if (formKey) {
    clauses.push("form_key=?");
    args.push(formKey);
  }
  if (date) {
    clauses.push("plant_date=?");
    args.push(date);
  }
  const result = await db.prepare(`SELECT * FROM canonical_records ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""} ORDER BY plant_date DESC,COALESCE(time_slot,''),COALESCE(shift,''),COALESCE(boiler_number,0),canonical_id LIMIT 500`).bind(...args).all();
  return (result.results ?? []).map(canonical);
}
__name(listLatestCompleted, "listLatestCompleted");
async function getLatestCompleted(db, aggregateId) {
  const row = await db.prepare(`SELECT * FROM canonical_records WHERE canonical_id=?`).bind(aggregateId).first();
  return row ? canonical(row) : null;
}
__name(getLatestCompleted, "getLatestCompleted");

// worker/workflow.ts
import { WorkflowEntrypoint } from "cloudflare:workers";
var BackupWorkflow = class extends WorkflowEntrypoint {
  static {
    __name(this, "BackupWorkflow");
  }
  async run(event, step) {
    const dates = await step.do("select backup dates", async () => {
      if (event.payload?.plantDate) return [event.payload.plantDate];
      const scheduledNow = event.payload?.scheduledAt ? new Date(event.payload.scheduledAt) : event.schedule ? new Date(event.schedule.scheduledTime) : event.timestamp;
      const daily = previousTorontoDate(scheduledNow);
      const dirty = await dirtyDates(this.env.DB, daily);
      return [.../* @__PURE__ */ new Set([daily, ...dirty])].slice(0, 30);
    });
    const results = [];
    for (const plantDate of dates) {
      await step.do(`refresh derived ${plantDate}`, { retries: { limit: 3, delay: "5 seconds", backoff: "linear" }, timeout: "2 minutes" }, async () => {
        const previousDate = nextCalendarDate(plantDate, -1);
        const relevant = await this.env.DB.prepare(`SELECT
          EXISTS(SELECT 1 FROM canonical_records WHERE form_key='integrator-readings' AND plant_date IN (?,?)) AS has_integrator,
          EXISTS(SELECT 1 FROM derived_projections WHERE plant_date=?) AS has_projection`).bind(plantDate, previousDate, plantDate).first();
        if (!Number(relevant?.has_integrator ?? 0) && !Number(relevant?.has_projection ?? 0)) return { skipped: true };
        return recomputeDerivedDate(this.env.DB, plantDate);
      });
      const built = await step.do(`build ${plantDate}`, { retries: { limit: 3, delay: "5 seconds", backoff: "linear" }, timeout: "2 minutes" }, async () => {
        const result = await buildBackupGeneration(this.env.DB, plantDate);
        if (result.generation?.generation_id) {
          await this.env.DB.prepare(`UPDATE backup_generations SET workflow_instance_id=? WHERE generation_id=?`).bind(event.instanceId, result.generation.generation_id).run();
        }
        return result;
      });
      if (!built.ready || !built.generation) {
        results.push({ plantDate, status: "not_ready", reason: built.reason ?? "Generation not ready" });
        continue;
      }
      if (built.generation.status === "verified") {
        results.push({ plantDate, generationId: built.generation.generation_id, status: "verified_already" });
        continue;
      }
      if (built.generation.status === "failed" && !event.payload?.plantDate) {
        results.push({ plantDate, generationId: built.generation.generation_id, status: "permanent_failure_requires_manual_retry" });
        continue;
      }
      const delivered = await step.do(`deliver ${plantDate} generation ${built.generation.generation_number}`, {
        retries: { limit: 5, delay: "30 seconds", backoff: "exponential" },
        timeout: "10 minutes"
      }, async () => {
        const result = await deliverBackupGeneration(this.env, built.generation.generation_id);
        return { outcome: result.outcome, message: result.message };
      });
      results.push({ plantDate, generationId: built.generation.generation_id, status: delivered.outcome, message: delivered.message });
    }
    return { instanceId: event.instanceId, dates, results };
  }
};

// worker/index.ts
function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}
__name(json, "json");
function fail(message, status, code = "error", details) {
  return json({ error: { code, message, details } }, { status });
}
__name(fail, "fail");
function isLocal(request) {
  const h = new URL(request.url).hostname;
  return h === "localhost" || h === "127.0.0.1";
}
__name(isLocal, "isLocal");
function authorized(request, env) {
  if (!env.DEVICE_TOKEN) return isLocal(request);
  return request.headers.get("X-ECC-Device-Token") === env.DEVICE_TOKEN;
}
__name(authorized, "authorized");
function requireAuth(request, env) {
  if (!authorized(request, env)) throw new DomainError("forbidden", env.DEVICE_TOKEN ? "This tablet is not authorized." : "DEVICE_TOKEN is not configured.", env.DEVICE_TOKEN ? 403 : 503);
}
__name(requireAuth, "requireAuth");
async function readJson(request) {
  const type = request.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) throw new DomainError("content_type", "application/json is required.", 415);
  return request.json();
}
__name(readJson, "readJson");
async function listOperators(db) {
  const result = await db.prepare(`SELECT id,name,active,created_at,updated_at FROM operators ORDER BY active DESC,name`).all();
  return (result.results ?? []).map((r) => ({ id: r.id, name: r.name, active: Boolean(r.active), createdAt: r.created_at, updatedAt: r.updated_at }));
}
__name(listOperators, "listOperators");
async function listRecords(db, url) {
  const formKey = url.searchParams.get("formKey");
  const plantDate = url.searchParams.get("date");
  const form = formKey ? getForm(formKey) : null;
  if (form?.schedule === "derived") {
    const args = [formKey];
    let sql = `SELECT * FROM derived_projections WHERE form_key=?`;
    if (plantDate) {
      sql += ` AND plant_date=?`;
      args.push(plantDate);
    }
    sql += ` ORDER BY plant_date DESC LIMIT 200`;
    const res = await db.prepare(sql).bind(...args).all();
    return (res.results ?? []).map((r) => ({
      aggregateId: r.projection_id,
      formKey: r.form_key,
      contextKey: r.plant_date,
      revision: Number(r.revision),
      publishedRevision: Number(r.revision),
      lifecycle: r.status === "current" ? "completed" : "draft",
      operatorId: null,
      operator: "System",
      date: r.plant_date,
      shift: null,
      timeSlot: null,
      boilerNumber: null,
      values: JSON.parse(r.effective_values_json),
      provenance: { status: r.status, sourceRevisions: JSON.parse(r.source_revisions_json), warnings: JSON.parse(r.warnings_json) },
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }
  return listLatestCompleted(db, formKey ?? void 0, plantDate ?? void 0);
}
__name(listRecords, "listRecords");
function projectionRecord(row) {
  return {
    aggregateId: row.projection_id,
    formKey: row.form_key,
    contextKey: row.plant_date,
    revision: Number(row.revision),
    publishedRevision: Number(row.revision),
    lifecycle: row.status === "current" ? "completed" : "draft",
    operatorId: null,
    operator: "System",
    date: row.plant_date,
    shift: null,
    timeSlot: null,
    boilerNumber: null,
    values: JSON.parse(row.effective_values_json),
    provenance: { status: row.status, sourceRevisions: JSON.parse(row.source_revisions_json), warnings: JSON.parse(row.warnings_json) },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
__name(projectionRecord, "projectionRecord");
async function listPublicRecords(db, url) {
  const formKey = url.searchParams.get("formKey");
  if (!formKey || !getForm(formKey)) throw new DomainError("unknown_form", "A valid formKey is required.");
  return (await listRecords(db, url)).filter((record) => record.lifecycle === "completed");
}
__name(listPublicRecords, "listPublicRecords");
async function getPublicRecord(db, aggregateId) {
  const projection = await db.prepare(`SELECT * FROM derived_projections WHERE projection_id=? AND status='current'`).bind(aggregateId).first();
  if (projection) return projectionRecord(projection);
  const record = await getLatestCompleted(db, aggregateId);
  return record?.lifecycle === "completed" ? record : null;
}
__name(getPublicRecord, "getPublicRecord");
async function trend(db, url) {
  const formKey = url.searchParams.get("formKey");
  const fieldKey = url.searchParams.get("fieldKey");
  const before = url.searchParams.get("before");
  const limit = Math.min(365, Math.max(1, Number(url.searchParams.get("limit") ?? 5)));
  if (!formKey || !fieldKey) throw new DomainError("trend_args", "formKey and fieldKey are required.");
  const form = getForm(formKey);
  if (!form) throw new DomainError("unknown_form", "Unknown form.");
  if (form.schedule === "derived") {
    const args = [formKey, fieldKey];
    let sql = `SELECT projection_id AS aggregate_id,plant_date,measured_at,numeric_value FROM derived_numeric_observations WHERE form_key=? AND field_key=? AND is_current=1`;
    if (before) {
      sql += ` AND measured_at<?`;
      args.push(before);
    }
    sql += ` ORDER BY measured_at DESC LIMIT ?`;
    args.push(limit);
    const res = await db.prepare(sql).bind(...args).all();
    return res.results ?? [];
  }
  const records = await listLatestCompleted(db, formKey);
  return records.map((record) => {
    const value = record.values[fieldKey];
    const measuredAt2 = record.timeSlot ? `${record.date}T${record.timeSlot}:00` : shiftMeasuredAt(record.date, record.shift);
    return { aggregate_id: record.aggregateId, plant_date: record.date, measured_at: measuredAt2, numeric_value: value };
  }).filter((point) => typeof point.numeric_value === "number" && Number.isFinite(point.numeric_value) && (!before || point.measured_at < before)).sort((a, b) => b.measured_at.localeCompare(a.measured_at)).slice(0, limit);
}
__name(trend, "trend");
function csvEscape(value) {
  const s = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
__name(csvEscape, "csvEscape");
async function exportCsv(db, formKey) {
  const form = getForm(formKey);
  if (!form) throw new DomainError("unknown_form", "Unknown form.");
  const url = new URL(`https://local/api/records?formKey=${encodeURIComponent(formKey)}`);
  const records = await listRecords(db, url);
  let sources = { form9Oat: [], form5Projections: [] };
  if (formKey === "gas-turbine-log-sheet" || formKey === "boiler-water-control-tests") {
    const [oatResult, form5Result] = await db.batch([
      db.prepare(`SELECT plant_date,time_slot,values_json FROM canonical_records WHERE form_key='gas-turbine-log-sheet' ORDER BY plant_date,time_slot,canonical_id`),
      db.prepare(`SELECT plant_date,status,effective_values_json FROM derived_projections WHERE form_key='daily-consumption-totals' ORDER BY plant_date`)
    ]);
    sources = {
      form9Oat: (oatResult.results ?? []).map((row) => ({
        date: String(row.plant_date),
        timeSlot: row.time_slot ?? null,
        values: JSON.parse(row.values_json),
        status: "completed",
        lifecycle: "completed"
      })),
      form5Projections: (form5Result.results ?? []).map((row) => ({
        plantDate: String(row.plant_date),
        status: String(row.status),
        values: JSON.parse(row.effective_values_json)
      }))
    };
  }
  const fields = allFields(form).map((f) => f.key);
  const headers = ["aggregateId", "revision", "date", "timeSlot", "shift", "boilerNumber", "operator", "status", ...fields];
  const lines = [headers.join(",")];
  for (const r of records) {
    const values = materializeExportValues(formKey, r.date, r.shift, r.values, sources);
    lines.push(headers.map((h) => csvEscape(h in r ? r[h] : values[h])).join(","));
  }
  return new Response(lines.join("\r\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${formKey}.csv"` } });
}
__name(exportCsv, "exportCsv");
async function aiExtract(request, env) {
  if (!env.OPENAI_API_KEY) throw new DomainError("ai_not_configured", "OPENAI_API_KEY is not configured.", 503);
  const body = await readJson(request);
  if (!body.imageBase64 || body.imageBase64.length > 9e6) throw new DomainError("image_invalid", "A compressed image under approximately 6 MB is required.");
  const prompt = buildAiCapturePrompt();
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify({ model: env.OPENAI_MODEL || "gpt-5.6-luna", store: false, reasoning: { effort: "low" }, input: [{ role: "user", content: [{ type: "input_text", text: prompt }, { type: "input_image", image_url: `data:${body.mimeType ?? "image/jpeg"};base64,${body.imageBase64}`, detail: "high" }] }], text: { format: { type: "json_object" } } }) });
  const raw = await response.json().catch(() => null);
  if (!response.ok) throw new DomainError("ai_error", `Gemini returned HTTP ${response.status}.`, 502, raw);
  const text = raw?.output_text ?? raw?.output?.flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("") ?? "{}";
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new DomainError("ai_parse", "OpenAI did not return valid JSON.", 502);
  }
  return normalizeAiCaptureResponse(parsed);
}
__name(aiExtract, "aiExtract");
async function api(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (url.pathname === "/api/meta" && request.method === "GET") return json({ protocolVersion: PROTOCOL_VERSION, schemaVersion: APP_SCHEMA_VERSION, serverTime: (/* @__PURE__ */ new Date()).toISOString(), plantTimeZone: env.PLANT_TIME_ZONE, backupContractVersion: "ecc-backup-v2" });
  if (url.pathname === "/api/public/records" && request.method === "GET") return json({ records: await listPublicRecords(env.DB, url) });
  const publicRecordMatch = url.pathname.match(/^\/api\/public\/records\/([^/]+)$/);
  if (publicRecordMatch && request.method === "GET") {
    const record = await getPublicRecord(env.DB, decodeURIComponent(publicRecordMatch[1]));
    if (!record) throw new DomainError("record_missing", "Record not found.", 404);
    return json({ record });
  }
  if (url.pathname === "/api/public/trend" && request.method === "GET") return json({ points: await trend(env.DB, url) });
  requireAuth(request, env);
  if (url.pathname === "/api/operators" && request.method === "GET") return json({ operators: await listOperators(env.DB) });
  if (url.pathname === "/api/operators" && request.method === "POST") {
    const body = await readJson(request);
    const name = String(body.name ?? "").trim();
    if (!name) throw new DomainError("operator_name", "Operator name is required.");
    const id = `operator-${crypto.randomUUID()}`;
    await env.DB.prepare(`INSERT INTO operators(id,name) VALUES(?,?)`).bind(id, name).run();
    return json({ operator: { id, name, active: true, createdAt: (/* @__PURE__ */ new Date()).toISOString(), updatedAt: (/* @__PURE__ */ new Date()).toISOString() } }, { status: 201 });
  }
  if (url.pathname.startsWith("/api/operators/") && request.method === "PATCH") {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const body = await readJson(request);
    const existing = await env.DB.prepare(`SELECT * FROM operators WHERE id=?`).bind(id).first();
    if (!existing) throw new DomainError("operator_missing", "Operator not found.", 404);
    const name = body.name === void 0 ? existing.name : String(body.name).trim();
    const active = body.active === void 0 ? Number(existing.active) : body.active ? 1 : 0;
    await env.DB.prepare(`UPDATE operators SET name=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(name, active, id).run();
    return json({ operator: { id, name, active: Boolean(active), createdAt: existing.created_at, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } });
  }
  if (url.pathname === "/api/completed" && request.method === "POST") {
    const payload = await readJson(request);
    const result = await upsertCompletedRecord(env.DB, payload);
    if (result.outcome === "accepted" && (result.record?.formKey === "integrator-readings" || result.record?.formKey === "gas-turbine-log-sheet")) {
      const dates = new Set(result.affectedDates ?? [result.record.date, nextCalendarDate(result.record.date, 1)]);
      ctx.waitUntil((async () => {
        for (const date of dates) {
          try {
            await recomputeDerivedDate(env.DB, date);
          } catch (error) {
            console.error("Local-first projection refresh failed", date, error);
            await openAttention(env.DB, { plantDate: date, category: "derivation", code: "projection_refresh_failed", severity: "error", message: "Form 5/Form 6 recalculation failed after a completed Form 8 or Form 9 upload.", details: { error: String(error) } }).catch(() => void 0);
          }
        }
      })());
    }
    return json(result);
  }
  if (url.pathname === "/api/records" && request.method === "GET") return json({ records: await listRecords(env.DB, url) });
  if (url.pathname.startsWith("/api/records/") && request.method === "GET") {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const projection = await env.DB.prepare(`SELECT * FROM derived_projections WHERE projection_id=?`).bind(id).first();
    if (projection) return json({ current: projectionRecord(projection), published: null });
    const localCurrent = await getLatestCompleted(env.DB, id);
    if (localCurrent) return json({ current: localCurrent, published: localCurrent });
    throw new DomainError("record_missing", "Record not found.", 404);
  }
  if (url.pathname === "/api/trend" && request.method === "GET") return json({ points: await trend(env.DB, url) });
  if (url.pathname === "/api/history-batch" && request.method === "GET") {
    const formKey = url.searchParams.get("formKey");
    if (!formKey) throw new DomainError("history_args", "formKey is required.");
    const form = getForm(formKey);
    if (!form) throw new DomainError("unknown_form", "Unknown form.");
    const observationSource = form.schedule === "derived" ? `SELECT field_key,projection_id AS aggregate_id,plant_date,measured_at,numeric_value FROM derived_numeric_observations WHERE form_key=? AND is_current=1` : `SELECT field_key,aggregate_id,plant_date,measured_at,numeric_value FROM numeric_observations WHERE form_key=? AND is_published=1`;
    const res = await env.DB.prepare(`SELECT field_key,aggregate_id,plant_date,measured_at,numeric_value FROM (SELECT field_key,aggregate_id,plant_date,measured_at,numeric_value,ROW_NUMBER() OVER(PARTITION BY field_key ORDER BY measured_at DESC) rn FROM (${observationSource})) WHERE rn<=5 ORDER BY field_key,measured_at DESC`).bind(formKey).all();
    const history = {};
    for (const row of res.results ?? []) (history[row.field_key] ??= []).push(row);
    return json({ history });
  }
  if (url.pathname === "/api/attention" && request.method === "GET") {
    const res = await env.DB.prepare(`SELECT * FROM attention_items WHERE resolved_at IS NULL ORDER BY CASE severity WHEN 'error' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,created_at DESC LIMIT 200`).all();
    return json({ items: res.results ?? [] });
  }
  if (url.pathname === "/api/backups/status" && request.method === "GET") return json({ generations: await backupStatus(env.DB, url.searchParams.get("date") ?? void 0) });
  if (url.pathname === "/api/backups/run" && request.method === "POST") {
    const body = await readJson(request);
    const plantDate = body.plantDate ?? previousTorontoDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(plantDate)) throw new DomainError("backup_date", "plantDate must be YYYY-MM-DD.");
    const instance = await env.BACKUP_WORKFLOW.create({ id: `backup-${plantDate}-${crypto.randomUUID().slice(0, 8)}`, params: { plantDate, reason: "manual" }, retention: { successRetention: "7 days", errorRetention: "30 days" } });
    return json({ accepted: true, plantDate, workflowInstanceId: instance.id, status: await instance.status() }, { status: 202 });
  }
  if (url.pathname.startsWith("/api/backups/workflow/") && request.method === "GET") {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const instance = await env.BACKUP_WORKFLOW.get(id);
    return json(await instance.status());
  }
  if (url.pathname === "/api/ai/extract" && request.method === "POST") return json(await aiExtract(request, env));
  if (url.pathname === "/api/export" && request.method === "GET") {
    const formKey = url.searchParams.get("formKey");
    if (!formKey) throw new DomainError("export_args", "formKey is required.");
    return exportCsv(env.DB, formKey);
  }
  return fail("API route not found.", 404, "not_found");
}
__name(api, "api");
var index_default = {
  async fetch(request, env, ctx) {
    try {
      if (new URL(request.url).pathname.startsWith("/api/")) return await api(request, env, ctx);
      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof DomainError) return fail(error.message, error.status, error.code, error.details);
      console.error(error);
      return fail("Unexpected server error.", 500, "server_error", String(error));
    }
  },
  async scheduled(controller, env) {
    const scheduledAt = new Date(controller.scheduledTime).toISOString();
    const instance = await env.BACKUP_WORKFLOW.create({
      id: `backup-cron-${controller.scheduledTime}`,
      params: { reason: "scheduled", scheduledAt },
      retention: { successRetention: "7 days", errorRetention: "30 days" }
    });
    console.log("Scheduled backup workflow created", instance.id, scheduledAt);
  }
};
export {
  BackupWorkflow,
  index_default as default
};
//# sourceMappingURL=index.js.map
