/* ── GreenShield Analytics ───────────────────────────── */

let forestChart = null;
let priorityChart = null;
let scatterChart = null;
let indiaRiskMap = null;
let mapMarkerLayer = null;
let pendingMapPopupRegion = null;

// Lush forest palette
const chartColors = [
  "#56e07e", "#4caf6e", "#38b2ac", "#81e6d9",
  "#f6ad55", "#fc8181", "#b794f4", "#63b3ed",
  "#68d391", "#fbd38d", "#90cdf4", "#e2b96f",
  "#a3bffa", "#9ae6b4", "#fed7aa"
];

// Approximate coordinates for map markers. These are representative points
// used for dashboard visualization, not legal/geographic boundaries.
const regionCoordinates = {
  "Andaman Islands": [11.7401, 92.6586],
  "Aravallis": [27.0238, 74.2179],
  "Central Highlands": [23.2599, 77.4126],
  "Coastal Karnataka": [13.3409, 74.7421],
  "Deccan Plateau Edge": [16.7000, 77.0000],
  "Eastern Ghats": [18.2000, 82.2000],
  "Himalayan Foothills": [29.9457, 78.1642],
  "Meghalaya Plateau": [25.4670, 91.3662],
  "Nilgiris": [11.4102, 76.6950],
  "Northeast Hills": [26.2006, 92.9376],
  "Sikkim Highlands": [27.5330, 88.5122],
  "Sundarbans": [21.9497, 88.9248],
  "Vindyha-Satpura": [22.6000, 78.2000],
  "Vindhya-Satpura": [22.6000, 78.2000],
  "Western Ghats North": [17.9230, 73.6580],
  "Western Ghats South": [10.8505, 76.2711]
};

// ── Particles ──────────────────────────────────────────
function spawnParticles() {
  const container = document.getElementById("particles");
  if (!container) return;

  for (let i = 0; i < 22; i++) {
    const p = document.createElement("div");
    p.className = "particle";
    const size = Math.random() * 3 + 1;
    p.style.cssText = `
      width:${size}px; height:${size}px;
      left:${Math.random() * 100}%;
      animation-duration:${Math.random() * 12 + 8}s;
      animation-delay:${Math.random() * 10}s;
    `;
    container.appendChild(p);
  }
}
spawnParticles();

// ── Load CSV ───────────────────────────────────────────
// Try multiple CSV locations so the app does not get stuck on the loading screen
// if the file is in Data/, data/, or next to index.html.
const CSV_PATHS = [
  "Data/deforestation.csv",
  "data/deforestation.csv",
  "deforestation.csv"
];

function loadDashboardCsv(pathIndex = 0) {
  const path = CSV_PATHS[pathIndex];

  Papa.parse(path, {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    complete: function (results) {
      const rawData = (results.data || []).filter(row => row && row.year && row.region);

      // A 404 can sometimes still reach complete() with unusable content.
      // In that case, try the next possible path instead of freezing on loading.
      if (!rawData.length) {
        if (pathIndex < CSV_PATHS.length - 1) {
          console.warn(`No usable data found at ${path}. Trying next CSV path...`);
          loadDashboardCsv(pathIndex + 1);
          return;
        }

        showLoadingError("Could not find usable CSV data. Check that deforestation.csv exists and has year + region columns.");
        return;
      }

      try {
        initializeDashboard(rawData, path);
      } catch (error) {
        console.error("Dashboard initialization failed:", error);
        showLoadingError("Dashboard loaded the CSV, but a script error stopped initialization. Check the console for details.");
      }
    },
    error: function (error) {
      console.warn(`CSV loading failed at ${path}:`, error);

      if (pathIndex < CSV_PATHS.length - 1) {
        loadDashboardCsv(pathIndex + 1);
        return;
      }

      showLoadingError("Could not load dashboard data. Check CSV path and file name.");
    }
  });
}

function initializeDashboard(rawData, csvPath) {
  console.log(`GreenShield data loaded from: ${csvPath}`);

  const processed = processData(rawData);
  window.dashboardData = processed;

  populateRegionFilter(processed);
  populateYearFilters(processed);
  populateCompareSelectors(processed);
  setupTableSearch();
  updateDashboard(processed);
  updateDecisionSummary();
  hideLoadingOverlay();
}

function showLoadingError(message) {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;

  const text = overlay.querySelector(".loader-text");
  if (text) text.textContent = message;

  overlay.classList.add("loading-error");
}

loadDashboardCsv();

