import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const remote = process.argv.includes("--remote");
const sourceStart = new Date(Date.UTC(2025, 11, 26));
const sourceDays = 15;
const percentages = [18, 21, 14, 26, 12, 23, 17, 20, 15, 25, 11, 22, 16, 19];
const operators = [
  ["operator-richard", "Richard"],
  ["operator-marj", "Marj"],
  ["operator-justin", "Justin"],
  ["operator-kyle", "Kyle"],
];

function dateFor(index) {
  const date = new Date(sourceStart);
  date.setUTCDate(date.getUTCDate() + index);
  return date.toISOString().slice(0, 10);
}

function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function json(value) {
  return sql(JSON.stringify(value));
}

function recordValues(index, state) {
  const steam2 = 4700 + (index * 18) + ((index % 3) * 35);
  const steam3Delta = 950 + ((index % 4) * 25);
  const steam4Delta = 760 + ((index % 3) * 20);
  const gas3Delta = 11200 + (index * 140);
  const gas4Delta = 8200 + (index * 110);

  state.steam3 += steam3Delta;
  state.steam4 += steam4Delta;
  state.gas3 += gas3Delta;
  state.gas4 += gas4Delta;

  const totalSteam = index === 0 ? null : steam2 + steam3Delta + steam4Delta;
  const makeupPercent = index === 0 ? null : percentages[index - 1];
  const makeupDelta = totalSteam == null ? 0 : (totalSteam * makeupPercent) / 1000;
  state.hotwell += makeupDelta;
  state.cw += 38 + (index * 2);
  state.tower += 66 + (index * 3);

  return {
    oat_high: 23 + ((index % 5) * 2),
    oat_low: 7 + ((index % 4) * 2),
    steam_boiler2: steam2,
    steam_boiler3: state.steam3,
    steam_boiler4: state.steam4,
    gas_boiler2: 3900 + (index * 16),
    gas_boiler3: state.gas3,
    gas_boiler4: state.gas4,
    hotwell_makeup: Number(state.hotwell.toFixed(1)),
    cw_makeup: Number(state.cw.toFixed(1)),
    tower_makeup: Number(state.tower.toFixed(1)),
    utility_kwh: 240000 + (index * 1450),
  };
}

function projectionValues(index, values, previous) {
  const steam3 = values.steam_boiler3 - previous.steam_boiler3;
  const steam4 = values.steam_boiler4 - previous.steam_boiler4;
  const gas3 = values.gas_boiler3 - previous.gas_boiler3;
  const gas4 = values.gas_boiler4 - previous.gas_boiler4;
  const makeup = values.hotwell_makeup - previous.hotwell_makeup;
  const totalSteam = values.steam_boiler2 + steam3 + steam4;
  return {
    oat_high: values.oat_high,
    oat_low: values.oat_low,
    boiler2_gas_used: values.gas_boiler2,
    boiler2_steam_used: values.steam_boiler2,
    boiler3_gas_used: gas3,
    boiler3_steam_used: steam3,
    boiler3_lbs_steam_per_cuft_gas: steam3 / gas3,
    boiler4_gas_used: gas4,
    boiler4_steam_used: steam4,
    boiler4_lbs_steam_per_cuft_gas: steam4 / gas4,
    total_steam: totalSteam,
    average_flow_hr: totalSteam / 24,
    makeup_water_gallon: Number(makeup.toFixed(1)),
    makeup_percent: Number(((makeup / totalSteam) * 1000).toFixed(1)),
  };
}

const state = { steam3: 18000, steam4: 26000, gas3: 90000, gas4: 130000, hotwell: 50000, cw: 20000, tower: 30000 };
const sourceRows = [];
for (let index = 0; index < sourceDays; index += 1) {
  sourceRows.push({ date: dateFor(index), values: recordValues(index, state) });
}

