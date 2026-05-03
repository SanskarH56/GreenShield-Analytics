Papa.parse("Data/deforestation.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  complete: function(results) {
    let data = results.data;

    // Remove empty rows (important)
    data = data.filter(row => row.year && row.region);

    // Group by region
    const grouped = {};

    data.forEach(row => {
      if (!grouped[row.region]) grouped[row.region] = [];
      grouped[row.region].push(row);
    });

    // Calculate % change
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
      }
    });

    // Flatten back
    const processedData = Object.values(grouped).flat();

    console.log("Processed Data:", processedData);

    // Save globally
    window.dashboardData = processedData;

    // TEMP: show regions count
    document.getElementById("totalRegions").innerText =
      Object.keys(grouped).length;
  }
});