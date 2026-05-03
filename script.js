// Load CSV using PapaParse
Papa.parse("Data/deforestation.csv", {
  download: true,
  header: true,
  dynamicTyping: true,
  complete: function(results) {
    const data = results.data;

    console.log("Loaded Data:", data);

    // TEMP: show in UI so you know it works
    document.getElementById("totalRegions").innerText =
      new Set(data.map(row => row.region)).size;

    // Store globally for next steps
    window.dashboardData = data;
  }
});