const statements = ["PRAGMA foreign_keys = ON;"];
for (let index = 0; index < sourceRows.length; index += 1) {
  const row = sourceRows[index];
  const [operatorId, operatorName] = operators[index % operators.length];
  const aggregateId = `demo-integrator-${row.date}`;
  const timestamp = `${row.date}T23:50:00.000Z`;
  statements.push(`INSERT OR IGNORE INTO latest_completed_records(aggregate_id,form_key,form_version,context_key,operator_id,operator_name,plant_date,shift,time_slot,boiler_number,values_json,local_revision,created_at,updated_at,client_updated_at,freshness_tiebreaker) VALUES(${sql(aggregateId)},'integrator-readings',2,${sql(row.date)},${sql(operatorId)},${sql(operatorName)},${sql(row.date)},NULL,NULL,NULL,${json(row.values)},1,${sql(timestamp)},${sql(timestamp)},${sql(timestamp)},${sql(aggregateId)});`);
}

for (let index = 1; index < sourceRows.length; index += 1) {
  const row = sourceRows[index];
  const previous = sourceRows[index - 1];
  const form5Id = `demo-form5-${row.date}`;
  const form6Id = `demo-form6-${row.date}`;
  const form5 = projectionValues(index, row.values, previous.values);
  const form6 = {
    cw_makeup_current: row.values.cw_makeup,
    cw_makeup_used: Number((row.values.cw_makeup - previous.values.cw_makeup).toFixed(1)),
    tower_makeup_current: row.values.tower_makeup,
  };
  const refs = [previous, row].map((source) => ({
    aggregateId: `demo-integrator-${source.date}`,
    revisionId: `demo-integrator-${source.date}-r1`,
    revision: 1,
    plantDate: source.date,
  }));
  const projectionTimestamp = `${row.date}T23:59:00.000Z`;

  statements.push(`INSERT OR IGNORE INTO derived_projections(projection_id,form_key,plant_date,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json,created_at,updated_at) VALUES(${sql(form5Id)},'daily-consumption-totals',${sql(row.date)},1,'current',1,${json(refs)},${json(form5)},${json(form5)},'[]',${sql(projectionTimestamp)},${sql(projectionTimestamp)});`);
  statements.push(`INSERT OR IGNORE INTO derived_projections(projection_id,form_key,plant_date,revision,status,formula_version,source_revisions_json,base_values_json,effective_values_json,warnings_json,created_at,updated_at) VALUES(${sql(form6Id)},'makeup',${sql(row.date)},1,'current',1,${json(refs)},${json(form6)},${json(form6)},'[]',${sql(projectionTimestamp)},${sql(projectionTimestamp)});`);

  for (const [fieldKey, value] of Object.entries(form5)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    statements.push(`INSERT OR IGNORE INTO derived_numeric_observations(projection_id,projection_revision,form_key,field_key,plant_date,measured_at,numeric_value,is_current) VALUES(${sql(form5Id)},1,'daily-consumption-totals',${sql(fieldKey)},${sql(row.date)},${sql(projectionTimestamp)},${value},1);`);
  }
  for (const [fieldKey, value] of Object.entries(form6)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    statements.push(`INSERT OR IGNORE INTO derived_numeric_observations(projection_id,projection_revision,form_key,field_key,plant_date,measured_at,numeric_value,is_current) VALUES(${sql(form6Id)},1,'makeup',${sql(fieldKey)},${sql(row.date)},${sql(projectionTimestamp)},${value},1);`);
  }
}

const tempRoot = mkdtempSync(join(tmpdir(), "ecc-demo-seed-"));
const sqlPath = join(tempRoot, "seed-demo.sql");
writeFileSync(sqlPath, `${statements.join("\n")}\n`, "utf8");

try {
  const wranglerPath = join(root, "node_modules", "wrangler", "bin", "wrangler.js");
  const wranglerArgs = ["d1", "execute", "DB", remote ? "--remote" : "--local", "--file", sqlPath];
  execFileSync(process.execPath, [wranglerPath, ...wranglerArgs], { cwd: root, stdio: "inherit", shell: false });
  console.log(`Demo seed applied to ${remote ? "remote" : "local"} D1.`);
  console.log("Visible derived data: 2025-12-27 through 2026-01-09 (14 days). The 2025-12-26 Form 8 row supplies the first baseline.");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
