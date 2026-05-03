let forestChart = null;

Papa.parse("Data/deforestation.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  complete: function (results) {
    let data = results.data;

    data = data.filter(row => row.year && row.region);

    const processedData = processData(data);

    window.dashboardData = processedData;

    updateKpiCards(processedData);
    populateRegionFilter(processedData);
    renderChart(processedData);
    updateDashboard(processedData);
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

  const datasets = regions.map(region => {
    const regionRows = chartData.filter(row => row.region === region);

    return {
      label: region,
      data: years.map(year => {
        const item = regionRows.find(row => row.year === year);
        return item ? item[selectedMetric] : null;
      }),
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