// ── Data Processing ────────────────────────────────────
function processData(data) {
  const grouped = {};

  data.forEach(row => {
    // Normalize possible column names so deployment does not break if the CSV
    // uses older column labels.
    row.forest_area = Number(row.forest_area ?? row.forest_area_km2 ?? row.forest_cover_km2 ?? 0);
    row.biodiversity_index = Number(row.biodiversity_index ?? row.biodiversity_significance_score ?? 0);
    row.species_count = Number(row.species_count ?? 0);

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
        row.bioPctChange = ((row.biodiversity_index - prev.biodiversity_index) / prev.biodiversity_index) * 100;
      }

      row.priorityScore = calcPriority(row);
    });
  });

  return Object.values(grouped).flat();
}

function calcPriority(row) {
  return (
    Math.abs(row.forestPctChange) * 0.5 +
    Math.abs(row.bioPctChange) * 0.3 +
    (100 - row.biodiversity_index) * 0.2
  );
}


function getYearFilteredData(data = window.dashboardData) {
  if (!data || !Array.isArray(data)) return [];

  const startYearEl = document.getElementById("startYear");
  const endYearEl = document.getElementById("endYear");

  if (!startYearEl || !endYearEl) {
    return data;
  }

  const startYear = Number(startYearEl.value);
  const endYear = Number(endYearEl.value);

  if (!startYear || !endYear) {
    return data;
  }

  return data.filter(row => row.year >= startYear && row.year <= endYear);
}

function getLatestRows(data) {
  const map = {};

  data.forEach(row => {
    if (!map[row.region] || row.year > map[row.region].year) {
      map[row.region] = row;
    }
  });

  return Object.values(map);
}

function getFilteredData(data) {
  if (!data) return [];

  const selectedRegion = document.getElementById("regionFilter")?.value || "all";
  const startYear = Number(document.getElementById("startYearSelector")?.value || -Infinity);
  const endYear = Number(document.getElementById("endYearSelector")?.value || Infinity);

  let filtered = [...data];

  if (selectedRegion !== "all") {
    filtered = filtered.filter(row => row.region === selectedRegion);
  }

  filtered = filtered.filter(row => row.year >= startYear && row.year <= endYear);

  return filtered;
}

function getTopRiskRegions(data, count = 5) {
  return getLatestRows(data)
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, count)
    .map(row => row.region);
}

// ── KPI Cards ──────────────────────────────────────────
function updateKpiCards(data) {
  const latest = getLatestRows(data);
  if (!latest.length) return;

  const regions = new Set(data.map(row => row.region));
  const years = new Set(data.map(row => row.year));

  const worst = latest.reduce((w, r) => r.forestPctChange < w.forestPctChange ? r : w, latest[0]);
  const avgBio = latest.reduce((sum, r) => sum + r.biodiversity_index, 0) / latest.length;
  const criticalCount = latest.filter(r => r.priorityScore >= 10).length;
  const avgForestChange = latest.reduce((sum, r) => sum + r.forestPctChange, 0) / latest.length;

  setEl("totalRegions", regions.size);
  setEl("worstRegion", worst.region);
  setEl("highestLoss", `${worst.forestPctChange.toFixed(2)}%`);
  setEl("criticalAlerts", criticalCount);
  setEl("avgBiodiversity", avgBio.toFixed(1));
  setEl("avgForestLoss", `${avgForestChange.toFixed(2)}%`);

  setEl("hLiveRegions", regions.size);
  setEl("hLiveYears", years.size);
  setEl("hLiveCritical", criticalCount);

  animateNumbers();
}

