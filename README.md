# 🌿 GreenShield Analytics

A Deforestation Alert Dashboard designed to monitor forest cover trends, detect biodiversity risks, and prioritize regions for intervention using data-driven insights.

---

## 🚀 Project Overview

GreenShield Analytics is an interactive web-based dashboard that analyzes deforestation patterns across multiple regions. It combines forest cover changes with biodiversity indicators to generate alerts and rank regions based on ecological risk.

---

## 🎯 Key Features

- 📊 Multi-line chart to visualize forest area trends over time  
- 📉 Year-over-year percentage change calculations  
- 🚨 Threshold-based alert system using interactive slider  
- 🧠 Composite priority score for risk assessment  
- 🏆 Ranked table of regions based on urgency  
- 🎛 Region filter for focused analysis  

---

## 🧠 How It Works

The dashboard processes historical forest and biodiversity data to compute:

### 1. Forest Change (%)
Measures how much forest area has increased or decreased year-over-year.

### 2. Biodiversity Change (%)
Tracks changes in biodiversity index across years.

### 3. Priority Score

The priority score combines multiple risk factors:


Priority Score =
0.5 × |Forest Change %|

0.3 × |Biodiversity Change %|
0.2 × (100 − Biodiversity Index)

Higher scores indicate regions requiring urgent attention.

---

## 🗂 Project Structure


GreenShield-Analytics/
│
├── index.html
├── style.css
├── script.js
├── Data/
│ └── deforestation.csv
└── README.md


---

## 🛠 Tech Stack

- HTML  
- CSS  
- JavaScript  
- Chart.js (for data visualization)  
- PapaParse (for CSV parsing)  

---

## 📊 Dataset

The dataset contains:
- Year-wise forest area data  
- Biodiversity index values  
- Multiple geographic regions  

Some preprocessing and standardization were applied to ensure consistency for analysis.

---

## 💡 Design Philosophy

This project focuses on:
- Simplicity in UI  
- Clarity in data representation  
- Actionable insights instead of raw data  

---

## 🔮 Future Improvements

- Live API integration for real-time data  
- User authentication and saved dashboards  
- Advanced analytics (predictive modeling)  
- Geographic map visualization  

---

## 📌 Author

Sanskar Hande  

---

## ⭐ Acknowledgment

This project was built as part of a workshop to demonstrate data visualization, analytical thinking, and interactive dashboard design.
