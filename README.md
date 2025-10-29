# Smart Factory Monitoring — OEE & Downtime Aggregation Dashboard

A full-stack Industry 4.0 web application that computes, aggregates, and visualizes machine downtime and Overall Equipment Effectiveness (OEE) from raw production and status data.
This system demonstrates end-to-end IIoT data integration, from data processing (Node.js, REST API) to front-end visualization (HTML, CSS, JavaScript) — suitable for manufacturing efficiency analysis and real-time factory monitoring.

🚀 ## Features
🔹 Downtime Aggregation
  - Merge automatic (status.json) and manual (manual_status.json) logs.
  - Normalize timestamps with Day.js.
  - Resolve overlapping records (manual data prioritized).
  - Aggregate total downtime (minutes) by:
    - Equipment ID
    - Date
    - Reason
  - REST API endpoint for flexible data access:
    - /downtime → All records (CLI-style text)
    - /downtime?equipment=<id> → Filter by equipment
  - Web dashboard for real-time viewing:
    - Equipment filter & refresh controls
    - Summary panel per equipment
    - Detailed downtime table

🔹 OEE (Overall Equipment Effectiveness) Calculation
  - Parse status and production data from JSON files.
  - Compute daily metrics:
    - Availability (A) = (Running + Idle) / Total Time
    - Performance (P) = Ideal Cycle Time / Actual Cycle Time
    - Quality (Q) = (Actual – Defect) / Actual
    - OEE = A × P × Q
  - Categorize OEE values:
    - Bad, Minimum, Good, Recommended, Excellent
  - REST API Endpoints:
    - /oee → CLI-style daily OEE table
    - /oee/daily → Detailed JSON per equipment/day
    - /oee/equipment → Average OEE per equipment
    - /oee/overall → Global factory OEE summary
  - Interactive dashboard at /dashboard:
    - Equipment filter
    - Daily OEE table
    - Equipment averages
    - Overall summary

## Tech Stack
| Layer           | Technology                | Purpose                                               |
| --------------- | ------------------------- | ----------------------------------------------------- |
| **Backend**     | Node.js                   | Server-side computation and REST API                  |
|                 | Express.js                | Web framework for API routing and static file serving |
|                 | Day.js                    | Lightweight time and date manipulation                |
|                 | Chalk                     | Terminal color formatting for server logs             |
| **Frontend**    | HTML5 / CSS3 / Vanilla JS | Web dashboard interface                               |
|                 | Chart.js (optional)       | Visual OEE trend representation                       |
| **Data Format** | JSON                      | Input and output data interchange                     |
| **Protocol**    | REST API                  | For communication between backend and frontend        |