function setEl(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function animateNumbers() {
  document.querySelectorAll(".kpi-value, .hstat-num").forEach(el => {
    el.style.animation = "none";
    el.offsetHeight;
    el.style.animation = "fadeIn 0.5s ease";
  });
}

// ── Filters ────────────────────────────────────────────
function populateRegionFilter(data) {
  const select = document.getElementById("regionFilter");
  if (!select) return;

  const current = select.value || "all";
  select.innerHTML = `<option value="all">🌐 All Regions</option>`;

  [...new Set(data.map(row => row.region))].sort().forEach(region => {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    select.appendChild(option);
  });

  select.value = current;
}

function populateYearFilters(data) {
  const startSelect = document.getElementById("startYearSelector");
  const endSelect = document.getElementById("endYearSelector");
  if (!startSelect || !endSelect) return;

  const years = [...new Set(data.map(row => row.year))].sort((a, b) => a - b);
  startSelect.innerHTML = "";
  endSelect.innerHTML = "";

  years.forEach(year => {
    const startOption = document.createElement("option");
    startOption.value = year;
    startOption.textContent = year;
    startSelect.appendChild(startOption);

    const endOption = document.createElement("option");
    endOption.value = year;
    endOption.textContent = year;
    endSelect.appendChild(endOption);
  });

  startSelect.value = years[0];
  endSelect.value = years[years.length - 1];
}

function populateCompareSelectors(data) {
  const a = document.getElementById("compareRegionA");
  const b = document.getElementById("compareRegionB");
  if (!a || !b) return;

  const regions = [...new Set(data.map(row => row.region))].sort();
  const options = regions.map(region => `<option value="${region}">${region}</option>`).join("");
  a.innerHTML = options;
  b.innerHTML = options;

  if (regions.length > 1) {
    const top = getLatestRows(data).sort((x, y) => y.priorityScore - x.priorityScore);
    a.value = top[0]?.region || regions[0];
    b.value = top.find(row => row.region !== a.value)?.region || regions[1];
  }
}

// ── Line / Area / Bar Chart ────────────────────────────
function renderChart(data) {
  const selectedRegion = document.getElementById("regionFilter")?.value || "all";
  const selectedMetric = document.getElementById("metricSelector")?.value || "forest_area";
  const selectedType = document.getElementById("chartTypeSelector")?.value || "line";
  const selectedScope = document.getElementById("regionScopeSelector")?.value || "top5";

  const filtered = getFilteredData(data);
  let chartData = [...filtered];

  const metricLabels = {
    forest_area: "Forest Area (km²)",
    biodiversity_index: "Biodiversity Index",
    priorityScore: "Priority Score",
    species_count: "Species Count"
  };

  let regions = [...new Set(chartData.map(row => row.region))];

  if (selectedRegion === "all" && selectedScope === "top5") {
    const topRiskRegions = getTopRiskRegions(chartData, 5);
    chartData = chartData.filter(row => topRiskRegions.includes(row.region));
    regions = topRiskRegions;
  }

  const years = [...new Set(chartData.map(row => row.year))].sort((a, b) => a - b);

  const datasets = regions.map((region, index) => {
    const rows = chartData.filter(row => row.region === region);
    const color = chartColors[index % chartColors.length];
    const isArea = selectedType === "area";

    return {
      label: region,
      data: years.map(year => {
        const row = rows.find(item => item.year === year);
        return row ? row[selectedMetric] : null;
      }),
      borderColor: color,
      backgroundColor: isArea ? hexAlpha(color, 0.16) : hexAlpha(color, 0.78),
      pointRadius: 3,
      pointHoverRadius: 6,
      borderWidth: 2,
      tension: 0.4,
      fill: isArea ? "origin" : false,
      spanGaps: true
    };
  });

  const ctx = document.getElementById("forestChart");
  if (!ctx) return;
  if (forestChart) forestChart.destroy();

  const chartType = selectedType === "area" ? "line" : selectedType;

  forestChart = new Chart(ctx, {
    type: chartType,
    data: { labels: years, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: regions.length <= 6,
          labels: {
            color: "#b8d8b7",
            font: { family: "'DM Sans'", size: 11 },
            boxWidth: 12,
            boxHeight: 12,
            borderRadius: 3
          }
        },
        tooltip: forestTooltip({
          label: context => `${context.dataset.label}: ${Number(context.raw).toFixed(2)}`
        })
      },
      scales: darkScales(metricLabels[selectedMetric])
    }
  });

  const subtitle = document.getElementById("chartSubtitle");
  if (subtitle) {
    const regionText = selectedRegion === "all"
      ? selectedScope === "top5" ? "Top 5 Risk Regions" : "All Regions"
      : selectedRegion;
    subtitle.textContent = `${regionText} · ${metricLabels[selectedMetric]}`;
  }
}

// ── Priority Bar Chart ─────────────────────────────────
function renderPriorityChart(data) {
  const latest = getLatestRows(data);
  const sorted = [...latest].sort((a, b) => b.priorityScore - a.priorityScore);

  const labels = sorted.map(row => row.region);
  const values = sorted.map(row => row.priorityScore);
  const colors = sorted.map(row => getStatusColor(row.priorityScore));

  const ctx = document.getElementById("priorityChart");
  if (!ctx) return;
  if (priorityChart) priorityChart.destroy();

  priorityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Priority Score",
        data: values,
        backgroundColor: colors.map(color => hexAlpha(color, 0.72)),
        borderColor: colors,
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
        tooltip: forestTooltip({
          label: context => `Score: ${Number(context.raw).toFixed(2)}`,
          afterLabel: context => `Status: ${getStatus(Number(context.raw))}`
        })
      },
      scales: darkScales("Priority Score", true)
    }
  });
}

