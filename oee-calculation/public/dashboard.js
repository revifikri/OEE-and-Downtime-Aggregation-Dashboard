const equipFilter = document.getElementById("equipFilter");
const refreshBtn = document.getElementById("refreshBtn");
const toggleChart = document.getElementById("toggleChart");
const chartCard = document.getElementById("chartCard");

const oeeDailyTbody = document.querySelector("#oeeDailyTable tbody");
const downtimeTbody = document.querySelector("#downtimeTable tbody");
const equipAveragesContainer = document.getElementById("equipAveragesContainer");
const overallTableContainer = document.getElementById("overallTableContainer");

let chartInstance = null;

function oeeCategory(oee) {
  if (oee === null) return 'No Data';
  if (oee <= 0.5) return 'Bad';
  if (oee > 0.5 && oee <= 0.6) return 'Minimum';
  if (oee > 0.6 && oee <= 0.75) return 'Good';
  if (oee > 0.75 && oee <= 0.85) return 'Recommended';
  if (oee > 0.85) return 'Excellent';
}

async function fetchJson(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  return r.json();
}

function fmtPct(v){
  if (v === null || v === undefined) return '-';
  return (v*100).toFixed(2) + '%';
}

async function loadOeeDaily(equipmentId){
  const all = await fetchJson("/oee/daily");
  const filtered = equipmentId ? all.filter(x => Number(x.equipment) === Number(equipmentId)) : all;
  // Sort by equipment then date
  filtered.sort((a,b) => {
    if (a.equipment !== b.equipment) return a.equipment - b.equipment;
    return a.date.localeCompare(b.date);
  });
  oeeDailyTbody.innerHTML = "";
  filtered.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${d.equipment}</td>
                    <td>${d.date}</td>
                    <td>${fmtPct(d.A)}</td>
                    <td>${fmtPct(d.P)}</td>
                    <td>${fmtPct(d.Q)}</td>
                    <td>${fmtPct(d.OEE)}</td>
                    <td>${oeeCategory(d.OEE)}</td>`;
    oeeDailyTbody.appendChild(tr);
  });
}

async function loadDowntime(equipmentId){
  const q = equipmentId ? `?equipment=${equipmentId}` : "";
  const res = await fetch("/downtime" + q);
  const txt = await res.text();
  const lines = txt.split("\n").slice(2).filter(l => l.trim());
  downtimeTbody.innerHTML = "";
  lines.forEach(line => {
    const parts = line.split("|").map(p => p.trim());
    if (parts.length >= 4){
      const [equipment, date, reason, total] = parts;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${equipment}</td><td>${date}</td><td>${reason}</td><td>${total}</td>`;
      downtimeTbody.appendChild(tr);
    }
  });
}

async function loadEquipAverages(){
  const arr = await fetchJson("/oee/equipment");
  // build a small table
  const html = `<div class="small-table">
    <h3>Per-equipment averages</h3>
    <table>
      <thead><tr><th>Equipment</th><th>A</th><th>P</th><th>Q</th><th>OEE</th><th>Category</th></tr></thead>
      <tbody>
      ${arr.map(e => `<tr>
        <td>${e.equipment}</td>
        <td>${fmtPct(e.avgA)}</td>
        <td>${fmtPct(e.avgP)}</td>
        <td>${fmtPct(e.avgQ)}</td>
        <td>${fmtPct(e.oee)}</td>
        <td>${oeeCategory(e.oee)}</td>
      </tr>`).join("")}
      </tbody>
    </table>
  </div>`;
  equipAveragesContainer.innerHTML = html;

  // populate equipment filter options (merge with /oee/equipment data)
  const opts = arr.map(e => `<option value="${e.equipment}">Equipment ${e.equipment}</option>`).join("");
  equipFilter.innerHTML = `<option value="">All Equipments</option>` + opts;
}

async function loadOverall(){
  const o = await fetchJson("/oee/overall");
  // make a compact table
  const html = `<div class="small-table">
    <h3>Overall</h3>
    <table>
      <thead><tr><th>A</th><th>P</th><th>Q</th><th>OEE</th><th>Category</th></tr></thead>
      <tbody>
        <tr>
          <td>${fmtPct(o.A)}</td>
          <td>${fmtPct(o.P)}</td>
          <td>${fmtPct(o.Q)}</td>
          <td>${fmtPct(o.OEE)}</td>
          <td>${o.category || oeeCategory(o.OEE)}</td>
        </tr>
      </tbody>
    </table>
  </div>`;
  overallTableContainer.innerHTML = html;
}

async function loadChart(equipmentId){
  const all = await fetchJson("/oee/daily");
  const filtered = equipmentId ? all.filter(x => Number(x.equipment) === Number(equipmentId)) : all;

  // group by equipment
  const byEquip = {};
  filtered.forEach(d => {
    if(!byEquip[d.equipment]) byEquip[d.equipment] = [];
    byEquip[d.equipment].push({ date: d.date, oee: (d.OEE !== null ? d.OEE*100 : null) });
  });

  // build labels (unique sorted)
  const labels = [...new Set(filtered.map(d => d.date))].sort();

  const colors = ["#1f77b4","#ff7f0e","#2ca02c","#d62728","#9467bd"];
  const datasets = Object.keys(byEquip).map((eq, i) => {
    const arr = byEquip[eq];
    const data = labels.map(l => {
      const f = arr.find(x => x.date === l);
      return f ? Number((f.oee).toFixed(2)) : null;
    });
    return {
      label: `Eq ${eq}`,
      data,
      borderColor: colors[i % colors.length],
      backgroundColor: 'transparent',
      tension: 0.0,      
      borderWidth: 2,
      spanGaps: true
    };
  });

  // destroy previous
  if(chartInstance) chartInstance.destroy();

  const ctx = document.getElementById("oeeChart").getContext("2d");
  chartInstance = new Chart(ctx, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: { legend: { position: 'top' } },
      scales: {
        x: { grid: { color: '#e6eef4', drawBorder: false }, ticks: { color:'#333' } },
        y: { min: 0, max: 100, ticks: { callback: v => v + '%' }, grid: { color:'#e6eef4' } }
      }
    }
  });
}

async function loadAll(){
  const eq = equipFilter.value || "";
  await loadEquipAverages();
  await loadOverall();
  await loadOeeDaily(eq);
  await loadDowntime(eq);

  if(toggleChart.checked){
    chartCard.style.display = "block";
    await loadChart(eq);
  } else {
    chartCard.style.display = "none";
  }
}

refreshBtn.addEventListener("click", loadAll);
equipFilter.addEventListener("change", loadAll);
toggleChart.addEventListener("change", () => {
  if(toggleChart.checked) loadChart(equipFilter.value || "");
  chartCard.style.display = toggleChart.checked ? "block" : "none";
});

loadAll();