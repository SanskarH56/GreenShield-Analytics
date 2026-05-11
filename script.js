/* ── GreenShield Analytics */

let forestChart = null;
let priorityChart = null;
let scatterChart = null;

// Lush forest palette
const chartColors = [
  "#56e07e","#4caf6e","#38b2ac","#81e6d9",
  "#f6ad55","#fc8181","#b794f4","#63b3ed",
  "#68d391","#fbd38d","#90cdf4","#e2b96f",
  "#a3bffa","#9ae6b4","#fed7aa"
];

// ── Particles ──────────────────────────────────────────
function spawnParticles() {
  const container = document.getElementById("particles");
  for (let i = 0; i < 22; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const size = Math.random() * 3 + 1;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random()*100}%;
      animation-duration:${Math.random()*12+8}s;
      animation-delay:${Math.random()*10}s;
    `;
    container.appendChild(p);
  }
}
spawnParticles();

// ── Load CSV ───────────────────────────────────────────
Papa.parse("Data/deforestation.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  complete: function (results) {
    let data = results.data.filter(row => row.year && row.region);
    const processed = processData(data);
    window.dashboardData = processed;

    updateKpiCards(processed);
    populateRegionFilter(processed);
    renderChart(processed);
    renderPriorityChart(processed);
    renderScatterChart(processed);
    renderInsights(processed);
    updateDashboard(processed);
    setupTableSearch();
  }
});

// ── Data Processing ────────────────────────────────────
function processData(data) {
  const grouped = {};
  data.forEach(row => {
    if (!grouped[row.region]) grouped[row.region] = [];
    grouped[row.region].push(row);
  });

  Object.values(grouped).forEach(rows => {
    rows.sort((a, b) => a.year - b.year);
    rows.forEach((row, i) => {
      if (i === 0) {
        row.forestPctChange = 0;
        row.bioPctChange = 0;
      } else {
        const prev = rows[i - 1];
        row.forestPctChange = ((row.forest_area - prev.forest_area) / prev.forest_area) * 100;
        row.bioPctChange    = ((row.biodiversity_index - prev.biodiversity_index) / prev.biodiversity_index) * 100;
      }
      row.priorityScore = calcPriority(row);
    });
  });
  return Object.values(grouped).flat();
}

function calcPriority(row) {
  return (
    Math.abs(row.forestPctChange) * 0.5 +
    Math.abs(row.bioPctChange)    * 0.3 +
    (100 - row.biodiversity_index) * 0.2
  );
}

function getLatestRows(data) {
  const map = {};
  data.forEach(row => {
    if (!map[row.region] || row.year > map[row.region].year)
      map[row.region] = row;
  });
  return Object.values(map);
}

// ── KPI Cards ──────────────────────────────────────────
function updateKpiCards(data) {
  const latest   = getLatestRows(data);
  const regions  = new Set(data.map(r => r.region));
  const years    = new Set(data.map(r => r.year));

  const worst = latest.reduce((w, r) =>
    r.forestPctChange < w.forestPctChange ? r : w, latest[0]);

  const avgBio = (latest.reduce((s, r) => s + r.biodiversity_index, 0) / latest.length).toFixed(1);
  const stableCount  = latest.filter(r => r.priorityScore < 6).length;
  const criticalCount = latest.filter(r => r.priorityScore >= 10).length;

  setEl("totalRegions",    regions.size);
  setEl("worstRegion",     worst.region);
  setEl("highestLoss",     worst.forestPctChange.toFixed(2) + "%");
  setEl("criticalAlerts",  criticalCount);
  setEl("avgBiodiversity", avgBio);
  setEl("stableZones",     stableCount);

  // header live stats
  setEl("hLiveRegions",  regions.size);
  setEl("hLiveYears",    years.size);
  setEl("hLiveCritical", criticalCount);

  // animate numbers
  animateNumbers();
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function animateNumbers() {
  document.querySelectorAll(".kpi-value").forEach(el => {
    el.style.animation = "none";
    el.offsetHeight; // reflow
    el.style.animation = "fadeIn 0.5s ease";
  });
}

// ── Region Filter ──────────────────────────────────────
function populateRegionFilter(data) {
  const sel = document.getElementById("regionFilter");
  const regions = [...new Set(data.map(r => r.region))].sort();
  regions.forEach(region => {
    const opt = document.createElement("option");
    opt.value = region;
    opt.textContent = region;
    sel.appendChild(opt);
  });
}

// ── Line / Area Chart ──────────────────────────────────
function renderChart(data) {
  const selRegion = document.getElementById("regionFilter").value;
  const selMetric = document.getElementById("metricSelector").value;
  const selType   = document.getElementById("chartTypeSelector").value;

  let chartData = selRegion === "all" ? data : data.filter(r => r.region === selRegion);

  const metricLabels = {
    forest_area:        "Forest Area (km²)",
    biodiversity_index: "Biodiversity Index",
    priorityScore:      "Priority Score",
    species_count:      "Species Count"
  };

  const regions = [...new Set(chartData.map(r => r.region))];
  const years   = [...new Set(chartData.map(r => r.year))].sort((a,b) => a - b);

  // for area charts, limit to single region or top 5
  const visRegions = selRegion === "all" ? regions.slice(0, 8) : regions;

  const datasets = visRegions.map((region, idx) => {
    const rows = chartData.filter(r => r.region === region);
    const color = chartColors[idx % chartColors.length];
    const isArea = selType === "area";
    return {
      label: region,
      data: years.map(y => { const row = rows.find(r => r.year === y); return row ? row[selMetric] : null; }),
      borderColor: color,
      backgroundColor: isArea ? hexAlpha(color, 0.15) : hexAlpha(color, 0.8),
      pointRadius: 3,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.4,
      fill: isArea ? "origin" : false,
      spanGaps: true
    };
  });

  const ctx = document.getElementById("forestChart");
  if (forestChart) forestChart.destroy();

  const type = selType === "area" ? "line" : selType;

  forestChart = new Chart(ctx, {
    type: type,
    data: { labels: years, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: visRegions.length <= 6,
          labels: {
            color: "#9ab89a",
            font: { family: "'DM Sans'", size: 11 },
            boxWidth: 12, boxHeight: 12,
            borderRadius: 3
          }
        },
        tooltip: {
          backgroundColor: "rgba(10,31,15,0.95)",
          borderColor: "rgba(86,224,126,0.3)",
          borderWidth: 1,
          titleColor: "#56e07e",
          bodyColor: "#e8f5e0",
          padding: 12,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${Number(ctx.raw).toFixed(2)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#9ab89a", font: { family: "'DM Mono'", size: 11 } },
          grid:  { color: "rgba(86,224,126,0.06)" }
        },
        y: {
          ticks: { color: "#9ab89a", font: { family: "'DM Mono'", size: 11 } },
          grid:  { color: "rgba(86,224,126,0.06)" },
          title: { display: true, text: metricLabels[selMetric], color: "#9ab89a", font: { size: 11 } }
        }
      }
    }
  });

  // update subtitle
  const sub = document.getElementById("chartSubtitle");
  if (sub) sub.textContent = `${selRegion === "all" ? "All Regions" : selRegion} · ${metricLabels[selMetric]}`;
}

// ── Priority Bar Chart ─────────────────────────────────
function renderPriorityChart(data) {
  const latest = getLatestRows(data);
  const sorted = [...latest].sort((a, b) => b.priorityScore - a.priorityScore);

  const labels = sorted.map(r => r.region);
  const values = sorted.map(r => r.priorityScore);
  const colors = sorted.map(r =>
    r.priorityScore >= 10 ? "#e53e3e" :
    r.priorityScore >=  6 ? "#f6ad55" : "#38b2ac"
  );
  const borderColors = colors.map(c => c);

  const ctx = document.getElementById("priorityChart");
  if (priorityChart) priorityChart.destroy();

  priorityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Priority Score",
        data: values,
        backgroundColor: colors.map(c => hexAlpha(c, 0.7)),
        borderColor: borderColors,
        borderWidth: 1.5,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(10,31,15,0.95)",
          borderColor: "rgba(86,224,126,0.3)",
          borderWidth: 1,
          titleColor: "#56e07e",
          bodyColor: "#e8f5e0",
          padding: 12,
          callbacks: {
            label: ctx => `Score: ${Number(ctx.raw).toFixed(2)}`,
            afterLabel: ctx => {
              const s = Number(ctx.raw);
              return s >= 10 ? "Status: 🔴 Critical" : s >= 6 ? "Status: 🟡 Warning" : "Status: 🟢 Stable";
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#9ab89a", font: { family: "'DM Sans'", size: 10 }, maxRotation: 40 },
          grid: { display: false }
        },
        y: {
          ticks: { color: "#9ab89a", font: { family: "'DM Mono'", size: 11 } },
          grid: { color: "rgba(86,224,126,0.06)" },
          title: { display: true, text: "Priority Score", color: "#9ab89a", font: { size: 11 } }
        }
      }
    }
  });
}

// ── Scatter Chart (Biodiversity vs Forest Loss) ────────
function renderScatterChart(data) {
  const latest = getLatestRows(data);

  const scatterData = latest.map(r => ({
    x: r.forestPctChange,
    y: r.biodiversity_index,
    label: r.region,
    score: r.priorityScore
  }));

  const ctx = document.getElementById("scatterChart");
  if (scatterChart) scatterChart.destroy();

  scatterChart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Regions",
        data: scatterData.map(d => ({ x: d.x, y: d.y })),
        backgroundColor: scatterData.map(d =>
          d.score >= 10 ? hexAlpha("#e53e3e", 0.7) :
          d.score >=  6 ? hexAlpha("#f6ad55", 0.7) :
                          hexAlpha("#38b2ac", 0.7)
        ),
        borderColor: scatterData.map(d =>
          d.score >= 10 ? "#e53e3e" : d.score >= 6 ? "#f6ad55" : "#38b2ac"
        ),
        borderWidth: 1.5,
        pointRadius: 7,
        pointHoverRadius: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(10,31,15,0.95)",
          borderColor: "rgba(86,224,126,0.3)",
          borderWidth: 1,
          titleColor: "#56e07e",
          bodyColor: "#e8f5e0",
          padding: 12,
          callbacks: {
            label: (ctx) => {
              const d = scatterData[ctx.dataIndex];
              return [
                `Region: ${d.label}`,
                `Forest Δ: ${d.x.toFixed(2)}%`,
                `Biodiversity: ${d.y.toFixed(1)}`,
                `Priority: ${d.score.toFixed(2)}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: "Forest Change %", color: "#9ab89a", font: { size: 11 } },
          ticks: { color: "#9ab89a", font: { family: "'DM Mono'", size: 11 } },
          grid: { color: "rgba(86,224,126,0.06)" }
        },
        y: {
          title: { display: true, text: "Biodiversity Index", color: "#9ab89a", font: { size: 11 } },
          ticks: { color: "#9ab89a", font: { family: "'DM Mono'", size: 11 } },
          grid: { color: "rgba(86,224,126,0.06)" }
        }
      }
    }
  });
}

