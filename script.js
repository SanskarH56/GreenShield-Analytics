let forestChart = null;
let priorityChart = null;

const chartColors = [
  "#1b5e20",
  "#2e7d32",
  "#66bb6a",
  "#a5d6a7",
  "#00695c",
  "#26a69a",
  "#6d4c41",
  "#8d6e63",
  "#558b2f",
  "#9ccc65",
  "#33691e",
  "#43a047",
  "#00796b",
  "#795548",
  "#827717"
];

Papa.parse("Data/deforestation.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  complete: function (results) {
    let data = results.data;

    data = data.filter(row => row.year && row.region);

    const processedData = processData(data);

    window.dashboardData = processedData;
    renderPriorityChart(processedData);

    updateKpiCards(processedData);
    populateRegionFilter(processedData);
    renderChart(processedData);
    updateDashboard(processedData);
    renderInsights(processedData);
  }
});

function processData(data) {
  const grouped = {};

  data.forEach(row => {
    if (!grouped[row.region]) {
      grouped[row.region] = [];
    }

    grouped[row.region].push(row);
  });

  Object.values(grouped).forEach(rows => {
    rows.sort((a, b) => a.year - b.year);

    for (let i = 0; i < rows.length; i++) {
      if (i === 0) {
        rows[i].forestPctChange = 0;
        rows[i].bioPctChange = 0;
      } else {
        const prev = rows[i - 1];

        rows[i].forestPctChange =
          ((rows[i].forest_area - prev.forest_area) / prev.forest_area) * 100;

        rows[i].bioPctChange =
          ((rows[i].biodiversity_index - prev.biodiversity_index) / prev.biodiversity_index) * 100;
      }

      rows[i].priorityScore = calculatePriorityScore(rows[i]);
    }
  });

  return Object.values(grouped).flat();
}

function calculatePriorityScore(row) {
  return (
    Math.abs(row.forestPctChange) * 0.5 +
    Math.abs(row.bioPctChange) * 0.3 +
    (100 - row.biodiversity_index) * 0.2
  );
}

function getLatestRows(data) {
  const latestByRegion = {};

  data.forEach(row => {
    if (
      !latestByRegion[row.region] ||
      row.year > latestByRegion[row.region].year
    ) {
      latestByRegion[row.region] = row;
    }
  });

  return Object.values(latestByRegion);
}

function updateKpiCards(data) {
  const latestRows = getLatestRows(data);
  const totalRegions = new Set(data.map(row => row.region)).size;

  const worstRegion = latestRows.reduce((worst, row) => {
    return row.forestPctChange < worst.forestPctChange ? row : worst;
  }, latestRows[0]);

  document.getElementById("totalRegions").innerText = totalRegions;
  document.getElementById("worstRegion").innerText = worstRegion.region;
  document.getElementById("highestLoss").innerText =
    `${worstRegion.forestPctChange.toFixed(2)}%`;
}

function populateRegionFilter(data) {
  const regionFilter = document.getElementById("regionFilter");
  const regions = [...new Set(data.map(row => row.region))];

  regions.forEach(region => {
    const option = document.createElement("option");
    option.value = region;
    option.textContent = region;
    regionFilter.appendChild(option);
  });
}

function renderChart(data) {
  const selectedRegion = document.getElementById("regionFilter").value;
  const selectedMetric = document.getElementById("metricSelector").value;

  let chartData = data;

  if (selectedRegion !== "all") {
    chartData = data.filter(row => row.region === selectedRegion);
  }

  const metricLabels = {
    forest_area: "Forest Area (km²)",
    biodiversity_index: "Biodiversity Index",
    priorityScore: "Priority Score"
  };

  const regions = [...new Set(chartData.map(row => row.region))];
  const years = [...new Set(chartData.map(row => row.year))].sort((a, b) => a - b);

  const datasets = regions.map((region, index) => {
    const regionRows = chartData.filter(row => row.region === region);

   return {
      label: region,
      data: years.map(year => {
        const item = regionRows.find(row => row.year === year);
        return item ? item[selectedMetric] : null;
      }),
        borderColor: chartColors[index % chartColors.length],
        backgroundColor: chartColors[index % chartColors.length],
        pointRadius: 3,
        pointHoverRadius: 6,
        borderWidth: 2,
        tension: 0.3
    };
  });

  const ctx = document.getElementById("forestChart");

  if (forestChart) {
    forestChart.destroy();
  }

  forestChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: years,
      datasets: datasets
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: `${metricLabels[selectedMetric]} Over Time`
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const value = Number(context.raw).toFixed(2);
              return `${context.dataset.label}: ${value}`;
            }
          }
        }
      },
      scales: {
        y: {
          title: {
            display: true,
            text: metricLabels[selectedMetric]
          }
        },
        x: {
          title: {
            display: true,
            text: "Year"
          }
        }
      }
    }
  });
}

