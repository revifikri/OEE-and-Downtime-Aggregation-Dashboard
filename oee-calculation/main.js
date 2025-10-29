const fs = require("fs");
const dayjs = require("dayjs");
const express = require("express");
const chalk = require("chalk");

const statusRaw = JSON.parse(fs.readFileSync("status.json", "utf-8"));
const productionRaw = JSON.parse(fs.readFileSync("production.json", "utf-8"));

// --- Parse / normalize ---
function parseStatus(records) {
  return records.map(r => ({
    equipment: r.equipment_id,
    status: r.status, // RUNNING/IDLE/DOWN/OFFLINE
    start: dayjs(r.start_time, "YYYY/MM/DD HH:mm:ss"),
    end: dayjs(r.end_time, "YYYY/MM/DD HH:mm:ss"),
  }));
}
function parseProduction(records) {
  return records.map(r => ({
    equipment: r.equipment_id,
    planned_duration: Number(r.planned_duration_in_second || 0), 
    planned_quantity: Number(r.planned_quantity || 0),
    start: dayjs(r.start_production, "YYYY/MM/DD HH:mm:ss"),
    end: dayjs(r.finish_production, "YYYY/MM/DD HH:mm:ss"),
    actual_quantity: Number(r.actual_quantity || 0),
    defect_quantity: Number(r.defect_quantity || 0)
  }));
}

const statuses = parseStatus(statusRaw);
const productions = parseProduction(productionRaw);

// Split interval by day 
function splitIntervalByDay(start, end) {
  const result = [];
  let s = start;
  while (s.isBefore(end)) {
    const dayEnd = s.endOf('day');
    const chunkEnd = end.isBefore(dayEnd) ? end : dayEnd;
    result.push({ start: s, end: chunkEnd, date: s.format('YYYY-MM-DD') });
    s = chunkEnd.add(1, 'second');
  }
  return result;
}

// Slice statuses inside a given window
function sliceStatusesInsideWindow(equipment, windowStart, windowEnd) {
  const relevant = statuses.filter(s => s.equipment === equipment && s.end.isAfter(windowStart) && s.start.isBefore(windowEnd));
  return relevant.map(s => {
    const sStart = s.start.isBefore(windowStart) ? windowStart : s.start;
    const sEnd = s.end.isAfter(windowEnd) ? windowEnd : s.end;
    return { status: s.status, start: sStart, end: sEnd };
  });
}
function computeRunningIdleDownForWindow(equipment, windowStart, windowEnd) {
  const slices = sliceStatusesInsideWindow(equipment, windowStart, windowEnd);
  let running = 0, idle = 0, down = 0;
  slices.forEach(s => {
    // inclusive seconds
    const durSec = s.end.diff(s.start, 'second') + 1;
    if (s.status === 'RUNNING') running += durSec;
    else if (s.status === 'IDLE') idle += durSec;
    else if (s.status === 'DOWN') down += durSec;
    // OFFLINE ignored from production time (treated as neither running/idle/down)
  });
  return { running, idle, down };
}

// Main processing logic
const perDayResultsFlat = []; // array of equipment, date, running, etc

productions.forEach(prod => {
  // ignore records with invalid times
  if (!prod.start.isValid() || !prod.end.isValid() || prod.end.isBefore(prod.start)) return;

  const totalProdDurationSec = prod.end.diff(prod.start, 'second') + 1;
  if (totalProdDurationSec <= 0) return;

  const chunks = splitIntervalByDay(prod.start, prod.end);

  chunks.forEach(chunk => {
    const chunkDurationSec = chunk.end.diff(chunk.start, 'second') + 1;
    const proportion = chunkDurationSec / totalProdDurationSec;

    // allocate planned/actual durations and quantities proportionally
    const plannedDurForChunk = prod.planned_duration * proportion;
    const actualDurForChunk = totalProdDurationSec * proportion; // actual duration is the real time spent in this chunk
    const plannedQtyForChunk = prod.planned_quantity * proportion;
    const actualQtyForChunk = prod.actual_quantity * proportion;
    const defectForChunk = prod.defect_quantity * proportion;

    const durations = computeRunningIdleDownForWindow(prod.equipment, chunk.start, chunk.end);
    const totalTime = durations.running + durations.idle + durations.down;

    perDayResultsFlat.push({
      equipment: prod.equipment,
      date: chunk.date,
      running: durations.running,
      idle: durations.idle,
      down: durations.down,
      totalTime,
      planned_duration: plannedDurForChunk,
      actual_duration: actualDurForChunk,
      planned_qty: plannedQtyForChunk,
      actual_qty: actualQtyForChunk,
      defect_qty: defectForChunk
    });
  });
});

// Aggregate per equipment per day 
const dailyMap = {}; // key: equipment_date
perDayResultsFlat.forEach(r => {
  const key = `${r.equipment}_${r.date}`;
  if (!dailyMap[key]) dailyMap[key] = {
    equipment: r.equipment,
    date: r.date,
    running: 0, idle: 0, down: 0, totalTime: 0,
    sumPlannedDur: 0, sumPlannedQty: 0, sumActualDur: 0, sumActualQty: 0, sumDefects: 0
  };
  const g = dailyMap[key];
  g.running += r.running;
  g.idle += r.idle;
  g.down += r.down;
  g.totalTime += r.totalTime;
  g.sumPlannedDur += r.planned_duration;
  g.sumPlannedQty += r.planned_qty;
  g.sumActualDur += r.actual_duration;
  g.sumActualQty += r.actual_qty;
  g.sumDefects += r.defect_qty;
});

