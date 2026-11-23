# Data sources (fill in with REAL sources; nothing is bundled)

| Dataset | Expected file | Columns | Candidate source | Licence / terms | Geography | Coverage | Limitations |
|---|---|---|---|---|---|---|---|
| Monthly dengue cases | `data/dengue_monthly.csv` | area, month (YYYY-MM), cases, source, retrieved_at | DGHS bulletins / dashboard (confirm what is published and its terms) | _to confirm_ | _district/division as published_ | _to fill_ | Aggregate counts only; never street-level |
| Monthly weather | `data/weather_monthly.csv` | area, month, rain_mm, temp_c, humidity_pct, source | NASA POWER (modelled/reanalysis, label as such) | _to confirm_ | _grid aggregated to the same area_ | _to fill_ | Modelled values, not station observations |

Rules: record source URL, retrieval timestamp and file checksum (the pipeline hashes both files). Missing data stays missing. If history is too short the pipeline reports INSUFFICIENT_EVIDENCE and exports nothing.
