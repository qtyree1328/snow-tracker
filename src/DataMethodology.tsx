import { useState } from 'react'
import { DatasetExplorer, GEE_PROXY } from './components/DatasetExplorer'

/* ── Collapsible section component ── */
function Dropdown({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '10px 16px', background: open ? '#f8fafc' : '#fff',
          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 13, fontWeight: 600, color: '#334155', textAlign: 'left',
        }}
      >
        {title}
        <span style={{ fontSize: 11, color: '#94a3b8', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>
      {open && <div style={{ padding: '0 16px 14px', fontSize: 13, color: '#475569', lineHeight: 1.7 }}>{children}</div>}
    </div>
  )
}

/* ── Simple table renderer ── */
function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8, marginBottom: 8 }}>
      <thead>
        <tr>{headers.map((h, i) => <th key={i} style={{ textAlign: 'left', padding: '6px 10px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0', fontWeight: 600, color: '#334155' }}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => <td key={j} style={{ padding: '5px 10px', borderBottom: '1px solid #f1f5f9', color: '#475569' }}>{cell}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

/* ── Dataset definitions ── */
const DATASETS: DatasetConfig[] = [
  {
    id: 'snodas',
    title: 'SNODAS — Snow Data Assimilation System',
    provider: 'NOAA / NOHRSC',
    resolution: '1 km', temporal: 'Daily', coverage: 'CONUS', dateRange: '2003 - present',
    geeCollection: 'projects/climate-engine/snodas/daily',
    whatIsIt: 'A modeled snow product that assimilates satellite, ground station, and weather model data into a single consistent daily grid. It\'s the best "current conditions" snapshot for the US.',
    whatOneImageMeans: 'A single SNODAS image for a given date shows the estimated snow state AT THAT MOMENT — not accumulated over time, not an average. The SWE band tells you "if you melted all the snow at this pixel right now, how many millimeters of water would you get?" The Snow Depth band tells you the physical depth of the snowpack in meters. These are instantaneous snapshots, not totals or rates.',
    bands: [
      { value: 'SWE', label: 'Snow Water Equivalent (mm)' },
      { value: 'Snow_Depth', label: 'Snow Depth (m)' },
    ],
    proxyEndpoint: `${GEE_PROXY}/api/snow/tiles/snodas`,
    clickQueryEndpoint: `${GEE_PROXY}/api/snow/stats/snodas?lat={lat}&lon={lng}&start=2025-10-01&end=2026-02-26&band=SWE`,
    defaultParams: { band: 'SWE', date: '2026-02-15' },
    timeControl: 'date' as const,
    defaultTime: '2026-02-15',
    colorRamp: { colors: ['#f7fbff', '#9ecae1', '#3182bd', '#08519c', '#6a1b9a'], min: 0, max: 500, unit: 'mm', label: 'SWE' },
    detailSections: [
      {
        title: 'Band Details',
        content: (
          <>
            <Table
              headers={['Band', 'Units', 'Description']}
              rows={[
                ['SWE', 'meters', 'Snow Water Equivalent — depth of water if all snow melted'],
                ['Snow_Depth', 'meters', 'Physical depth of the snowpack'],
              ]}
            />
            <p>Pixel values are in <strong>meters</strong> (float). A SWE value of 0.15 means 150 mm of water equivalent. A Snow_Depth of 0.5 means 50 cm of snow on the ground. No scale factor needed.</p>
          </>
        ),
      },
      {
        title: 'Known Limitations',
        content: (
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>Not observation-only:</strong> SNODAS is a modeled product that assimilates satellite, ground, and NWP data. It can disagree with point measurements.</li>
            <li><strong>CONUS only:</strong> No Alaska, Hawaii, or global coverage in GEE version.</li>
            <li><strong>Mountain bias:</strong> Complex terrain (steep valleys, wind-loaded slopes) can produce SWE under/over-estimates at 1 km resolution.</li>
            <li><strong>Data gaps:</strong> Occasional 1-2 day gaps, especially in early record (2003-2005).</li>
            <li><strong>Starts 2003:</strong> No climatological baseline before that date within this dataset alone.</li>
          </ul>
        ),
      },
      {
        title: 'Best Use Case',
        content: <p>Real-time and recent-historical SWE/snow depth mapping across CONUS. Best for answering "where is snow on the ground right now?" and "how much water is stored in the snowpack?"</p>,
      },
    ],
  },
  {
    id: 'era5',
    title: 'ERA5-Land — ECMWF Reanalysis',
    provider: 'ECMWF / Copernicus',
    resolution: '9 km', temporal: 'Monthly aggregates (hourly available)', coverage: 'Global', dateRange: '1950 - present',
    geeCollection: 'ECMWF/ERA5_LAND/MONTHLY_AGGR',
    whatIsIt: 'A global climate reanalysis product — a physics-based weather model run backwards through history, constrained by observations. It fills in the gaps where no measurements exist.',
    whatOneImageMeans: 'A single ERA5-Land monthly image shows values AGGREGATED OVER THAT MONTH. The "snowfall_sum" band is the TOTAL METERS OF SNOW (water equivalent) that fell during that month — it\'s a flux, not a state. The "snow_depth" band is the average depth of snow on the ground during that month. The "snow_cover" band is the fraction (0-100%) covered by snow, averaged over the month. Key distinction: snowfall_sum is "how much fell" while snow_depth is "how much is sitting there."',
    bands: [
      { value: 'snowfall_sum', label: 'Monthly Snowfall Total (m w.e.)' },
      { value: 'snow_depth', label: 'Mean Snow Depth (m)' },
      { value: 'snow_cover', label: 'Snow Cover Fraction (%)' },
    ],
    proxyEndpoint: `${GEE_PROXY}/api/snow/tiles/era5`,
    clickQueryEndpoint: `${GEE_PROXY}/api/snow/stats/era5?lat={lat}&lon={lng}&start=2024-10-01&end=2025-04-01&band=snowfall_sum`,
    defaultParams: { band: 'snowfall_sum', year: '2025', month: '01' },
    timeControl: 'year-month' as const, defaultTime: '2025-01',
    colorRamp: { colors: ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#93c5fd', '#a855f7', '#e9d5ff'], min: 0, max: 0.5, unit: 'm w.e.', label: 'Snowfall' },
    defaultCenter: [-20, 50] as [number, number], defaultZoom: 2,
    detailSections: [
      {
        title: 'Band Details',
        content: (
          <>
            <Table
              headers={['Band', 'Units', 'Description']}
              rows={[
                ['snowfall_sum', 'm water equiv.', 'Total snowfall for the month. A value of 0.025 = 25 mm snowfall.'],
                ['snow_depth', 'meters', 'Average depth of snow on ground during the month.'],
                ['snow_cover', 'fraction (0-1)', 'Fraction of grid cell covered by snow, averaged over month.'],
                ['snow_density', 'kg/m³', 'Mass of snow per cubic meter in the snow layer.'],
                ['snow_albedo', 'fraction (0-1)', 'Fraction of solar radiation reflected by snow.'],
                ['snowmelt_sum', 'm water equiv.', 'Accumulated snowmelt for the month.'],
                ['temperature_of_snow_layer', 'Kelvin', 'Temperature of the snow layer.'],
                ['temperature_2m', 'Kelvin', '2-meter air temperature (subtract 273.15 for °C).'],
              ]}
            />
            <p>Flow bands (with _sum suffix) are monthly totals. Non-flow bands are monthly averages. <strong>Temperatures are in Kelvin</strong> — subtract 273.15 for °C.</p>
          </>
        ),
      },
      {
        title: 'Known Limitations',
        content: (
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>Coarse resolution (9 km):</strong> Misses fine-scale snow features — mountain valleys, urban heat islands, lake-effect bands.</li>
            <li><strong>Reanalysis artifacts:</strong> Occasional negative snowfall values due to GRIB packing precision. Clamp to 0.</li>
            <li><strong>3-month lag:</strong> Not suitable for real-time applications.</li>
            <li><strong>Model-based:</strong> Snow physics are modeled, not directly observed. Can diverge from ground truth in complex terrain.</li>
            <li><strong>Early data (1950s-1970s):</strong> Fewer assimilated observations — less reliable.</li>
          </ul>
        ),
      },
      {
        title: 'Best Use Case',
        content: <p>Long-term global snow climatology (1950-present). Best for multi-decadal trend analysis, global comparisons, and gap-filling. The 75+ year record is unmatched.</p>,
      },
    ],
  },
  {
    id: 'daymet',
    title: 'Daymet V4 — Daily Surface Weather',
    provider: 'NASA / ORNL DAAC',
    resolution: '1 km', temporal: 'Daily', coverage: 'North America', dateRange: '1980 - 2024',
    geeCollection: 'NASA/ORNL/DAYMET_V4',
    whatIsIt: 'A station-interpolated daily weather dataset. Takes measurements from weather stations and interpolates them to a 1 km grid accounting for elevation and terrain. The longest continuous high-res daily record for North America.',
    whatOneImageMeans: 'The tile endpoint aggregates by month. For "swe," you see the MEAN DAILY SWE during that month — the average snowpack state. For "prcp," the proxy computes TOTAL SNOWFALL for the month by summing precipitation only on days where minimum temperature was below freezing (tmin < 0°C). This is an approximation — real snowfall depends on precipitation type, not just temperature. The "tmin" band shows average daily minimum temperature for the month.',
    bands: [
      { value: 'swe', label: 'Mean Daily SWE (mm)' },
      { value: 'prcp', label: 'Monthly Snowfall (mm, precip where tmin<0)' },
      { value: 'tmin', label: 'Mean Daily Min Temp (°C)' },
    ],
    proxyEndpoint: `${GEE_PROXY}/api/snow/tiles/daymet`,
    defaultParams: { band: 'swe', year: '2024', month: '01' },
    timeControl: 'year-month' as const, defaultTime: '2024-01',
    colorRamp: { colors: ['#f7fbff', '#9ecae1', '#3182bd', '#08519c', '#6a1b9a'], min: 0, max: 500, unit: 'mm', label: 'SWE' },
    detailSections: [
      {
        title: 'Band Details',
        content: (
          <>
            <Table
              headers={['Band', 'Units', 'Description']}
              rows={[
                ['swe', 'kg/m² (= mm w.e.)', 'Snow Water Equivalent. Value of 200 = 200 mm SWE.'],
                ['prcp', 'mm/day', 'Daily total precipitation (all forms). Value of 25 = 25 mm precip.'],
                ['tmax', '°C', 'Daily maximum 2 m air temperature.'],
                ['tmin', '°C', 'Daily minimum 2 m air temperature.'],
                ['dayl', 'seconds', 'Duration of daylight.'],
                ['srad', 'W/m²', 'Shortwave radiation flux density.'],
                ['vp', 'Pa', 'Water vapor pressure.'],
              ]}
            />
          </>
        ),
      },
      {
        title: 'Known Limitations',
        content: (
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>Not real-time:</strong> Annual release cycle means current-season data is unavailable. Latest year is 1-2 years behind.</li>
            <li><strong>Interpolated product:</strong> Station-based interpolation can miss localized snowfall events in data-sparse regions.</li>
            <li><strong>SWE is modeled:</strong> Daymet SWE is derived from a simple snow model driven by precip/temp — not direct measurement.</li>
            <li><strong>V4 improvements:</strong> Corrected timing biases and high-elevation temperature issues from V3, but some mountain biases persist.</li>
          </ul>
        ),
      },
      {
        title: 'Best Use Case',
        content: <p>Long-term climatological analysis (1980-present). Ideal for computing 20-year, 30-year, or full-record normals of snowfall, SWE, and temperature. The deep time series is its primary advantage.</p>,
      },
    ],
  },
  {
    id: 'modis',
    title: 'MODIS MOD10A1 — Snow Cover',
    provider: 'NASA Terra/Aqua',
    resolution: '500 m', temporal: 'Daily', coverage: 'Global', dateRange: '2000 - present',
    geeCollection: 'MODIS/061/MOD10A1',
    whatIsIt: 'Satellite-derived snow cover from optical imagery. Uses the Normalized Difference Snow Index (NDSI) to distinguish snow from clouds, soil, and rock. The highest-resolution global daily snow product.',
    whatOneImageMeans: 'The tile endpoint computes a MONTHLY MEAN of daily NDSI Snow Cover values. Each pixel in a raw daily image is either cloud-obscured (masked out) or a snow fraction 0-100% based on NDSI. The monthly composite averages all cloud-free observations. A pixel showing "60" means on average 60% of that pixel was snow-covered during cloud-free days that month. This is BINARY snow presence, not depth or water equivalent — MODIS cannot tell you HOW MUCH snow, only WHETHER there is snow.',
    bands: [{ value: 'NDSI_Snow_Cover', label: 'NDSI Snow Cover (0-100%)' }],
    proxyEndpoint: `${GEE_PROXY}/api/snow/tiles/modis`,
    defaultParams: { band: 'NDSI_Snow_Cover', year: '2025', month: '01' },
    timeControl: 'year-month' as const, defaultTime: '2025-01',
    colorRamp: { colors: ['#8B4513', '#D2B48C', '#E0E0E0', '#FFFFFF', '#B0C4DE', '#4682B4'], min: 0, max: 100, unit: '%', label: 'Snow Cover' },
    detailSections: [
      {
        title: 'Band Details',
        content: (
          <>
            <Table
              headers={['Band', 'Units', 'Description']}
              rows={[
                ['NDSI_Snow_Cover', '% (0-100)', 'NDSI snow cover percentage. Values >100 are class codes (cloud, night, ocean).'],
                ['NDSI', 'dimensionless (0-10000)', 'Raw NDSI value. Divide by 10000 for true NDSI (-1 to +1 range).'],
                ['Snow_Albedo_Daily_Tile', '% (1-100)', 'Snow albedo percentage.'],
                ['NDSI_Snow_Cover_Basic_QA', 'bitmask', 'Quality flag (0=Best, 1=Good, 2=OK, 211=Night, 239=Ocean).'],
                ['NDSI_Snow_Cover_Class', 'categorical', 'Class values: cloud=250, night=211, water=237.'],
              ]}
            />
            <p><strong>This is snow COVER (fractional), NOT snow DEPTH or SWE.</strong> It tells you where snow is, not how much.</p>
          </>
        ),
      },
      {
        title: 'Known Limitations',
        content: (
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>Cloud contamination:</strong> Clouds are the #1 issue. Optical sensor = no data under clouds. Cloud fraction can exceed 50% in winter.</li>
            <li><strong>No depth or SWE:</strong> Only detects presence/absence of snow, not quantity.</li>
            <li><strong>Forest canopy:</strong> Dense forest obscures underlying snow, causing underestimation.</li>
            <li><strong>Night data gaps:</strong> No valid data in nighttime overpasses (polar winter = extended gaps).</li>
          </ul>
        ),
      },
      {
        title: 'Best Use Case',
        content: <p>High-resolution spatial extent of snow cover (500 m). Best for answering "where is snow on the ground?" Excellent for snow cover area time series and for validating/masking other datasets.</p>,
      },
    ],
  },
  {
    id: 'snotel',
    title: 'SNOTEL — Ground Station Network',
    provider: 'USDA NRCS',
    resolution: 'Point stations (~880)', temporal: 'Hourly', coverage: 'Western US Mountains', dateRange: '1980s - present',
    geeCollection: 'N/A — REST API: wcc.sc.egov.usda.gov/reportGenerator/',
    whatIsIt: 'Automated ground stations on snow pillows that physically weigh the snowpack. The gold standard for SWE measurement — everything else is validated against SNOTEL.',
    whatOneImageMeans: 'Not an image — these are point measurements. Each station reports the weight of snow on its pillow (SWE), accumulated precipitation, and air temperature. A single reading tells you the exact SWE at that precise location and elevation. The limitation is spatial: ~880 stations across the entire western US, all at relatively high elevations, so they miss lowland and eastern snow entirely.',
    isStation: true, bands: [], proxyEndpoint: '', defaultParams: {},
    timeControl: 'none' as const,
    defaultCenter: [-110, 43] as [number, number], defaultZoom: 5,
    detailSections: [
      {
        title: 'Parameters (via API)',
        content: (
          <>
            <Table
              headers={['Code', 'Units', 'Description']}
              rows={[
                ['WTEQ', 'inches', 'Snow Water Equivalent (pillow measurement) — THE gold standard.'],
                ['SNWD', 'inches', 'Snow Depth (ultrasonic sensor).'],
                ['PREC', 'inches', 'Accumulated precipitation.'],
                ['PRCP', 'inches', 'Precipitation increment (daily).'],
                ['TMAX', '°F', 'Maximum air temperature.'],
                ['TMIN', '°F', 'Minimum air temperature.'],
                ['TAVG', '°F', 'Average air temperature.'],
              ]}
            />
            <p><strong>Units are imperial</strong> (inches, °F). Convert: 1 inch = 25.4 mm; °F to °C = (°F - 32) x 5/9.</p>
            <p style={{ fontSize: 11, fontFamily: 'monospace', color: '#64748b', marginTop: 8 }}>
              API pattern: https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customSingleStationReport/daily/&#123;triplet&#125;/&#123;start&#125;,&#123;end&#125;/WTEQ::value,SNWD::value
            </p>
          </>
        ),
      },
      {
        title: 'Known Limitations',
        content: (
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>Point data only:</strong> ~880 stations cannot represent continuous spatial fields. Interpolation required for mapping.</li>
            <li><strong>Western US bias:</strong> No stations east of the Rockies. Zero coverage for Appalachians, Great Lakes, Northeast.</li>
            <li><strong>Elevation bias:</strong> Stations are at mid-to-high elevations in key watersheds. Valley floors and extreme summits under-represented.</li>
            <li><strong>Pillow errors:</strong> Snow bridging, ice layers, and vegetation can affect SWE readings (±10-15% error).</li>
            <li><strong>Wind effects:</strong> Snow depth sensors can be affected by wind redistribution near the sensor.</li>
          </ul>
        ),
      },
      {
        title: 'Best Use Case',
        content: <p>Ground-truth validation of gridded products. Essential for time-series analysis at specific mountain locations. Gold-standard point SWE measurements for calibrating SNODAS, Daymet, and ERA5-Land.</p>,
      },
    ],
  },
  {
    id: 'gridmet',
    title: 'gridMET — Surface Meteorology',
    provider: 'University of Idaho',
    resolution: '4 km', temporal: 'Daily', coverage: 'CONUS', dateRange: '1979 - present',
    geeCollection: 'IDAHO_EPSCOR/GRIDMET',
    whatIsIt: 'High-resolution surface meteorological dataset combining PRISM spatial patterns with NLDAS temporal patterns. Daily temperature, precipitation, wind, and humidity. No direct snow bands — snowfall must be derived from precipitation + temperature thresholds.',
    whatOneImageMeans: 'gridMET has no snow-specific bands. A single image shows daily weather variables: precipitation (mm), min/max temperature (Kelvin), wind, humidity. To estimate snowfall, you filter precipitation to days where temperature is below freezing. This is an approximation — the rain/snow transition depends on atmospheric profile, not just surface temperature.',
    bands: [
      { value: 'pr', label: 'Precipitation (mm/day)' },
      { value: 'tmmn', label: 'Min Temperature (K, subtract 273.15 for °C)' },
      { value: 'tmmx', label: 'Max Temperature (K)' },
    ],
    proxyEndpoint: '', // No gridMET tile endpoint yet
    defaultParams: {},
    timeControl: 'none' as const,
    detailSections: [
      {
        title: 'Band Details',
        content: (
          <>
            <Table
              headers={['Band', 'Units', 'Description']}
              rows={[
                ['pr', 'mm/day', 'Daily total precipitation (all phases).'],
                ['tmmn', 'Kelvin', 'Daily minimum temperature. Subtract 273.15 for °C.'],
                ['tmmx', 'Kelvin', 'Daily maximum temperature.'],
                ['srad', 'W/m²', 'Surface downward shortwave radiation.'],
                ['rmax / rmin', '%', 'Max/min relative humidity.'],
                ['vs', 'm/s', 'Wind velocity at 10 m.'],
                ['sph', 'mass fraction', 'Specific humidity.'],
              ]}
            />
          </>
        ),
      },
      {
        title: 'Known Limitations',
        content: (
          <ul style={{ margin: '4px 0', paddingLeft: 20 }}>
            <li><strong>No snow-specific bands:</strong> Must infer snowfall from precip when temperature is below a threshold.</li>
            <li><strong>CONUS only.</strong></li>
            <li><strong>Blended product:</strong> Combines PRISM spatial patterns with NLDAS temporal patterns. Edge artifacts possible.</li>
            <li><strong>Provisional data:</strong> Recent data may be revised.</li>
          </ul>
        ),
      },
      {
        title: 'Best Use Case',
        content: <p>Context dataset for temperature and precipitation. Best for deriving snowfall proxies when direct snow observations aren't available, and for providing meteorological context (wind, humidity, radiation) to snow analyses.</p>,
      },
    ],
  },
]

interface DatasetConfig {
  id: string; title: string; provider: string; resolution: string; temporal: string; coverage: string; dateRange: string; geeCollection: string
  whatIsIt: string; whatOneImageMeans: string
  bands: { value: string; label: string }[]
  proxyEndpoint: string; clickQueryEndpoint?: string; defaultParams: Record<string, string>
  timeControl: 'date' | 'year-month' | 'none'; defaultTime?: string
  colorRamp?: { colors: string[]; min: number; max: number; unit: string; label: string }
  defaultCenter?: [number, number]; defaultZoom?: number; isStation?: boolean
  detailSections: { title: string; content: React.ReactNode }[]
}

const RESEARCH_QUESTIONS = [
  { q: 'Where has the most snowfall right now?', datasets: 'SNODAS (primary), MODIS + SNOTEL (validation)', method: 'Load the latest SNODAS daily image. Map SWE values directly — higher SWE = more snow storage. Classify into bins (trace/light/moderate/heavy/extreme). SNOTEL stations provide ground-truth comparison. MODIS provides 500m optical confirmation of extent.', output: 'Choropleth map of current SWE with value labels on hover. State/region rankings sidebar.' },
  { q: 'Timelapse of snowfall over this season', datasets: 'SNODAS daily', method: 'Load SNODAS SWE for each day Oct 1 to present. Composite to weekly means to reduce noise. Animate as a sequence. Fix palette to season\'s expected max (0-1.5 m SWE) so colors are comparable across frames.', output: 'Animated map with play controls, week-by-week snow buildup. Cumulative SWE time series for key regions alongside.' },
  { q: 'How is this year comparing to previous years?', datasets: 'SNODAS (current) + Daymet (historical baseline)', method: 'Compute climatological mean + standard deviation of SWE for this date (e.g., 2003-2023). Subtract from current SNODAS. Express as Z-score: z = (current - mean) / std. Where mean = 0, mask out. Diverging color map centered on 0.', output: 'Diverging anomaly map (blue = above normal, red = below normal). Click for current-vs-mean time series chart.' },
  { q: 'Timelapse of snowfall anomaly over time', datasets: 'ERA5-Land (1950+) or Daymet (1980+)', method: 'For each year, compute winter season total snowfall (Oct-Apr). Calculate long-term mean. Compute departure for each year. Animate year by year. Normalize to Z-scores. Optional: 3-year running mean to reduce noise.', output: 'Animated anomaly map showing wet/dry snow years. Sparklines for key regions overlaid.' },
  { q: 'Historical snowfall — 5/10/20 year averages, ranked', datasets: 'Daymet V4 (1980-2024)', method: 'Compute mean annual snowfall using temperature-threshold method: snowfall = precip where tmax < 2°C. f(T) = (4-tmax)/4 for mixed precip. Compute for 5yr, 10yr, 20yr windows. Rank each pixel as percentile vs all CONUS pixels.', output: 'Map with percentile coloring + toggle for time window. Click for rank + absolute values.' },
  { q: 'When does peak snowfall occur at each location?', datasets: 'Daymet or SNODAS', method: 'For each pixel, find the calendar month when SWE historically reaches maximum. Compute modal peak month across all years. Mask non-snow pixels (max SWE < 10 mm). Optional: compute peak day-of-year for finer resolution.', output: 'Categorical map colored by month. Jan=dark blue through Jun=teal. Reveals the west-to-east and elevation-driven timing gradient.' },
  { q: 'How has peak season timing shifted over 5/10/20 years?', datasets: 'Daymet (1980-2024), SNOTEL for validation', method: 'For each pixel and year, find peak SWE date (DOY). Fit linear regression: peak_doy = b0 + b1*year. Slope = days/year shift. Test significance with Mann-Kendall. Negative slope = earlier peak (less snowpack persistence). Use Theil-Sen slope for outlier resistance.', output: 'Diverging map: red = earlier peak (warming signal), blue = later peak. Stippling where p >= 0.05 (not significant). SNOTEL dots overlaid.' },
]

const SNOTEL_SAMPLE = [
  { name: 'Niwot Ridge', lat: 40.05, lng: -105.59, elev: 11300, state: 'CO' },
  { name: 'Berthoud Summit', lat: 39.80, lng: -105.78, elev: 11300, state: 'CO' },
  { name: 'Loveland Basin', lat: 39.68, lng: -105.90, elev: 11400, state: 'CO' },
  { name: 'Tower', lat: 44.92, lng: -110.42, elev: 6900, state: 'WY' },
  { name: 'Togwotee Pass', lat: 43.76, lng: -110.08, elev: 9580, state: 'WY' },
  { name: 'Stevens Pass', lat: 47.74, lng: -121.09, elev: 4060, state: 'WA' },
  { name: 'Paradise', lat: 46.79, lng: -121.74, elev: 5400, state: 'WA' },
  { name: 'Mt Hood Test Site', lat: 45.33, lng: -121.72, elev: 5400, state: 'OR' },
  { name: 'Snowbird', lat: 40.56, lng: -111.65, elev: 9640, state: 'UT' },
  { name: 'Tahoe City Cross', lat: 39.17, lng: -120.15, elev: 6740, state: 'CA' },
  { name: 'Mammoth Pass', lat: 37.61, lng: -119.03, elev: 9300, state: 'CA' },
]

export function DataMethodology({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: '#f8fafc', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Data Methodology</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>Interactive exploration of each dataset. Change bands, dates, click the map to query values. Expand dropdowns for full technical details.</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 14px', fontSize: 13, color: '#475569', cursor: 'pointer' }}>Close</button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {DATASETS.map((ds) => (
          <section key={ds.id} style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{ds.title}</h2>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>{ds.provider}</div>

            {/* Specs */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {[`Resolution: ${ds.resolution}`, `Temporal: ${ds.temporal}`, `Coverage: ${ds.coverage}`, `Record: ${ds.dateRange}`].map((s, j) => (
                <div key={j} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4, padding: '4px 10px', fontSize: 11, color: '#475569' }}>{s}</div>
              ))}
            </div>

            {/* What is it */}
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '14px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>What is this dataset?</div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{ds.whatIsIt}</div>
            </div>

            {/* What one image means */}
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '14px 18px', marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>What does a single image represent?</div>
              <div style={{ fontSize: 13, color: '#1e3a5f', lineHeight: 1.6 }}>{ds.whatOneImageMeans}</div>
            </div>

            {/* GEE Collection */}
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12, fontFamily: 'monospace' }}>GEE: {ds.geeCollection}</div>

            {/* Detail dropdowns */}
            {ds.detailSections.map((sec, i) => (
              <Dropdown key={i} title={sec.title}>{sec.content}</Dropdown>
            ))}

            {/* Interactive map */}
            <div style={{ marginTop: 12 }}>
              {ds.isStation ? (
                <DatasetExplorer
                  proxyEndpoint="" defaultParams={{}}
                  defaultCenter={ds.defaultCenter ?? [-110, 43]} defaultZoom={ds.defaultZoom ?? 5} height="420px"
                  stationData={{ type: 'FeatureCollection' as const, features: SNOTEL_SAMPLE.map((s) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] }, properties: { name: s.name, elevation_ft: s.elev, state: s.state } })) }}
                />
              ) : ds.proxyEndpoint ? (
                <DatasetExplorer
                  proxyEndpoint={ds.proxyEndpoint} defaultParams={ds.defaultParams}
                  bands={ds.bands.length > 1 ? ds.bands : undefined}
                  clickQueryEndpoint={ds.clickQueryEndpoint}
                  timeControl={ds.timeControl} defaultTime={ds.defaultTime}
                  colorRamp={ds.colorRamp}
                  defaultCenter={ds.defaultCenter ?? [-106.5, 39.5]} defaultZoom={ds.defaultZoom ?? 5} height="420px"
                />
              ) : (
                <div style={{ height: 120, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: '#94a3b8', border: '1px solid #e2e8f0' }}>
                  No tile endpoint configured for this dataset yet. Used as a context/derivation source.
                </div>
              )}
            </div>
          </section>
        ))}

        {/* Research Questions */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Research Questions</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6, maxWidth: 800 }}>
            These are the maps we want to build. Each specifies datasets, statistical approach, and output format. US-only for now.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {RESEARCH_QUESTIONS.map((rq, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 20px' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Q{i + 1}: {rq.q}</div>
                <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 600, marginBottom: 4 }}>Datasets: {rq.datasets}</div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 6 }}><strong style={{ color: '#334155' }}>Method:</strong> {rq.method}</div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}><strong style={{ color: '#475569' }}>Output:</strong> {rq.output}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default DataMethodology