// Calculate A, P, Q, OEE per day
Object.values(dailyMap).forEach(g => {
  g.A = g.totalTime > 0 ? (g.running + g.idle) / g.totalTime : null;

  // Performance: IdealCycleTime = sumPlannedDur / sumPlannedQty
  // ActualCycleTime = sumActualDur / sumActualQty
  if (g.sumPlannedQty > 0 && g.sumActualQty > 0) {
    const idealCycle = g.sumPlannedDur / g.sumPlannedQty;
    const actualCycle = g.sumActualDur / g.sumActualQty;
    g.P = (actualCycle > 0) ? (idealCycle / actualCycle) : null;
  } else {
    g.P = null;
  }

  g.Q = (g.sumActualQty > 0) ? ((g.sumActualQty - g.sumDefects) / g.sumActualQty) : null;
  g.OEE = (g.A !== null && g.P !== null && g.Q !== null) ? g.A * g.P * g.Q : null;
});

// Equipment averages 
const equipMap = {};
Object.values(dailyMap).forEach(d => {
  if (!equipMap[d.equipment]) equipMap[d.equipment] = [];
  equipMap[d.equipment].push(d);
});

const equipAverages = [];
Object.entries(equipMap).forEach(([equip, days]) => {
  // Only include days that have production for each metric separately
  const As = days.map(x => x.A).filter(v => v !== null);
  const Ps = days.map(x => x.P).filter(v => v !== null);
  const Qs = days.map(x => x.Q).filter(v => v !== null);

  if (As.length === 0 && Ps.length === 0 && Qs.length === 0) return; // no production at all

  const avgA = As.length > 0 ? As.reduce((a,b) => a+b, 0) / As.length : null;
  const avgP = Ps.length > 0 ? Ps.reduce((a,b) => a+b, 0) / Ps.length : null;
  const avgQ = Qs.length > 0 ? Qs.reduce((a,b) => a+b, 0) / Qs.length : null;
  const oee = (avgA !== null && avgP !== null && avgQ !== null) ? avgA * avgP * avgQ : null;

  equipAverages.push({
    equipment: Number(equip),
    avgA, avgP, avgQ, oee,
    category: oee !== null ? oeeCategory(oee) : 'No Data'
  });
});

// Overall averages across all equipment
const overall = { A: null, P: null, Q: null, OEE: null, category: null };
if (equipAverages.length > 0) {
  const As = equipAverages.map(e => e.avgA).filter(v => v !== null);
  const Ps = equipAverages.map(e => e.avgP).filter(v => v !== null);
  const Qs = equipAverages.map(e => e.avgQ).filter(v => v !== null);
  overall.A = As.length ? As.reduce((a,b) => a+b,0)/As.length : null;
  overall.P = Ps.length ? Ps.reduce((a,b) => a+b,0)/Ps.length : null;
  overall.Q = Qs.length ? Qs.reduce((a,b) => a+b,0)/Qs.length : null;
  overall.OEE = (overall.A !== null && overall.P !== null && overall.Q !== null) ? overall.A*overall.P*overall.Q : null;
  overall.category = overall.OEE !== null ? oeeCategory(overall.OEE) : 'No Data';
}

// OEE Category
function oeeCategory(oee) {
  if (oee === null) return 'No Data';
  if (oee <= 0.5) return 'Bad';
  if (oee > 0.5 && oee <= 0.6) return 'Minimum';
  if (oee > 0.6 && oee <= 0.75) return 'Good';
  if (oee > 0.75 && oee <= 0.85) return 'Recommended';
  if (oee > 0.85) return 'Excellent';
}


// REST API Endpoint
const app = express(); 
const PORT = 3000; 

// Format table for /oee endpoint
function formatTable(data) {
  const header = "Equipment | Date | A | P | Q | OEE | Category\n" +
                 "------------------------------------------------------------\n";
  const rows = data.map(r =>
    `${String(r.equipment).padEnd(2)} | ${r.date} | ${r.A.toFixed(2).padEnd(4)} | ${r.P.toFixed(2).padEnd(4)} | ${r.Q.toFixed(2).padEnd(4)} | ${r.OEE.toFixed(2).padEnd(4)} | ${oeeCategory(r.OEE)}`
  );
  return header + rows.join("\n");
}

// Endpoint
app.get("/oee", (req, res) => {
  const formattedData = Object.values(dailyMap)
    .filter(d => d.OEE !== null)
    .map(d => ({
      equipment: d.equipment,
      date: d.date,
      A: d.A,
      P: d.P,
      Q: d.Q,
      OEE: d.OEE
    }));

  res.setHeader("Content-Type", "text/plain");
  res.send(formatTable(formattedData));
});

app.get("/oee/daily", (req, res) => {
  // filter equipment
  const eq = req.query.equipment ? Number(req.query.equipment) : null;
  const arr = Object.values(dailyMap).filter(d => (eq ? d.equipment === eq : true));
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(arr, null, 2));
});
app.get("/oee/equipment", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(equipAverages, null, 2));
});
app.get("/oee/overall", (req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(overall, null, 2));
});


// serve frontend 
app.use(express.static("public"));

// route for /dashboard
app.get("/dashboard", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});


app.listen(PORT, () => {
  console.log(chalk.yellow(`Server running on http://localhost:${PORT}/dashboard`));
});