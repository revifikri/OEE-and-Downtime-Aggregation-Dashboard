async function loadDowntime(equipmentId = "") {
  const res = await fetch(`/downtime${equipmentId ? `?equipment=${equipmentId}` : ""}`);
  const text = await res.text();

  // Parse text into structured rows
  const lines = text.split("\n").slice(2).filter(l => l.trim());
  const data = lines.map(line => {
    const [equipment, date, reason, total] = line.split(" | ").map(v => v.trim());
    return { equipment, date, reason, total };
  });

  // Populate table
  const tbody = document.querySelector("#downtimeTable tbody");
  tbody.innerHTML = "";
  data.forEach(row => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.equipment}</td><td>${row.date}</td><td>${row.reason}</td><td>${row.total}</td>`;
    tbody.appendChild(tr);
  });

  // Summary
  const summary = {};
  data.forEach(d => {
    summary[d.equipment] = (summary[d.equipment] || 0) + parseInt(d.total);
  });

  const summaryText = Object.entries(summary)
    .map(([equip, total]) => `<strong>Equipment ${equip}</strong>: ${total} min downtime`)
    .join("<br>");
  document.querySelector("#summaryData").innerHTML = summaryText || "No data";

  // Fill equipment filter options
  const select = document.getElementById("equipmentSelect");
  const uniqueEquip = [...new Set(data.map(d => d.equipment))];
  select.innerHTML = `<option value="">All Equipments</option>`;
  uniqueEquip.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e;
    opt.textContent = `Equipment ${e}`;
    select.appendChild(opt);
  });
}

document.getElementById("refreshBtn").addEventListener("click", () => {
  const equipment = document.getElementById("equipmentSelect").value;
  loadDowntime(equipment);
});

loadDowntime();
