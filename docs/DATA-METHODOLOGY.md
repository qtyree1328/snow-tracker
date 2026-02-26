# Snow Tracker — Data & Methodology Reference

> **Version:** 1.0 · **Date:** 2026-02-25 · **Author:** Clawd (AI Research Agent)
>
> This document specifies every dataset, band, formula, and visualization approach used in the Snow Tracker dashboard. It is intended to be both a developer reference and a scientific methodology section.

---

## Table of Contents

1. [Dataset Catalog](#1-dataset-catalog)
   - 1.1 SNODAS
   - 1.2 Daymet V4
   - 1.3 ERA5-Land
   - 1.4 MODIS Snow Cover (MOD10A1)
   - 1.5 SNOTEL
   - 1.6 gridMET
2. [Question → Methodology Mapping](#2-question--methodology-mapping)
   - Q1: Current Snowfall
   - Q2: Season Timelapse
   - Q3: Year-over-Year Anomaly
   - Q4: Multi-Year Anomaly Timelapse
   - Q5: Historical Averages & Rankings
   - Q6: Peak Snowfall Timing
   - Q7: Peak Season Shift
3. [Cross-Cutting Technical Notes](#3-cross-cutting-technical-notes)

---

## 1. Dataset Catalog

### 1.1 SNODAS (Snow Data Assimilation System)

| Property | Value |
|---|---|
| **Full Name** | Snow Data Assimilation System (SNODAS) |
| **Provider** | NOAA / National Operational Hydrologic Remote Sensing Center (NOHRSC) |
| **GEE Collection** | `projects/earthengine-legacy/assets/projects/climate-engine/snodas/daily` |
| **Spatial Resolution** | 1 km (~1/120°) |
| **Temporal Resolution** | Daily |
| **Coverage** | Conterminous United States (CONUS) |
| **Date Range** | 2003-10-01 to present |
| **Update Frequency** | Daily, ~1 day lag |

#### Bands

| Band Name | Units | Description |
|---|---|---|
| `SWE` | meters | Snow Water Equivalent — the depth of water if all snow melted |
| `Snow_Depth` | meters | Physical depth of the snowpack |

#### Data Format

- Pixel values are in **meters** (float). A `SWE` value of `0.15` means 150 mm of water equivalent. A `Snow_Depth` value of `0.5` means 50 cm of snow on the ground.
- No scale factor needed (scale = 1.0).
- NoData / masked pixels indicate no snow or out-of-domain.

#### Known Limitations

- **Not observation-only:** SNODAS is a *modeled* product that assimilates satellite, ground, and NWP data. It can disagree with point measurements.
- **CONUS only:** No Alaska, Hawaii, or global coverage in GEE version.
- **Mountain bias:** Complex terrain (steep valleys, wind-loaded slopes) can produce SWE under- or over-estimates at 1 km resolution.
- **Data gaps:** Occasional 1-2 day gaps exist, especially in early record (2003-2005).
- **Starts 2003:** No climatological baseline before that date within this dataset alone.

#### Best Use Case

Real-time and recent-historical SWE/snow depth mapping across CONUS. Best for answering "where is snow on the ground right now?" and "how much water is stored in the snowpack?"

---

### 1.2 Daymet V4

| Property | Value |
|---|---|
| **Full Name** | Daymet V4: Daily Surface Weather and Climatological Summaries |
| **Provider** | NASA / Oak Ridge National Laboratory (ORNL) DAAC |
| **GEE Collection** | `NASA/ORNL/DAYMET_V4` |
| **Spatial Resolution** | 1 km |
| **Temporal Resolution** | Daily |
| **Coverage** | Continental North America, Hawaii, Puerto Rico |
| **Date Range** | 1980-01-01 to ~2024 (updated annually, ~6-12 month lag) |
| **Update Frequency** | Annual release; V4 R1 covers through 2021+, newer years added with each release |

#### Bands (Snow-Relevant)

| Band Name | Units | Description |
|---|---|---|
| `swe` | kg/m² (= mm water equivalent) | Snow Water Equivalent at each pixel |
| `prcp` | mm | Daily total precipitation (all forms, water-equivalent) |
| `tmax` | °C | Daily maximum 2 m air temperature |
| `tmin` | °C | Daily minimum 2 m air temperature |
| `dayl` | seconds | Duration of daylight |
| `srad` | W/m² | Shortwave radiation flux density |
| `vp` | Pa | Water vapor pressure |

#### Data Format

- `swe`: kg/m² — numerically equivalent to mm of water. A value of `200` = 200 mm SWE.
- `prcp`: mm/day. A value of `25` means 25 mm of precipitation fell that day.
- `tmax`/`tmin`: degrees Celsius. Direct reading.

#### Known Limitations

- **Not real-time:** Annual release cycle means current-season data is unavailable. The latest year is typically 1-2 years behind.
- **Interpolated product:** Station-based interpolation can miss localized snowfall events, especially in data-sparse regions.
- **SWE is modeled:** Daymet SWE is derived from a simple snow model driven by precip/temp — not direct measurement.
- **V4 improvements:** Corrected timing biases and high-elevation temperature issues from V3, but some mountain biases persist.

#### Best Use Case

Long-term climatological analysis (1980–present). Ideal for computing 20-year, 30-year, or full-record normals of snowfall, SWE, and temperature. The deep time series is its primary advantage.

---

### 1.3 ERA5-Land (ECMWF Reanalysis)

| Property | Value |
|---|---|
| **Full Name** | ERA5-Land Reanalysis |
| **Provider** | ECMWF (European Centre for Medium-Range Weather Forecasts) |
| **GEE Collections** | `ECMWF/ERA5_LAND/DAILY_AGGR` (daily) · `ECMWF/ERA5_LAND/MONTHLY_AGGR` (monthly) |
| **Spatial Resolution** | ~9 km (0.1° × 0.1°) — pixel size 11,132 m in GEE |
| **Temporal Resolution** | Daily (daily aggregate) / Monthly |
| **Coverage** | Global |
| **Date Range** | 1950-01-01 to ~3 months from real-time |
| **Update Frequency** | ~Monthly additions with ~3 month lag |

#### Snow-Relevant Bands (Daily Aggregate)

| Band Name | Units | Description |
|---|---|---|
| `snow_depth` | m | Grid-box average snow thickness on ground (excl. canopy) |
| `snow_depth_water_equivalent` | m of water equivalent | SWE — depth of water if snow melted, spread over grid box |
| `snowfall_sum` | m of water equivalent | Accumulated snowfall for the day |
| `snowmelt_sum` | m of water equivalent | Accumulated snowmelt for the day |
| `snow_cover` | fraction (0–1) | Fraction of grid cell covered by snow |
| `snow_density` | kg/m³ | Mass of snow per cubic meter in snow layer |
| `snow_albedo` | fraction (0–1) | Fraction of solar radiation reflected by snow |
| `temperature_of_snow_layer` | K | Temperature of the snow layer |
| `temperature_2m` | K | 2-meter air temperature (daily average) |

#### Data Format

- `snowfall_sum`: meters of water equivalent. A value of `0.025` = 25 mm of snowfall (water equivalent) in one day.
- `snow_depth`: meters. A value of `0.3` = 30 cm snow depth.
- `snow_cover`: 0–1 fraction. `0.75` = 75% of grid cell covered.
- Flow bands (with `_sum` suffix) are daily totals. Non-flow bands are daily averages.
- **Temperatures are in Kelvin.** Subtract 273.15 for °C.

#### Known Limitations

- **Coarse resolution (9 km):** Misses fine-scale snow features — mountain valleys, urban heat islands, lake-effect bands.
- **Reanalysis artifacts:** Occasional negative snowfall values due to GRIB packing precision issues. Clamp to 0 in processing.
- **3-month lag:** Not suitable for real-time ("right now") applications.
- **Model-based:** Snow physics are modeled, not directly observed. Can diverge from ground truth in complex terrain.
- **Known band swap bug:** Evapotranspiration sub-components are swapped (documented by ECMWF). Does not affect snow bands.

#### Best Use Case

Long-term global snow climatology (1950–present). Best for multi-decadal trend analysis, global comparisons, and gap-filling where other datasets don't cover. The 75+ year record is unmatched.

---

### 1.4 MODIS Snow Cover (MOD10A1)

| Property | Value |
|---|---|
| **Full Name** | MOD10A1.061 Terra Snow Cover Daily Global 500m |
| **Provider** | NASA NSIDC DAAC |
| **GEE Collection** | `MODIS/061/MOD10A1` |
| **Spatial Resolution** | 500 m |
| **Temporal Resolution** | Daily |
| **Coverage** | Global |
| **Date Range** | 2000-02-24 to present |
| **Update Frequency** | Daily, ~1-2 day lag |

#### Bands

| Band Name | Units | Description |
|---|---|---|
| `NDSI_Snow_Cover` | % (0–100) | Normalized Difference Snow Index snow cover percentage |
| `NDSI` | dimensionless (0–10000, scale 0.0001) | Raw NDSI value before screening |
| `Snow_Albedo_Daily_Tile` | % (1–100) | Snow albedo percentage |
| `NDSI_Snow_Cover_Basic_QA` | bitmask | Quality flag (0=Best, 1=Good, 2=OK, 211=Night, 239=Ocean) |
| `NDSI_Snow_Cover_Algorithm_Flags_QA` | bitmask | Detailed algorithm flags |
| `NDSI_Snow_Cover_Class` | categorical | Class values for special cases (cloud=250, night=211, water=237) |

#### Data Format

- `NDSI_Snow_Cover`: integer 0–100. A value of `65` means 65% NDSI snow cover at that pixel.
- Values >100 are class codes (cloud, night, ocean, etc.) — these are separated into `NDSI_Snow_Cover_Class`.
- `NDSI`: raw index × 10000. Divide by 10000 for true NDSI value (-1 to +1 range, but stored 0–10000).
- **This is snow COVER (binary/fractional), NOT snow DEPTH or SWE.** It tells you *where* snow is, not *how much*.

#### Known Limitations

- **Cloud contamination:** Clouds are the #1 issue. MODIS is optical — no data under clouds. Cloud fraction can exceed 50% in winter storm regions.
- **No depth or SWE:** Only detects presence/absence of snow, not quantity.
- **Forest canopy:** Dense forest cover obscures underlying snow, causing underestimation. NDSI threshold may miss thin snow under canopy.
- **Night data gaps:** No valid data in nighttime overpasses (polar winter = extended gaps).
- **Aqua complement:** `MODIS/061/MYD10A1` (Aqua satellite) provides an afternoon overpass for gap-filling.

#### Best Use Case

High-resolution spatial extent of snow cover. Best for answering "where is snow on the ground?" with the finest spatial detail (500 m). Excellent for snow cover area time series and for validating/masking other datasets.

---

### 1.5 SNOTEL (SNOwpack TELemetry)

| Property | Value |
|---|---|
| **Full Name** | SNOTEL (SNOwpack TELemetry) Network |
| **Provider** | USDA Natural Resources Conservation Service (NRCS) |
| **Access** | REST API: `https://wcc.sc.egov.usda.gov/reportGenerator/` |
| **Spatial Resolution** | Point stations (~880 sites) |
| **Temporal Resolution** | Daily (hourly available for some parameters) |
| **Coverage** | Western US mountain regions (11 western states + Alaska) |
| **Date Range** | Varies by station; many start 1980s, some 1960s |
| **Update Frequency** | Real-time (hourly telemetry) |

#### Parameters (via API)

| Parameter Code | Units | Description |
|---|---|---|
| `WTEQ` | inches | Snow Water Equivalent (pillow measurement) |
| `SNWD` | inches | Snow Depth (ultrasonic sensor) |
| `PREC` | inches | Accumulated precipitation |
| `PRCP` | inches | Precipitation increment (daily) |
| `TMAX` | °F | Maximum air temperature |
| `TMIN` | °F | Minimum air temperature |
| `TAVG` | °F | Average air temperature |

#### API Access Pattern

```
https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customSingleStationReport/daily/
{station_triplet}/
{start_date},{end_date}/
WTEQ::value,SNWD::value,PREC::value,TMAX::value,TMIN::value
```

Example station triplet: `1050:CO:SNTL` (Copper Mountain, CO).

To get all stations: query the station metadata endpoint or use the AWDB (Air-Water Database) web service.

#### Data Format

- **Units are imperial** (inches, °F). Convert: 1 inch = 25.4 mm; °F to °C = (°F − 32) × 5/9.
- `WTEQ`: direct snow pillow measurement. The gold standard for SWE validation.
- Missing values indicated by empty cells or special flags.

#### Known Limitations

- **Point data only:** ~880 stations cannot represent continuous spatial fields. Interpolation required for mapping.
- **Western US bias:** No stations east of the Rockies. Zero coverage for Appalachians, Great Lakes, Northeast.
- **Elevation bias:** Stations are placed at mid-to-high elevations in key watersheds. Valley floors and extreme summits are under-represented.
- **Pillow errors:** Snow bridging, ice layers, and vegetation can affect SWE pillow readings (±10-15% error).
- **Wind effects:** Snow depth sensors can be affected by wind redistribution near the sensor.

#### Best Use Case

Ground-truth validation of gridded products. Gold-standard point SWE measurements for calibrating SNODAS, Daymet, and ERA5-Land. Essential for time-series analysis at specific mountain locations.

---

### 1.6 gridMET

| Property | Value |
|---|---|
| **Full Name** | GRIDMET: University of Idaho Gridded Surface Meteorological Dataset |
| **Provider** | University of Idaho (John Abatzoglou) / UC Merced |
| **GEE Collection** | `IDAHO_EPSCOR/GRIDMET` |
| **Spatial Resolution** | ~4 km (1/24°) |
| **Temporal Resolution** | Daily |
| **Coverage** | Conterminous United States (CONUS) |
| **Date Range** | 1979-01-01 to near-present |
| **Update Frequency** | Daily; status progression: early → provisional → permanent (~2 months) |

#### Snow-Relevant Bands

| Band Name | Units | Description |
|---|---|---|
| `pr` | mm (daily total) | Precipitation amount (all phases) |
| `tmmn` | K | Daily minimum temperature |
| `tmmx` | K | Daily maximum temperature |
| `srad` | W/m² | Surface downward shortwave radiation |
| `rmax` | % | Maximum relative humidity |
| `rmin` | % | Minimum relative humidity |
| `vs` | m/s | Wind velocity at 10 m |
| `sph` | mass fraction | Specific humidity |

#### Data Format

- `pr`: mm/day. A value of `15` = 15 mm precip.
- `tmmn`/`tmmx`: **Kelvin**. Subtract 273.15 for °C.
- No direct snow bands — snowfall must be derived from precipitation + temperature thresholds.

#### Known Limitations

- **No snow-specific bands:** Must infer snowfall from precip when temperature is below a threshold (e.g., `tmmx < 275.15 K` or `tavg < 273.65 K`).
- **CONUS only.**
- **Blended product:** Combines PRISM spatial patterns with NLDAS temporal patterns. Edge artifacts possible near coast and international borders.
- **Provisional data:** Recent data may be revised. Check `status` property.

#### Best Use Case

Context dataset for temperature and precipitation. Best for deriving snowfall proxies when direct snow observations aren't available, and for providing meteorological context (wind, humidity, radiation) to snow analyses.

---

## 2. Question → Methodology Mapping

### Q1: Where has the most snowfall RIGHT NOW?

#### Intent

Show a near-real-time map of current snowpack conditions across CONUS.

#### Primary Dataset: **SNODAS** (`SWE`, `Snow_Depth`)

**Why:** SNODAS is the only dataset with daily, 1 km, near-real-time SWE and snow depth for CONUS. Its 1-day lag makes it the closest to "right now."

#### Supporting Dataset: **MODIS MOD10A1** (`NDSI_Snow_Cover`)

**Why:** Provides independent 500 m optical confirmation of where snow exists. Use as a validation layer or cloud-free composite.

#### Methodology

1. **Retrieve the most recent SNODAS image:**
   ```javascript
   var latest = ee.ImageCollection('projects/earthengine-legacy/assets/projects/climate-engine/snodas/daily')
     .sort('system:time_start', false).first();
   ```

2. **Select `SWE` band.** Values in meters. Multiply by 1000 for mm, or by 39.37 for inches.

3. **Classify into bins for display:**
   | SWE (mm) | Color | Label |
   |---|---|---|
   | 0 | transparent | No snow |
   | 1–50 | `#dcedc8` | Trace |
   | 50–150 | `#a5d6a7` | Light |
   | 150–300 | `#42a5f5` | Moderate |
   | 300–600 | `#1565c0` | Heavy |
   | 600–1000 | `#6a1b9a` | Very Heavy |
   | >1000 | `#e91e63` | Extreme |

4. **Overlay MODIS snow cover** as a semi-transparent layer to show extent where SNODAS may miss thin snow.

5. **For "most snowfall" ranking:** Compute zonal statistics by state/HUC watershed to rank regions.

#### Output Map

- **Choropleth raster** over CONUS with diverging blue-purple palette
- Interactive tooltip: "SWE: 342 mm (13.5 in) · Snow Depth: 89 cm"
- State/region ranking sidebar

#### Sample Interpretation

> "A pixel in the Colorado Rockies showing SWE = 0.45 m means that if all snow at this location melted, it would produce 450 mm (17.7 inches) of water. This represents a heavy snowpack."

#### Limitations

- SNODAS is modeled — localized discrepancies with actual snow on the ground are expected.
- "Right now" is actually yesterday due to processing lag.
- No Alaska/Hawaii coverage.

#### Figures

1. **CONUS SWE heatmap** — the primary product
2. **Top-10 SWE locations bar chart** — ranked by zonal max or mean
3. **MODIS snow extent overlay** — binary snow/no-snow at 500 m

---

### Q2: Timelapse of snowfall this season (Oct → now)

#### Intent

Animated map showing snow accumulation and ablation from October 1 through the current date.

#### Primary Dataset: **SNODAS** (`SWE` or `Snow_Depth`)

**Why:** Daily 1 km resolution provides smooth animation frames. SWE shows water content buildup; Snow_Depth shows visible snowpack growth.

#### Supporting Dataset: **MODIS MOD10A1** (`NDSI_Snow_Cover`)

**Why:** Can create a parallel extent timelapse at 500 m resolution. Composite over 5-8 day windows to reduce cloud gaps.

#### Methodology

1. **Define season:** October 1 of current water year to today.
   ```javascript
   var waterYearStart = ee.Date('2025-10-01');
   var today = ee.Date(Date.now());
   var season = snodas.filterDate(waterYearStart, today);
   ```

2. **Frame selection:** Select every 3rd or 7th day to balance smoothness vs. data volume.
   - For web animation: weekly frames (~20-22 frames for a full season)
   - For detailed analysis: daily frames

3. **Consistent color scale:** Fix the palette to the season's expected max (e.g., 0–1.5 m SWE) so colors are comparable across frames.

4. **Animation encoding:** Export as GIF or WebM; or render client-side with frame-by-frame map updates.

5. **Optional: Cumulative snowfall** instead of instantaneous SWE. For this, use ERA5-Land `snowfall_sum` band, summing daily values cumulatively:
   ```
   cumulative_snowfall(day_n) = Σ(snowfall_sum, day_1 ... day_n)
   ```

#### Output Map

- **Animated raster** over CONUS
- Date label in corner of each frame
- Color scale: sequential blue-white palette (0 = no snow = transparent, max = deep blue/white)
- Play/pause controls, speed slider

#### Sample Interpretation

> "Frame dated January 15: The Sierra Nevada shows SWE = 0.6 m, having accumulated rapidly since a December atmospheric river event visible in frames Dec 10–14."

#### Limitations

- Daily SNODAS can have occasional gaps (interpolate or skip frame).
- MODIS cloud contamination makes optical timelapse choppy without compositing.
- Animation file sizes can be large — use spatial subsetting or reduced resolution for web delivery.

#### Figures

1. **Animated GIF/WebM** — the core product
2. **Cumulative SWE time series** for 3-5 key regions (line chart alongside animation)
3. **Snow cover area (km²) time series** from MODIS

---

### Q3: How this year compares to previous years (anomaly from mean)

#### Intent

Map showing whether current snowpack is above or below the long-term average at each location.

#### Primary Dataset: **Daymet V4** (`swe`) for climatological baseline

**Why:** 40+ year record (1980–present) provides a robust normal baseline. 1 km resolution matches SNODAS.

#### Current Conditions: **SNODAS** (`SWE`)

**Why:** Most recent SWE observation for the "this year" value.

#### Methodology

1. **Compute climatological mean SWE for today's date** using Daymet V4:
   ```
   For a given day-of-year (DOY):
   SWE_mean(pixel) = (1/N) × Σ SWE(pixel, DOY, year_i)  for i = 1..N
   ```
   where N = number of years in baseline period (e.g., 1991–2020 = 30 years).

2. **Compute climatological standard deviation:**
   ```
   SWE_std(pixel) = sqrt[(1/(N-1)) × Σ (SWE(pixel, DOY, year_i) - SWE_mean(pixel))²]
   ```

3. **Get current SWE** from the latest SNODAS image.

4. **Resample SNODAS to Daymet grid** (both are 1 km, but projections may differ). Use bilinear interpolation.

5. **Compute anomaly:**
   - **Absolute anomaly:** `SWE_anomaly = SWE_current - SWE_mean`
   - **Percent of normal:** `SWE_pct = (SWE_current / SWE_mean) × 100`
   - **Standardized anomaly (z-score):** `z = (SWE_current - SWE_mean) / SWE_std`

   The z-score is preferred for cross-regional comparison because it normalizes by local variability.

6. **Handle edge cases:**
   - Where `SWE_mean = 0` (areas that rarely have snow): mask out or show absolute anomaly only.
   - Where `SWE_std = 0`: mask out (no variability = no meaningful anomaly).

#### Output Map

- **Diverging color scale** centered on 0:
  | Z-Score | Color | Meaning |
  |---|---|---|
  | < -2.0 | `#b71c1c` (dark red) | Exceptionally below normal |
  | -2.0 to -1.0 | `#ef5350` (red) | Well below normal |
  | -1.0 to -0.5 | `#ffab91` (orange) | Below normal |
  | -0.5 to +0.5 | `#e0e0e0` (gray) | Near normal |
  | +0.5 to +1.0 | `#90caf9` (light blue) | Above normal |
  | +1.0 to +2.0 | `#1e88e5` (blue) | Well above normal |
  | > +2.0 | `#0d47a1` (dark blue) | Exceptionally above normal |

#### Sample Interpretation

> "A pixel in the Cascades shows z = +1.8, meaning current SWE is 1.8 standard deviations above the 30-year mean for this date. This translates to approximately 140% of normal — a well-above-average snowpack."

#### Limitations

- Daymet and SNODAS use different snow models — systematic biases between them can create false anomalies. **Recommended:** compute anomalies within a single dataset where possible (e.g., SNODAS 2003–2024 mean vs. SNODAS current).
- Daymet baseline ends ~2 years behind real-time.
- Short SNODAS record (2003+) limits the robustness of its own climatology.

#### Figures

1. **CONUS anomaly map** (z-score, diverging palette)
2. **Percent-of-normal map** (alternative view)
3. **Regional distribution plot** — histogram of z-scores for each NOAA climate region
4. **SNOTEL validation scatter** — SNOTEL percent-of-median vs. gridded anomaly at co-located pixels

---

### Q4: Timelapse of snowfall anomaly over multiple years

#### Intent

Show how snow anomalies have evolved year-over-year — are droughts getting worse? Are wet years clustered?

#### Primary Dataset: **ERA5-Land** (`snow_depth_water_equivalent`)

**Why:** Goes back to 1950 with consistent methodology. Global coverage allows Alaska inclusion. Monthly aggregate is sufficient for year-over-year comparison.

#### Alternative: **Daymet V4** (`swe`) — for CONUS at 1 km resolution (1980+)

#### Methodology

1. **Compute monthly or seasonal SWE climatology** (e.g., January mean SWE across 1981–2010):
   ```
   SWE_clim(pixel, month) = mean(SWE(pixel, month, year)) for year in baseline_period
   ```

2. **For each year, compute the anomaly for each month:**
   ```
   anomaly(pixel, month, year) = SWE(pixel, month, year) - SWE_clim(pixel, month)
   ```

3. **Create animation frames:** One frame per month (or per year for a specific month like April 1).
   - Example: April 1 SWE anomaly for every year from 1980 to 2025 = 45 frames.

4. **Normalize to z-scores** for comparability across regions (same formula as Q3).

5. **Smooth option:** Apply 3-year running mean to reduce noise while preserving trends.

#### Output Map

- **Animated diverging raster** (red-gray-blue) with year label
- Same color scale as Q3 for consistency
- Optional: small multiples (grid of maps, one per year) for static view

#### Sample Interpretation

> "The 2015 frame shows the entire Sierra Nevada and Cascades in deep red (z < -2), reflecting the historic drought. By 2017, the same regions are dark blue (z > +2), consistent with the record-breaking snowpack that year."

#### Limitations

- ERA5-Land at 9 km is coarse — small mountain ranges may be smoothed out.
- Monthly resolution misses intra-month variability.
- Early ERA5-Land data (1950s–1970s) has fewer assimilated observations and may be less reliable.

#### Figures

1. **Animated anomaly map** (core product)
2. **Time series sparklines** for 5 key regions overlaid on the animation
3. **Trend line plot** — linear regression of April 1 SWE anomaly over time for selected basins

---

### Q5: Historical snowfall — 5/10/20 year averages, ranked vs. rest of US

#### Intent

Show average annual snowfall for different time windows and rank each location relative to the rest of CONUS.

#### Primary Dataset: **Daymet V4** (`prcp`, `tmin`, `tmax`, `swe`)

**Why:** 1 km, 1980–present. Long enough for 20-year and 40-year averages. Has both precip and temperature for snowfall derivation.

#### Supporting: **gridMET** (`pr`, `tmmn`, `tmmx`) for validation and gap-filling

#### Methodology

1. **Define snowfall from Daymet:**

   Option A — **Use SWE accumulation as snowfall proxy:**
   ```
   daily_snowfall(pixel, day) = max(0, SWE(day) - SWE(day-1) + snowmelt(day))
   ```
   This requires estimating melt, which is complex.

   Option B (recommended) — **Temperature-threshold method:**
   ```
   daily_snowfall(pixel, day) = prcp(day)   if tmax(day) < 2°C
                                 prcp(day) × f(T)  if 0°C < tmax < 4°C  (mixed precip)
                                 0                  if tmin(day) > 2°C
   ```
   where `f(T)` is a linear rain-snow partition:
   ```
   f(T) = (4 - tmax) / 4    (clamped to [0, 1])
   ```
   This gives snowfall in mm of water equivalent per day.

2. **Compute seasonal totals:**
   ```
   annual_snowfall(pixel, water_year) = Σ daily_snowfall(pixel, day)  for Oct 1 to Sep 30
   ```

3. **Compute period averages:**
   ```
   avg_5yr(pixel) = mean(annual_snowfall, last 5 water years)
   avg_10yr(pixel) = mean(annual_snowfall, last 10 water years)
   avg_20yr(pixel) = mean(annual_snowfall, last 20 water years)
   ```

4. **Rank each pixel relative to all CONUS pixels:**
   ```
   percentile_rank(pixel) = (count of pixels with lower avg) / (total pixels) × 100
   ```

5. **Convert to snow depth** (optional) using a typical snow-to-liquid ratio (SLR):
   ```
   snow_depth_estimate = snowfall_water_equiv × SLR
   ```
   Where SLR ≈ 10:1 for average snow, 15:1 for cold/dry snow, 5:1 for wet/heavy snow.
   Note: SLR varies dramatically; document this as an approximation.

#### Output Map

- **Sequential blue palette** for snowfall averages (mm SWE)
- **Percentile rank layer** using a different palette:
  | Percentile | Color | Label |
  |---|---|---|
  | 0–10 | `#fff9c4` | Minimal snow |
  | 10–25 | `#aed581` | Below average |
  | 25–50 | `#4fc3f7` | Average |
  | 50–75 | `#1976d2` | Above average |
  | 75–90 | `#5e35b1` | High snowfall |
  | 90–100 | `#e91e63` | Extreme snowfall |

- **Toggle between:** 5yr / 10yr / 20yr averages; absolute totals vs. percentile rank

#### Sample Interpretation

> "A pixel near Mount Baker, WA shows 20-year average snowfall of 2,850 mm SWE (112 inches water equivalent), ranking in the 99th percentile nationally. This is consistent with Baker holding the US single-season snowfall record."

#### Limitations

- Temperature-threshold snowfall partitioning is approximate (±15-20% error).
- Daymet may underestimate snowfall in wind-exposed or data-sparse areas.
- Percentile ranking is sensitive to masking (excluding non-land, water bodies).
- SLR conversion to snow depth is highly approximate.

#### Figures

1. **Three-panel map** — 5yr, 10yr, 20yr average snowfall side by side
2. **Histogram** of CONUS snowfall distribution with selected locations marked
3. **Bar chart** — top 20 snowiest HUC-8 watersheds by 20-year average
4. **SNOTEL comparison** — scatter of Daymet-derived snowfall vs. SNOTEL accumulated precip at co-located stations

---

### Q6: When does peak snowfall occur at each location (by month)?

#### Intent

Map showing the month when SWE or snowfall typically peaks at each pixel. This is the "snow calendar" of the US.

#### Primary Dataset: **Daymet V4** (`swe`) or **ERA5-Land** (`snow_depth_water_equivalent`)

**Why:** Need multi-year record to compute climatological peak month. Daymet for CONUS at 1 km; ERA5-Land for global/Alaska at 9 km.

#### Methodology

1. **Compute monthly mean SWE for each month** across the baseline period:
   ```
   SWE_monthly_mean(pixel, month) = mean(SWE(pixel, month, year))  for all years in baseline
   ```
   Use the 1st of each month or monthly average (monthly average is smoother).

2. **Identify the peak month:**
   ```
   peak_month(pixel) = argmax(SWE_monthly_mean(pixel, month))  for month in {Oct, Nov, Dec, Jan, Feb, Mar, Apr, May, Jun}
   ```

3. **Mask non-snow pixels:** Where max SWE < threshold (e.g., 10 mm), mask out — these locations don't have meaningful snow seasons.

4. **Optional — compute peak day-of-year** for finer resolution:
   Using daily SWE from Daymet, compute the mean DOY when SWE reaches its annual maximum:
   ```
   peak_doy(pixel) = mean(argmax_doy(SWE(pixel, doy, year)))  for each year
   ```

#### Output Map

- **Categorical color map** — one color per month:
  | Month | Color |
  |---|---|
  | October | `#ff6f00` |
  | November | `#f57c00` |
  | December | `#e64a19` |
  | January | `#c62828` |
  | February | `#ad1457` |
  | March | `#6a1b9a` |
  | April | `#283593` |
  | May | `#0277bd` |
  | June | `#00838f` |

- **Legend:** "Month of Peak SWE"
- Gradient variant: map peak DOY as continuous value (DOY 1–365) with circular colormap

#### Sample Interpretation

> "Most of the Northern Rockies shows peak SWE in April (blue), while lower-elevation areas in the Midwest peak in February (pink). The Cascades show a split — lower elevations peak in March, upper elevations in May, reflecting the longer accumulation season at altitude."

#### Limitations

- Using monthly resolution loses the exact date — April 1 vs April 30 are lumped together.
- Rain-on-snow events can create false peaks.
- In years with unusual patterns (e.g., January thaw followed by February re-accumulation), the climatological peak may not match any individual year.
- Maritime snowpacks (Cascades, Sierra) with high melt rates may have sharper peaks that monthly averaging smooths out.

#### Figures

1. **CONUS peak month map** (core product)
2. **Peak DOY map** (continuous) for finer detail
3. **SWE seasonal cycle plots** for 6 representative locations (monthly climatological SWE curve)
4. **Elevation vs. peak month scatter** — showing the elevation-dependence of peak timing

---

### Q7: How has peak season timing shifted over 5/10/20 years?

#### Intent

Detect whether snowpack is peaking earlier or later over recent decades — a key climate change signal.

#### Primary Dataset: **Daymet V4** (`swe`) — 1980–present, 1 km

**Why:** 40+ year record at high resolution. Long enough to detect multi-decadal shifts.

#### Validation Dataset: **SNOTEL** (`WTEQ`)

**Why:** Independent ground truth at ~880 mountain stations with some records back to the 1960s.

#### Supporting: **ERA5-Land** (`snow_depth_water_equivalent`) for global context and longer baseline (1950+)

#### Methodology

1. **For each pixel and each year, find the peak SWE date:**
   ```
   peak_doy(pixel, year) = argmax_doy(SWE(pixel, doy, year))
   ```
   Restrict search to the snow season (DOY 1–200, i.e., Jan 1–Jul 19) to avoid false autumn peaks.

2. **Compute the trend in peak DOY** using ordinary least squares regression:
   ```
   peak_doy(year) = β₀ + β₁ × year + ε
   ```
   - β₁ = **trend** (days per year). Negative = earlier peak. Positive = later peak.
   - Multiply β₁ by the period length for total shift:
     - 5-year shift: β₁ × 5
     - 10-year shift: β₁ × 10
     - 20-year shift: β₁ × 20

3. **Statistical significance:** Compute p-value for β₁ using t-test. Only display trends where p < 0.05.

4. **Robust alternative:** Use Theil-Sen slope estimator instead of OLS for resistance to outliers:
   ```
   β₁_TheilSen = median((peak_doy_j - peak_doy_i) / (year_j - year_i))  for all i < j
   ```

5. **Mann-Kendall test** for monotonic trend significance (non-parametric):
   ```
   S = Σ Σ sign(peak_doy_j - peak_doy_i)  for all i < j
   ```
   Compute Z-statistic and p-value from S.

6. **For SNOTEL validation:**
   - Extract peak SWE date from `WTEQ` time series at each station
   - Compute same regression
   - Compare SNOTEL point trends with Daymet pixel trends at co-located pixels

#### Output Map

- **Diverging color scale** centered on 0 (no change):
  | Shift (days/decade) | Color | Meaning |
  |---|---|---|
  | < -10 | `#b71c1c` (dark red) | Much earlier peak (strong warming signal) |
  | -10 to -5 | `#ef5350` (red) | Earlier peak |
  | -5 to -2 | `#ffab91` (orange) | Slightly earlier |
  | -2 to +2 | `#e0e0e0` (gray) | No significant change |
  | +2 to +5 | `#90caf9` (light blue) | Slightly later |
  | +5 to +10 | `#1e88e5` (blue) | Later peak |
  | > +10 | `#0d47a1` (dark blue) | Much later peak |

- **Stippling or hatching** for pixels where trend is not statistically significant (p ≥ 0.05).

#### Sample Interpretation

> "The Pacific Northwest shows peak SWE occurring 8–12 days earlier per decade over the past 20 years (red shading), consistent with warming winter temperatures. Meanwhile, parts of the Northern Great Plains show no significant shift (gray), suggesting stable continental snow regimes."

#### Limitations

- Peak DOY is noisy in low-snow areas (small SWE values fluctuate easily → unreliable peak date).
- Short periods (5 years) will rarely show statistically significant trends — more useful as descriptive.
- The temperature-driven rain-snow transition elevation is the primary driver; this analysis captures the effect but not the mechanism directly.
- Daymet SWE model may not capture all real-world melt dynamics accurately.
- Non-linear changes (abrupt shifts) won't be captured by linear regression — consider also showing decadal means.

#### Figures

1. **Trend map** — days-per-decade shift in peak SWE timing (core product)
2. **SNOTEL station overlay** — colored dots showing station-level trends on the same scale
3. **Time series examples** — peak DOY vs. year for 4 contrasting stations (with trend line)
4. **Histogram of trend values** — distribution of β₁ across all CONUS pixels
5. **Elevation band analysis** — mean trend grouped by 500 m elevation bands

---

## 3. Cross-Cutting Technical Notes

### 3.1 Water Year Convention

All seasonal analyses use the **water year** (October 1 – September 30). Water Year 2026 starts October 1, 2025. This aligns with the natural snow accumulation cycle.

### 3.2 Projection and Resampling

| Dataset | Native Projection | Pixel Size |
|---|---|---|
| SNODAS | EPSG:4326 (geographic) | ~1 km |
| Daymet V4 | Lambert Conformal Conic (custom) | 1 km |
| ERA5-Land | EPSG:4326 | ~9 km (0.1°) |
| MODIS MOD10A1 | Sinusoidal | 500 m |
| gridMET | EPSG:4326 | ~4 km |

When combining datasets, reproject to a common grid. Recommended: **EPSG:5070 (CONUS Albers Equal Area)** for area-accurate statistics. Use bilinear interpolation for continuous variables (SWE, temperature), nearest-neighbor for categorical (snow cover class, QA flags).

### 3.3 SWE vs. Snowfall vs. Snow Depth

These three metrics are related but distinct:

- **SWE (Snow Water Equivalent):** Water content of existing snowpack. A *state* variable (snapshot in time).
- **Snowfall:** Amount of new snow that fell. A *flux* variable (accumulated over a period).
- **Snow Depth:** Physical thickness of snow on the ground. Depends on SWE and snow density.

Relationships:
```
Snow_Depth = SWE / snow_density × ρ_water
           = SWE × SLR  (snow-to-liquid ratio, typically 8:1 to 20:1)

Snowfall ≈ ΔSWE + melt  (change in SWE plus any melt that occurred)
```

### 3.4 Temperature Units

| Dataset | Temp Units | Conversion |
|---|---|---|
| Daymet V4 | °C | Direct |
| ERA5-Land | K | Subtract 273.15 |
| gridMET | K | Subtract 273.15 |
| SNOTEL | °F | (°F - 32) × 5/9 |

### 3.5 Cloud Masking (MODIS)

For MODIS snow cover, always filter on QA bands:
```javascript
var cloudMasked = image.updateMask(
  image.select('NDSI_Snow_Cover_Basic_QA').lte(2)  // Best, Good, or OK quality
  .and(image.select('NDSI_Snow_Cover').lte(100))    // Exclude class codes
);
```

For time series, create 8-day maximum-value composites to fill cloud gaps:
```javascript
var composite = collection.filterDate(start, end)
  .map(cloudMask)
  .reduce(ee.Reducer.max());
```

### 3.6 Dataset Selection Decision Matrix

| Question | Real-time? | Resolution needed | Time depth | Primary | Supporting |
|---|---|---|---|---|---|
| Q1: Current snow | ✅ | High (1 km) | 1 day | SNODAS | MODIS |
| Q2: Season timelapse | ✅ | High (1 km) | Months | SNODAS | MODIS |
| Q3: Year vs. normal | ✅ current | High (1 km) | 20-30 yr baseline | SNODAS + Daymet | SNOTEL |
| Q4: Multi-year anomaly | ❌ | Medium (1-9 km) | 30-75 yr | ERA5-Land or Daymet | SNOTEL |
| Q5: Historical averages | ❌ | High (1 km) | 5-40 yr | Daymet | gridMET, SNOTEL |
| Q6: Peak timing | ❌ | High (1 km) | 20-40 yr | Daymet | ERA5-Land |
| Q7: Peak shift | ❌ | High (1 km) | 20-40 yr | Daymet | SNOTEL, ERA5-Land |

### 3.7 SNOTEL Integration Pattern

SNOTEL stations provide **point validation** for all gridded analyses. Recommended workflow:

1. Query SNOTEL API for all active stations with `WTEQ` data
2. Extract co-located pixel values from the gridded dataset
3. Compute correlation (R²), bias (mean difference), and RMSE
4. Display SNOTEL stations as colored dots overlaid on gridded maps
5. Provide station-level time series on click/hover

### 3.8 Recommended Color Palettes

All palettes are colorblind-safe selections from ColorBrewer / Viridis families:

- **Sequential (snowfall amounts):** `viridis` or custom blue: `['#f7fbff','#c6dbef','#6baed6','#2171b5','#08306b']`
- **Diverging (anomalies):** RdBu: `['#b2182b','#ef8a62','#fddbc7','#f7f7f7','#d1e5f0','#67a9cf','#2166ac']`
- **Categorical (peak month):** `Set3` or custom spectral
- **Binary (snow/no-snow):** white over transparent

---

## References

1. Barrett, A. P. (2003). National Operational Hydrologic Remote Sensing Center Snow Data Assimilation System (SNODAS) Products at NSIDC. NSIDC Special Report 11.
2. Thornton, M. M. et al. (2022). Daymet: Daily Surface Weather Data on a 1-km Grid for North America, Version 4 R1. ORNL DAAC. doi:10.3334/ORNLDAAC/2129
3. Muñoz Sabater, J. et al. (2021). ERA5-Land: a state-of-the-art global reanalysis dataset for land applications. Earth Syst. Sci. Data, 13, 4349–4383. doi:10.5194/essd-13-4349-2021
4. Hall, D. K. & Riggs, G. A. (2016). MODIS/Terra Snow Cover Daily L3 Global 500m Grid, V6.1. NSIDC DAAC. doi:10.5067/MODIS/MOD10A1.061
5. Abatzoglou, J. T. (2013). Development of gridded surface meteorological data for ecological applications and modelling. Int. J. Climatol., 33, 121–131. doi:10.1002/joc.3413
6. Serreze, M. C. et al. (1999). Characteristics of the western United States snowpack from snowpack telemetry (SNOTEL) data. Water Resour. Res., 35, 2145–2160.
