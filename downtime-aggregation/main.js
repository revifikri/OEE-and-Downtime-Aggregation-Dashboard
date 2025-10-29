const fs = require("fs");
const dayjs = require("dayjs");
const express = require("express");
const chalk = require("chalk");

const status = JSON.parse(fs.readFileSync("./status.json", "utf-8"));
const manualStatus = JSON.parse(fs.readFileSync("./manual_status.json", "utf-8"));

// Normalize timestamps
function normalize(records) {
  return records.map(r => ({
    ...r,
    start: dayjs(r.start_time, "YYYY/MM/DD HH:mm:ss"),
    end: dayjs(r.end_time, "YYYY/MM/DD HH:mm:ss"),
  }));
}

const auto = normalize(status);
const manual = normalize(manualStatus);

// Merge and prioritize manual
const merged = [...auto.map(r => ({...r, source: "auto"})), 
                ...manual.map(r => ({...r, source: "manual"}))];

merged.sort((a, b) => a.start - b.start);

let cleaned = [];
for (const entry of merged) {
  const overlap = cleaned.find(
    e => e.equipment_id === entry.equipment_id &&
         entry.start.isBefore(e.end) &&
         entry.end.isAfter(e.start)
  );

  if (overlap) {
    // If manual, replace the auto record
    if (entry.source === "manual") {
      overlap.status = entry.status;
      overlap.reason = entry.reason;
      overlap.source = "manual";
    }
  } else {
    cleaned.push(entry);
  }
}

// Filter only DOWN records
const downRecords = cleaned.filter(r => r.status === "DOWN");

// Aggregate by equipment, date, and reason
const results = {};

downRecords.forEach(r => {
  let current = r.start;
  while (current.isBefore(r.end)) {
    const currentDate = current.format("YYYY-MM-DD");
    const endOfDay = current.endOf("day");
    const sliceEnd = r.end.isBefore(endOfDay) ? r.end : endOfDay;

    const duration = sliceEnd.diff(current, "minute"); // or seconds

    const key = `${r.equipment_id}_${currentDate}_${r.reason || "Status Down"}`;
    if (!results[key]) {
      results[key] = {
        equipment: r.equipment_id,
        date: currentDate,
        reason: r.reason || "Status Down",
        totalOccurrence: 0,
      };
    }
    results[key].totalOccurrence += duration;
    current = sliceEnd.add(1, "second");
  }
});


// REST API Endpoint 
const app = express();
const PORT = 3000;

app.get("/downtime", (req, res) => {
  const equipmentId = req.query.equipment ? parseInt(req.query.equipment) : null;
  let data = Object.values(results);
  if (equipmentId) {
    data = data.filter(r => r.equipment === equipmentId);
  }

  // Format output like CLI
  let output = "Equipment | Date | Reason | Total Occurrence (min)\n";
  output += "---------------------------------------------\n";
  data.forEach(r => {
    output += `${r.equipment} | ${r.date} | ${r.reason} | ${r.totalOccurrence}\n`;
  });

  res.setHeader("Content-Type", "text/plain");
  res.send(output);
});

app.use(express.static("public"));
app.listen(PORT, () =>
  console.log(chalk.yellow(`Server running on http://localhost:${PORT}`))
);