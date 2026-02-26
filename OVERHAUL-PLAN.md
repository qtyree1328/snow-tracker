# Snow Tracker Overhaul Plan

## Philosophy
**Data first.** Understand what each dataset can actually show, interact with it, see real values. Then figure out which datasets answer which questions, and build products from there.

## Phase 1: Data Methodology Dashboard (PRIORITY)

### Goal
For every dataset we have access to, build an interactive section with:
1. **What it is** — source, resolution, coverage, bands, update frequency
2. **Demo map** — interactive MapLibre map showing real data, click-to-query values
3. **Sample statistics** — what the data looks like numerically (histograms, time series)
4. **What questions it can answer** — practical applications

### Datasets to Cover

| # | Dataset | Source | Resolution | Coverage | Key Bands |
|---|---------|--------|-----------|----------|-----------|
| 1 | **SNODAS** | NOAA/NWS | 1km | CONUS | SWE, Snow Depth |
| 2 | **Daymet** | NASA/ORNL | 1km | CONUS+Canada | Precipitation, SWE |
| 3 | **ERA5-Land** | ECMWF/Copernicus | 9km | Global | Snowfall, Snow Depth, Snow Cover |
| 4 | **MODIS Snow Cover** | NASA | 500m | Global | NDSI Snow Cover, Snow Days |
| 5 | **SNOTEL** | USDA NRCS | Point (800+ stations) | Western US mountains | SWE, Precip, Temp |
| 6 | **Gridmet** | U of Idaho | 4km | CONUS | Precip, Temp (context) |

Each section = description + live map + click-to-query + sample figures.

### Demo Map Per Dataset
- MapLibre GL map with the dataset rendered as tiles (GEE proxy or PMTiles)
- Click anywhere → popup showing actual values at that point
- Time slider where applicable (monthly/annual)
- Basic stats panel (min, max, mean for visible extent)

## Phase 2: Question Development

### The Questions (US-only)

#### Q1: Where has the most snowfall RIGHT NOW?
- **Data:** SNODAS (daily, 1km) — current SWE + Snow Depth
- **Product:** Live map of current conditions, updated daily
- **Stats needed:** Current SWE/depth, percentile rank vs historical

#### Q2: Timelapse of snowfall this season
- **Data:** SNODAS daily → weekly composites for current water year (Oct 1 → now)
- **Product:** Animated map showing snow accumulation through the season
- **Stats needed:** Weekly SWE change, cumulative snowfall

#### Q3: How this year compares to previous years
- **Data:** SNODAS or Daymet — current year SWE vs climatological mean
- **Product:** Anomaly map (above/below normal), time series showing current year vs mean curve
- **Stats needed:** Z-score or percentile at each grid cell, mean ± std envelope

#### Q4: Timelapse of snowfall anomaly over time
- **Data:** Daymet (long record, 1980-present) — annual snowfall vs period mean
- **Product:** Animated anomaly map showing which years/areas were above/below normal
- **Stats needed:** Running anomaly, cumulative departure from mean

#### Q5: Historical snowfall — 5/10/20 year averages relative to other locations
- **Data:** Daymet — compute mean annual snowfall for last 5, 10, 20 years
- **Product:** Map with toggle for time period, click for rankings vs rest of US
- **Stats needed:** Mean, percentile rank, trend within period

#### Q6: When does peak snowfall occur (by month)?
- **Data:** SNODAS or Daymet — for each pixel, which month has max SWE historically
- **Product:** Map colored by peak month (e.g., Jan=blue, Feb=teal, Mar=green, Apr=yellow)
- **Stats needed:** Modal peak month, distribution of peak timing

#### Q7: How has peak season shifted over time?
- **Data:** Daymet (long record) — trend in peak SWE date over 5/10/20 years
- **Product:** Map showing days earlier/later per decade, trend significance
- **Stats needed:** Linear regression slope on peak date, p-value, Mann-Kendall test

#### Q8: (Future questions TBD from data exploration)

### For Each Question
Document in Data Methodology:
1. **Statistical approach** — exact formula/method
2. **Dataset choice** — why this dataset for this question
3. **Figures** — sample charts showing what the output looks like
4. **Practical interpretation** — what the map tells you
5. **Limitations** — what it can't show

## Phase 3: Build Products
Only after Phase 1 and 2 are solid. Products = polished interactive maps answering the questions.

---

## Sub-Agent Assignments

### Agent 1: Dataset Research & Documentation
- For each of the 6 datasets: detailed specs, GEE collection paths, available bands, temporal range, known issues
- Write up the methodology text for each section
- Research the statistical approaches for each question
- Output: Markdown document with all methodology content

### Agent 2: GEE Data Exploration
- For each dataset: write Python/GEE scripts to query sample data
- Test click-to-query capability (what does a point query return?)
- Generate sample statistics and figures
- Test what time ranges are available, data quality issues
- Output: Working GEE queries + sample data + findings

### Agent 3: Interactive Demo Map Component
- Build a reusable React component: DatasetExplorer
- MapLibre map + GEE proxy tile layer + click-to-query popup
- Time slider, band selector, basic stats panel
- One component that works for all 6 datasets with config
- Output: Working component in snow-tracker/src/