// ── Scatter Chart ──────────────────────────────────────
function renderScatterChart(data) {
  const latest = getLatestRows(data);

  const scatterData = latest.map(row => ({
    x: row.forestPctChange,
    y: row.biodiversity_index,
    label: row.region,
    score: row.priorityScore
  }));

  const ctx = document.getElementById("scatterChart");
  if (!ctx) return;
  if (scatterChart) scatterChart.destroy();

  scatterChart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [{
        label: "Regions",
        data: scatterData.map(point => ({ x: point.x, y: point.y })),
        backgroundColor: scatterData.map(point => hexAlpha(getStatusColor(point.score), 0.72)),
        borderColor: scatterData.map(point => getStatusColor(point.score)),
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
        tooltip: forestTooltip({
          label: context => {
            const point = scatterData[context.dataIndex];
            return [
              `Region: ${point.label}`,
              `Forest Δ: ${point.x.toFixed(2)}%`,
              `Biodiversity: ${point.y.toFixed(1)}`,
              `Priority: ${point.score.toFixed(2)}`
            ];
          }
        })
      },
      scales: {
        x: darkAxis("Forest Change %"),
        y: darkAxis("Biodiversity Index")
      }
    }
  });
}


// ── India Risk Map ────────────────────────────────────
function initIndiaRiskMap() {
  const mapEl = document.getElementById("indiaRiskMap");
  if (!mapEl || typeof L === "undefined") return null;

  if (indiaRiskMap) return indiaRiskMap;

  indiaRiskMap = L.map(mapEl, {
    zoomControl: true,
    scrollWheelZoom: false,
    attributionControl: true
  }).setView([22.8, 79.0], 4.5);

  // Dark, low-noise basemap so the forest-risk layer feels integrated rather than
  // like plain colored dots on top of a normal map.
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 18,
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO"
  }).addTo(indiaRiskMap);

  mapMarkerLayer = L.layerGroup().addTo(indiaRiskMap);
  setTimeout(() => indiaRiskMap.invalidateSize(), 200);
  return indiaRiskMap;
}

function renderIndiaRiskMap(data) {
  const mapEl = document.getElementById("indiaRiskMap");
  if (!mapEl) return;

  if (typeof L === "undefined") {
    mapEl.innerHTML = `<div class="map-fallback">Map library could not load. Check internet connection or CDN access.</div>`;
    return;
  }

  const map = initIndiaRiskMap();
  if (!map || !mapMarkerLayer) return;

  mapMarkerLayer.clearLayers();

  const latest = getLatestRows(data)
    .filter(row => regionCoordinates[row.region])
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const bounds = [];

  setEl("mappedZonesCount", latest.length || "—");
  setEl("mappedCriticalCount", latest.filter(row => getStatus(row.priorityScore) === "Critical").length);

  if (!latest.length) {
    setEl("mappedTopRegion", "—");
    renderMapRegionList([]);
    map.setView([22.8, 79.0], 4.5);
    return;
  }

  const topRegion = latest[0];
  setEl("mappedTopRegion", topRegion.region);
  renderMapRegionList(latest);

  latest.forEach((row, index) => {
    const coords = regionCoordinates[row.region];
    const status = getStatus(row.priorityScore);
    const color = getStatusColor(row.priorityScore);
    const size = Math.max(28, Math.min(54, 30 + row.priorityScore * 1.15));
    const marker = L.marker(coords, {
      icon: L.divIcon({
        className: "eco-marker-wrap",
        html: `
          <button class="eco-marker marker-${status.toLowerCase()}" style="--pin-color:${color}; --pin-size:${size}px" aria-label="${row.region} ${status}">
            <span class="pin-pulse"></span>
            <span class="pin-core"><span class="pin-symbol">${getMapIcon(row.priorityScore)}</span></span>
            <span class="pin-label"><b>${row.region}</b><small>${status} · ${row.priorityScore.toFixed(1)} priority</small></span>
          </button>
        `,
        iconSize: [230, size + 18],
        iconAnchor: [size / 2, size / 2]
      }),
      zIndexOffset: 1000 - index
    });

    marker.bindTooltip(`<div class="map-hover-title">${row.region}</div><div class="map-hover-meta">${status} · ${row.priorityScore.toFixed(1)} priority</div>`, {
      direction: "right",
      offset: [18, 0],
      opacity: 0.96,
      className: `map-hover-tooltip tooltip-${status.toLowerCase()}`
    });

    marker.bindPopup(`
      <div class="map-popup">
        <h3>${row.region}</h3>
        <div class="popup-status status-${status.toLowerCase()}">${status}</div>
        <p><b>Forest Area:</b> ${Number(row.forest_area).toLocaleString()} km²</p>
        <p><b>Forest Δ:</b> ${row.forestPctChange.toFixed(2)}%</p>
        <p><b>Biodiversity:</b> ${row.biodiversity_index.toFixed(1)}</p>
        <p><b>Species:</b> ${Number(row.species_count || 0).toLocaleString()}</p>
        <p><b>Priority:</b> ${row.priorityScore.toFixed(2)}</p>
        <p class="popup-rec">${getRecommendation(row.priorityScore)}.</p>
      </div>
    `);

    marker.on("click", () => focusRegionFromMap(row.region));
    marker.addTo(mapMarkerLayer);

    if (pendingMapPopupRegion === row.region) {
      setTimeout(() => {
        marker.openPopup();
        pendingMapPopupRegion = null;
      }, 160);
    }

    bounds.push(coords);
  });

  if (bounds.length === 1) {
    map.setView(bounds[0], 7);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [44, 44], maxZoom: 5.6 });
  }

  setTimeout(() => map.invalidateSize(), 120);
}