function renderPriorityChart(data) {
  const latestRows = getLatestRows(data);

  const sorted = [...latestRows].sort((a, b) => b.priorityScore - a.priorityScore);

  const labels = sorted.map(row => row.region);
  const values = sorted.map(row => row.priorityScore);

  const ctx = document.getElementById("priorityChart");

  if (priorityChart) {
    priorityChart.destroy();
  }

  priorityChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Priority Score",
        data: values,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: "#333",
        backgroundColor: sorted.map(row => {
            if (row.priorityScore >= 10) return "#d62828";
            if (row.priorityScore >= 6) return "#f77f00";
            return "#2a9d8f";
        })
      }]
    },
    options: {
      responsive: true,
      plugins: {
        title: {
          display: true,
          text: "Priority Score Ranking"
        }
      },
      scales: {
        y: {
          title: {
            display: true,
            text: "Priority Score"
          }
        }
      }
    }
  });
}

function updateDashboard(data) {
  const threshold = Number(document.getElementById("thresholdSlider").value);
  const selectedRegion = document.getElementById("regionFilter").value;

  document.getElementById("thresholdValue").innerText = `${threshold}%`;

  let filteredData = data;

  if (selectedRegion !== "all") {
    filteredData = data.filter(row => row.region === selectedRegion);
  }

  const latestRows = getLatestRows(filteredData);

  const alerts = latestRows.filter(row => row.forestPctChange <= threshold);

  document.getElementById("criticalAlerts").innerText = alerts.length;

  renderAlerts(alerts);
  renderRankingTable(latestRows);
  renderPriorityChart(filteredData);
  renderInsights(filteredData);
}

function renderAlerts(alerts) {
  const alertsContainer = document.getElementById("alertsContainer");

  alertsContainer.innerHTML = "";

  if (alerts.length === 0) {
    alertsContainer.innerHTML = "<p>No critical alerts for selected threshold.</p>";
    return;
  }

  alerts.forEach(row => {
    const alertDiv = document.createElement("div");
    alertDiv.className = "alert-item";

    alertDiv.innerHTML = `
      <strong>${row.region}</strong>
      <p>Forest cover changed by ${row.forestPctChange.toFixed(2)}% in ${row.year}.</p>
    `;

    alertsContainer.appendChild(alertDiv);
  });
}

function renderRankingTable(rows) {
  const tableBody = document.getElementById("rankingTableBody");

  tableBody.innerHTML = "";

  const rankedRows = [...rows].sort((a, b) => b.priorityScore - a.priorityScore);

  rankedRows.forEach((row, index) => {
    const tr = document.createElement("tr");

    const status = getStatus(row.priorityScore);

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${row.region}</td>
      <td>${row.year}</td>
      <td>${row.forestPctChange.toFixed(2)}%</td>
      <td>${row.bioPctChange.toFixed(2)}%</td>
      <td>${row.priorityScore.toFixed(2)}</td>
      <td class="status-${status.toLowerCase()}">${status}</td>
    `;

    tableBody.appendChild(tr);
  });
}

function generateInsights(data) {
  const latestRows = getLatestRows(data);

  if (latestRows.length === 0) return [];

  // 1. Worst forest loss
  const worstLoss = latestRows.reduce((min, row) =>
    row.forestPctChange < min.forestPctChange ? row : min
  );

  // 2. Highest priority
  const highestPriority = latestRows.reduce((max, row) =>
    row.priorityScore > max.priorityScore ? row : max
  );

  // 3. Count critical regions
  const criticalCount = latestRows.filter(row => row.priorityScore >= 10).length;

  // 4. Most stable region
  const stableRegion = latestRows.reduce((min, row) =>
    row.priorityScore < min.priorityScore ? row : min
  );

  return [
    `${worstLoss.region} shows the highest forest loss (${worstLoss.forestPctChange.toFixed(2)}%).`,
    `${highestPriority.region} has the highest priority score (${highestPriority.priorityScore.toFixed(2)}).`,
    `${criticalCount} region(s) are currently in critical condition.`,
    `${stableRegion.region} appears the most stable based on current metrics.`
  ];
}

function renderInsights(data) {
  const insightList = document.getElementById("insightList");
  const insights = generateInsights(data);

  insightList.innerHTML = "";

  insights.forEach(text => {
    const li = document.createElement("li");
    li.textContent = text;
    insightList.appendChild(li);
  });
}

function getStatus(score) {
  if (score >= 10) return "Critical";
  if (score >= 6) return "Warning";
  return "Stable";
}

document.getElementById("thresholdSlider").addEventListener("input", function () {
  updateDashboard(window.dashboardData);
});

document.getElementById("regionFilter").addEventListener("change", function () {
  renderChart(window.dashboardData);
  updateDashboard(window.dashboardData);
});

document.getElementById("metricSelector").addEventListener("change", function () {
  renderChart(window.dashboardData);
});