// ── Update Dashboard ───────────────────────────────────
function updateDashboard(data) {
  const threshold = Number(document.getElementById("thresholdSlider").value);
  const selRegion = document.getElementById("regionFilter").value;

  document.getElementById("thresholdValue").textContent = `${threshold}%`;

  let filtered = selRegion === "all" ? data : data.filter(r => r.region === selRegion);
  const latest  = getLatestRows(filtered);
  const alerts  = latest.filter(r => r.forestPctChange <= threshold);

  setEl("criticalAlerts", alerts.length);
  document.getElementById("alertCountBadge").textContent = `${alerts.length} active`;

  renderAlerts(alerts);
  renderRankingTable(latest);
  renderPriorityChart(filtered);
  renderInsights(filtered);
}

// ── Alerts ─────────────────────────────────────────────
function renderAlerts(alerts) {
  const container = document.getElementById("alertsContainer");
  container.innerHTML = "";

  if (!alerts.length) {
    container.innerHTML = `<p class="no-alerts">✅ No critical alerts for the current threshold.</p>`;
    return;
  }

  alerts.sort((a, b) => a.forestPctChange - b.forestPctChange).forEach(row => {
    const div = document.createElement("div");
    div.className = "alert-item";
    div.innerHTML = `
      <strong>${row.region}</strong>
      <p>Forest cover changed by <b>${row.forestPctChange.toFixed(2)}%</b> in ${row.year}.</p>
      <span class="alert-badge">${getStatus(row.priorityScore).toUpperCase()}</span>
    `;
    container.appendChild(div);
  });
}