function getMapIcon(score) {
  const status = getStatus(score);
  if (status === "Critical") return "🔥";
  if (status === "Warning") return "⚠️";
  return "🌿";
}

function focusRegionFromMap(region) {
  const regionSelect = document.getElementById("regionFilter");
  if (regionSelect) regionSelect.value = region;
  pendingMapPopupRegion = region;
  updateDashboard(window.dashboardData);
  document.getElementById("regionDetailCard")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderMapRegionList(rows) {
  const list = document.getElementById("mapRegionList");
  if (!list) return;

  if (!rows.length) {
    list.innerHTML = `<p class="map-empty">No mapped regions in the current filter.</p>`;
    return;
  }

  list.innerHTML = rows.slice(0, 7).map((row, index) => {
    const status = getStatus(row.priorityScore);
    return `
      <button class="map-region-chip map-region-${status.toLowerCase()}" data-region="${row.region}">
        <span class="chip-rank">#${index + 1}</span>
        <span class="chip-main"><b>${row.region}</b><small>${status} · ${row.priorityScore.toFixed(1)} priority</small></span>
      </button>
    `;
  }).join("");

  list.querySelectorAll(".map-region-chip").forEach(btn => {
    btn.addEventListener("click", () => focusRegionFromMap(btn.dataset.region));
  });
}

// ── Update Dashboard ───────────────────────────────────
function updateDashboard(data) {
  const filtered = getFilteredData(data);
  const latest = getLatestRows(filtered);
  const threshold = Number(document.getElementById("thresholdSlider")?.value || -2);

  setEl("thresholdValue", `${threshold.toFixed(1)}%`);

  if (!latest.length) {
    renderAlerts([]);
    renderRankingTable([]);
    renderIndiaRiskMap([]);
    renderInsights([]);
    renderRegionDetail([]);
    renderComparePanel([]);
    return;
  }

  const alerts = latest.filter(row => row.forestPctChange <= threshold);

  setEl("criticalAlerts", alerts.length);
  const badge = document.getElementById("alertCountBadge");
  if (badge) badge.textContent = `${alerts.length} active`;

  updateKpiCards(filtered);
  renderChart(data);
  renderAlerts(alerts);
  renderRankingTable(latest);
  renderPriorityChart(filtered);
  renderScatterChart(filtered);
  renderIndiaRiskMap(filtered);
  renderInsights(filtered);
  renderRegionDetail(filtered);
  renderComparePanel(filtered);
}

// ── Alerts ─────────────────────────────────────────────
function renderAlerts(alerts) {
  const container = document.getElementById("alertsContainer");
  if (!container) return;

  container.innerHTML = "";

  if (!alerts.length) {
    container.innerHTML = `<p class="no-alerts">✅ No critical alerts for the current threshold. Try adjusting the slider to detect smaller forest-cover changes.</p>`;
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
  if (!tbody) return;

  tbody.innerHTML = "";

  const sorted = [...rows].sort((a, b) => b.priorityScore - a.priorityScore);
  const maxScore = Math.max(...sorted.map(row => row.priorityScore), 1);

  sorted.forEach((row, index) => {
    const status = getStatus(row.priorityScore);
    const forestClass = row.forestPctChange < 0 ? "change-neg" : row.forestPctChange > 0 ? "change-pos" : "change-neu";
    const bioClass = row.bioPctChange < 0 ? "change-neg" : row.bioPctChange > 0 ? "change-pos" : "change-neu";
    const barWidth = ((row.priorityScore / maxScore) * 100).toFixed(1);
    const barColor = getStatusColor(row.priorityScore);

    const tr = document.createElement("tr");
    tr.dataset.region = row.region.toLowerCase();
    if (index < 3) tr.classList.add(`rank-top-${index + 1}`);

    tr.innerHTML = `
      <td><span class="rank-num">#${index + 1}</span></td>
      <td>${getRankMedal(index)} ${row.region}</td>
      <td>${row.year}</td>
      <td class="${forestClass}">${row.forestPctChange.toFixed(2)}%</td>
      <td class="${bioClass}">${row.bioPctChange.toFixed(2)}%</td>
      <td>${row.species_count || "—"}</td>
      <td>
        <div class="sparkbar-wrap">
          <span class="priority-val">${row.priorityScore.toFixed(2)}</span>
          <div class="sparkbar-track">
            <div class="sparkbar-fill" style="width:${barWidth}%;background:${barColor}"></div>
          </div>
        </div>
      </td>
      <td><span class="status-${status.toLowerCase()}">${status}</span></td>
    `;

    tbody.appendChild(tr);
  });

  applyTableSearch();
}

function setupTableSearch() {
  const input = document.getElementById("tableSearch");
  if (!input) return;
  input.addEventListener("input", applyTableSearch);
}

function applyTableSearch() {
  const input = document.getElementById("tableSearch");
  const query = input ? input.value.toLowerCase() : "";

  document.querySelectorAll("#rankingTableBody tr").forEach(tr => {
    tr.style.display = tr.dataset.region.includes(query) ? "" : "none";
  });
}

// ── Insights ───────────────────────────────────────────
function renderInsights(data) {
  const list = document.getElementById("insightList");
  if (!list) return;

  list.innerHTML = "";
  const latest = getLatestRows(data);

  if (!latest.length) {
    list.innerHTML = `<li class="insight-loading">No data available for the selected filters.</li>`;
    return;
  }

  const worst = latest.reduce((m, r) => r.forestPctChange < m.forestPctChange ? r : m, latest[0]);
  const bestBio = latest.reduce((m, r) => r.biodiversity_index > m.biodiversity_index ? r : m, latest[0]);
  const highPriority = latest.reduce((m, r) => r.priorityScore > m.priorityScore ? r : m, latest[0]);
  const stable = latest.reduce((m, r) => r.priorityScore < m.priorityScore ? r : m, latest[0]);
  const critical = latest.filter(r => r.priorityScore >= 10).length;
  const avgLoss = latest.reduce((sum, r) => sum + r.forestPctChange, 0) / latest.length;

  const insights = [
    `🌲 <b>${worst.region}</b> has the worst forest change at <b>${worst.forestPctChange.toFixed(2)}%</b> — ${getRecommendation(worst.priorityScore)}.`,
    `🎯 <b>${highPriority.region}</b> leads with the highest priority score of <b>${highPriority.priorityScore.toFixed(2)}</b>.`,
    `🦋 <b>${bestBio.region}</b> has the best biodiversity index at <b>${bestBio.biodiversity_index.toFixed(1)}</b>.`,
    `🚨 <b>${critical}</b> region${critical !== 1 ? "s are" : " is"} currently in <b>critical</b> condition.`,
    `📊 Average forest change across selected regions: <b>${avgLoss.toFixed(2)}%</b>.`,
    `✅ <b>${stable.region}</b> is the most stable region with a priority score of <b>${stable.priorityScore.toFixed(2)}</b>.`
  ];

  insights.forEach((text, index) => {
    const li = document.createElement("li");
    li.innerHTML = text;
    li.style.animationDelay = `${index * 0.07}s`;
    list.appendChild(li);
  });
}

// ── Region Detail Panel ────────────────────────────────
function renderRegionDetail(data) {
  const grid = document.getElementById("regionDetailGrid");
  const subtitle = document.getElementById("regionDetailSubtitle");
  if (!grid) return;

  const selectedRegion = document.getElementById("regionFilter")?.value || "all";
  const latest = getLatestRows(data);

  let selectedRow = null;
  if (selectedRegion !== "all") {
    selectedRow = latest.find(row => row.region === selectedRegion);
  } else {
    selectedRow = latest.sort((a, b) => b.priorityScore - a.priorityScore)[0];
  }

  if (!selectedRow) {
    grid.innerHTML = `<div class="detail-empty">No region data available for the selected filters.</div>`;
    if (subtitle) subtitle.textContent = "No selected region data";
    return;
  }

  const status = getStatus(selectedRow.priorityScore);
  if (subtitle) {
    subtitle.textContent = selectedRegion === "all"
      ? `Showing highest-priority region: ${selectedRow.region}`
      : `Detailed indicators for ${selectedRow.region}`;
  }

  grid.innerHTML = `
    <div class="detail-card-mini">
      <span class="detail-label">Region</span>
      <strong>${selectedRow.region}</strong>
    </div>
    <div class="detail-card-mini">
      <span class="detail-label">Latest Forest Area</span>
      <strong>${Number(selectedRow.forest_area).toLocaleString()} km²</strong>
    </div>
    <div class="detail-card-mini">
      <span class="detail-label">Biodiversity Index</span>
      <strong>${selectedRow.biodiversity_index.toFixed(1)}</strong>
    </div>
    <div class="detail-card-mini">
      <span class="detail-label">Species Count</span>
      <strong>${selectedRow.species_count || "—"}</strong>
    </div>
    <div class="detail-card-mini">
      <span class="detail-label">Forest Change</span>
      <strong class="${selectedRow.forestPctChange < 0 ? "change-neg" : "change-pos"}">${selectedRow.forestPctChange.toFixed(2)}%</strong>
    </div>
    <div class="detail-card-mini">
      <span class="detail-label">Priority Score</span>
      <strong>${selectedRow.priorityScore.toFixed(2)}</strong>
    </div>
    <div class="detail-card-wide">
      <span class="status-${status.toLowerCase()}">${status}</span>
      <p>${getRecommendation(selectedRow.priorityScore)} This recommendation is based on forest change, biodiversity change, and current biodiversity condition.</p>
    </div>
  `;
}


// ── Region Comparison ──────────────────────────────────
function renderComparePanel(data) {
  const out = document.getElementById("compareOutput");
  const aSelect = document.getElementById("compareRegionA");
  const bSelect = document.getElementById("compareRegionB");
  if (!out || !aSelect || !bSelect) return;

  // Comparison intentionally ignores the single-region filter so users can still compare any two regions while exploring a selected region. It respects the year range.
  const comparisonPool = getYearFilteredData(window.dashboardData || data || []);
  const latest = getLatestRows(comparisonPool);
  const a = latest.find(row => row.region === aSelect.value);
  const b = latest.find(row => row.region === bSelect.value);

  if (!a || !b) {
    out.innerHTML = `<div class="detail-empty">Choose two regions available in the current filters.</div>`;
    return;
  }

  const winner = a.priorityScore === b.priorityScore
    ? "Both regions show similar urgency."
    : `${a.priorityScore > b.priorityScore ? a.region : b.region} needs higher attention based on priority score.`;

  out.innerHTML = `
    ${renderCompareRegion(a, "A")}
    <div class="compare-verdict">
      <span>Recommendation</span>
      <strong>${winner}</strong>
      <p>${getRecommendation(Math.max(a.priorityScore, b.priorityScore))}.</p>
    </div>
    ${renderCompareRegion(b, "B")}
  `;
}

function renderCompareRegion(row, label) {
  const status = getStatus(row.priorityScore);
  return `
    <div class="compare-region-card compare-${status.toLowerCase()}">
      <div class="compare-tag">Region ${label}</div>
      <h3>${row.region}</h3>
      <span class="status-${status.toLowerCase()}">${status}</span>
      <div class="compare-metrics-grid">
        <div><span>Forest Area</span><b>${Number(row.forest_area).toLocaleString()} km²</b></div>
        <div><span>Forest Δ</span><b class="${row.forestPctChange < 0 ? "change-neg" : "change-pos"}">${row.forestPctChange.toFixed(2)}%</b></div>
        <div><span>Biodiversity</span><b>${row.biodiversity_index.toFixed(1)}</b></div>
        <div><span>Species</span><b>${row.species_count || "—"}</b></div>
        <div><span>Priority</span><b>${row.priorityScore.toFixed(2)}</b></div>
      </div>
    </div>
  `;
}

// ── Exportable Decision Summary ───────────────────────
function buildDecisionSummary() {
  const filtered = getFilteredData(window.dashboardData || []);
  const latest = getLatestRows(filtered);
  if (!latest.length) return "No dashboard data is available for the selected filters.";

  const top = [...latest].sort((a, b) => b.priorityScore - a.priorityScore)[0];
  const worst = [...latest].sort((a, b) => a.forestPctChange - b.forestPctChange)[0];
  const critical = latest.filter(row => getStatus(row.priorityScore) === "Critical").length;
  const warning = latest.filter(row => getStatus(row.priorityScore) === "Warning").length;
  const stable = latest.filter(row => getStatus(row.priorityScore) === "Stable").length;
  const avgLoss = latest.reduce((sum, row) => sum + row.forestPctChange, 0) / latest.length;

  return `GreenShield Conservation Summary\n\nSelected regions: ${latest.length}\nCritical: ${critical} | Warning: ${warning} | Stable: ${stable}\nAverage forest change: ${avgLoss.toFixed(2)}%\nHighest priority region: ${top.region} (${top.priorityScore.toFixed(2)})\nWorst recent forest change: ${worst.region} (${worst.forestPctChange.toFixed(2)}%)\n\nRecommended action: ${getRecommendation(top.priorityScore)}.\n\nThis summary is generated from the current dashboard filters using forest change, biodiversity change, and current biodiversity condition.`;
}

function updateDecisionSummary() {
  const el = document.getElementById("decisionSummaryText");
  if (!el) return;
  el.textContent = buildDecisionSummary();
}

function downloadDecisionSummary() {
  const text = buildDecisionSummary();
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "greenshield-conservation-summary.txt";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ── Reset ──────────────────────────────────────────────
function resetFilters() {
  setElValue("thresholdSlider", "-2");
  setElValue("metricSelector", "forest_area");
  setElValue("regionFilter", "all");
  setElValue("chartTypeSelector", "line");
  setElValue("regionScopeSelector", "top5");

  const years = [...new Set(window.dashboardData.map(row => row.year))].sort((a, b) => a - b);
  setElValue("startYearSelector", String(years[0]));
  setElValue("endYearSelector", String(years[years.length - 1]));

  const search = document.getElementById("tableSearch");
  if (search) search.value = "";

  populateCompareSelectors(window.dashboardData);
  updateDashboard(window.dashboardData);
  updateDecisionSummary();
}

function setElValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

// ── Status / Recommendations ───────────────────────────
function getStatus(score) {
  if (score >= 10) return "Critical";
  if (score >= 6) return "Warning";
  return "Stable";
}

function getStatusColor(score) {
  if (score >= 10) return "#e53e3e";
  if (score >= 6) return "#f6ad55";
  return "#38b2ac";
}

function getRecommendation(score) {
  const status = getStatus(score);
  if (status === "Critical") return "Immediate conservation intervention is recommended";
  if (status === "Warning") return "Monitor closely and prepare preventive action";
  return "Maintain current protection and continue monitoring";
}

function getRankMedal(index) {
  if (index === 0) return "🥇";
  if (index === 1) return "🥈";
  if (index === 2) return "🥉";
  return "";
}

// ── Chart Helpers ──────────────────────────────────────
function forestTooltip(callbacks = {}) {
  return {
    backgroundColor: "rgba(10,31,15,0.95)",
    borderColor: "rgba(86,224,126,0.3)",
    borderWidth: 1,
    titleColor: "#56e07e",
    bodyColor: "#e8f5e0",
    padding: 12,
    callbacks
  };
}

function darkAxis(title) {
  return {
    title: { display: true, text: title, color: "#b8d8b7", font: { size: 11 } },
    ticks: { color: "#b8d8b7", font: { family: "'DM Mono'", size: 11 } },
    grid: { color: "rgba(86,224,126,0.06)" }
  };
}

function darkScales(yTitle, hideXGrid = false) {
  return {
    x: {
      ticks: { color: "#b8d8b7", font: { family: "'DM Sans'", size: 10 }, maxRotation: 40 },
      grid: { display: hideXGrid ? false : true, color: "rgba(86,224,126,0.06)" }
    },
    y: darkAxis(yTitle)
  };
}

function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function hideLoadingOverlay() {
  const overlay = document.getElementById("loadingOverlay");
  if (!overlay) return;
  overlay.classList.add("hidden");
  setTimeout(() => overlay.remove(), 450);
}

// ── Event Listeners ────────────────────────────────────
document.getElementById("thresholdSlider")?.addEventListener("input", () => updateDashboard(window.dashboardData));
document.getElementById("regionFilter")?.addEventListener("change", () => updateDashboard(window.dashboardData));
document.getElementById("metricSelector")?.addEventListener("change", () => updateDashboard(window.dashboardData));
document.getElementById("chartTypeSelector")?.addEventListener("change", () => updateDashboard(window.dashboardData));
document.getElementById("regionScopeSelector")?.addEventListener("change", () => updateDashboard(window.dashboardData));
document.getElementById("startYearSelector")?.addEventListener("change", () => updateDashboard(window.dashboardData));
document.getElementById("endYearSelector")?.addEventListener("change", () => updateDashboard(window.dashboardData));
document.getElementById("resetFilters")?.addEventListener("click", resetFilters);

document.getElementById("compareRegionA")?.addEventListener("change", () => renderComparePanel(getFilteredData(window.dashboardData)));
document.getElementById("compareRegionB")?.addEventListener("change", () => renderComparePanel(getFilteredData(window.dashboardData)));
document.getElementById("generateSummary")?.addEventListener("click", updateDecisionSummary);
document.getElementById("downloadSummary")?.addEventListener("click", downloadDecisionSummary);