// ── Ranking Table ──────────────────────────────────────
function renderRankingTable(rows) {
  const tbody = document.getElementById("rankingTableBody");
  tbody.innerHTML = "";
  const sorted = [...rows].sort((a, b) => b.priorityScore - a.priorityScore);

  // max priority for sparkbar
  const maxScore = Math.max(...sorted.map(r => r.priorityScore));

  sorted.forEach((row, i) => {
    const status = getStatus(row.priorityScore);
    const fClass = row.forestPctChange < 0 ? "change-neg" : row.forestPctChange > 0 ? "change-pos" : "change-neu";
    const bClass = row.bioPctChange    < 0 ? "change-neg" : row.bioPctChange    > 0 ? "change-pos" : "change-neu";
    const barW   = ((row.priorityScore / maxScore) * 100).toFixed(1);
    const barCol = status === "Critical" ? "#e53e3e" : status === "Warning" ? "#f6ad55" : "#38b2ac";

    const tr = document.createElement("tr");
    tr.dataset.region = row.region.toLowerCase();
    tr.innerHTML = `
      <td><span class="rank-num">#${i + 1}</span></td>
      <td>${row.region}</td>
      <td>${row.year}</td>
      <td class="${fClass}">${row.forestPctChange.toFixed(2)}%</td>
      <td class="${bClass}">${row.bioPctChange.toFixed(2)}%</td>
      <td>${row.species_count || "—"}</td>
      <td>
        <div class="sparkbar-wrap">
          <span class="priority-val">${row.priorityScore.toFixed(2)}</span>
          <div class="sparkbar-track">
            <div class="sparkbar-fill" style="width:${barW}%;background:${barCol}"></div>
          </div>
        </div>
      </td>
      <td><span class="status-${status.toLowerCase()}">${status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ── Table Search ───────────────────────────────────────
function setupTableSearch() {
  document.getElementById("tableSearch").addEventListener("input", function () {
    const q = this.value.toLowerCase();
    document.querySelectorAll("#rankingTableBody tr").forEach(tr => {
      tr.style.display = tr.dataset.region.includes(q) ? "" : "none";
    });
  });
}

// ── Insights ───────────────────────────────────────────
function renderInsights(data) {
  const list = document.getElementById("insightList");
  list.innerHTML = "";

  const latest   = getLatestRows(data);
  if (!latest.length) return;

  const worst    = latest.reduce((m, r) => r.forestPctChange < m.forestPctChange ? r : m);
  const bestBio  = latest.reduce((m, r) => r.biodiversity_index > m.biodiversity_index ? r : m);
  const highPri  = latest.reduce((m, r) => r.priorityScore > m.priorityScore ? r : m);
  const stable   = latest.reduce((m, r) => r.priorityScore < m.priorityScore ? r : m);
  const critical = latest.filter(r => r.priorityScore >= 10).length;
  const avgLoss  = (latest.reduce((s, r) => s + r.forestPctChange, 0) / latest.length).toFixed(2);

  const insights = [
    `🌲 <b>${worst.region}</b> has the worst forest loss at <b>${worst.forestPctChange.toFixed(2)}%</b> — immediate intervention recommended.`,
    `🎯 <b>${highPri.region}</b> leads with the highest priority score of <b>${highPri.priorityScore.toFixed(2)}</b>.`,
    `🦋 <b>${bestBio.region}</b> has the best biodiversity index at <b>${bestBio.biodiversity_index.toFixed(1)}</b>.`,
    `🚨 <b>${critical}</b> region${critical !== 1 ? "s are" : " is"} currently in <b>critical</b> condition.`,
    `📊 Average forest change across all regions: <b>${avgLoss}%</b>.`,
    `✅ <b>${stable.region}</b> is the most stable region with a priority score of <b>${stable.priorityScore.toFixed(2)}</b>.`
  ];

  insights.forEach((text, i) => {
    const li = document.createElement("li");
    li.innerHTML = text;
    li.style.animationDelay = `${i * 0.07}s`;
    list.appendChild(li);
  });
}

// ── Status ─────────────────────────────────────────────
function getStatus(score) {
  if (score >= 10) return "Critical";
  if (score >= 6)  return "Warning";
  return "Stable";
}

// ── Helpers ────────────────────────────────────────────
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Event Listeners ────────────────────────────────────
document.getElementById("thresholdSlider").addEventListener("input", () => {
  updateDashboard(window.dashboardData);
});
document.getElementById("regionFilter").addEventListener("change", () => {
  renderChart(window.dashboardData);
  updateDashboard(window.dashboardData);
});
document.getElementById("metricSelector").addEventListener("change", () => {
  renderChart(window.dashboardData);
});
document.getElementById("chartTypeSelector").addEventListener("change", () => {
  renderChart(window.dashboardData);
});
