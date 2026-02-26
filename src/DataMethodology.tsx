import { DatasetExplorer, GEE_PROXY } from './components/DatasetExplorer'

/*
 * DATA METHODOLOGY — Interactive dataset explorer + question methodology.
 * Each section has:
 * 1. What the dataset is
 * 2. What a SINGLE IMAGE represents (critical for interpretation)
 * 3. Interactive map with real GEE tiles
 * 4. Available bands and what they measure
 */

const DATASETS: DatasetConfig[] = [
  {
    id: 'snodas',
    title: 'SNODAS — Snow Data Assimilation System',
    provider: 'NOAA / NOHRSC',
    resolution: '1 km',
    temporal: 'Daily',
    coverage: 'CONUS',
    dateRange: '2003 - present',
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
    colorRamp: {
      colors: ['#f7fbff', '#9ecae1', '#3182bd', '#08519c', '#6a1b9a'],
      min: 0, max: 500, unit: 'mm', label: 'SWE',
    },
  },
  {
    id: 'era5',
    title: 'ERA5-Land — ECMWF Reanalysis',
    provider: 'ECMWF / Copernicus',
    resolution: '9 km',
    temporal: 'Monthly aggregates (hourly available)',
    coverage: 'Global',
    dateRange: '1950 - present',
    geeCollection: 'ECMWF/ERA5_LAND/MONTHLY_AGGR',
    whatIsIt: 'A global climate reanalysis product — essentially a physics-based weather model that has been run backwards through history, constrained by observations. It fills in the gaps where no measurements exist.',
    whatOneImageMeans: 'A single ERA5-Land monthly image shows values AGGREGATED OVER THAT MONTH. The "snowfall_sum" band is the TOTAL METERS OF SNOW (water equivalent) that fell during that month — it\'s a flux, not a state. The "snow_depth" band is the average depth of snow on the ground during that month. The "snow_cover" band is the fraction (0-100%) of the pixel covered by snow, averaged over the month. Key distinction: snowfall_sum is "how much fell" while snow_depth is "how much is sitting there."',
    bands: [
      { value: 'snowfall_sum', label: 'Monthly Snowfall Total (m w.e.)' },
      { value: 'snow_depth', label: 'Mean Snow Depth (m)' },
      { value: 'snow_cover', label: 'Snow Cover Fraction (%)' },
    ],
    proxyEndpoint: `${GEE_PROXY}/api/snow/tiles/era5`,
    clickQueryEndpoint: `${GEE_PROXY}/api/snow/stats/era5?lat={lat}&lon={lng}&start=2024-10-01&end=2025-04-01&band=snowfall_sum`,
    defaultParams: { band: 'snowfall_sum', year: '2025', month: '01' },
    timeControl: 'year-month' as const,
    defaultTime: '2025-01',
    colorRamp: {
      colors: ['#0d1b2a', '#1b263b', '#415a77', '#778da9', '#93c5fd', '#a855f7', '#e9d5ff'],
      min: 0, max: 0.5, unit: 'm w.e.', label: 'Snowfall',
    },
    defaultCenter: [-20, 50] as [number, number],
    defaultZoom: 2,
  },
  {
    id: 'daymet',
    title: 'Daymet V4 — Daily Surface Weather',
    provider: 'NASA / ORNL DAAC',
    resolution: '1 km',
    temporal: 'Daily',
    coverage: 'North America',
    dateRange: '1980 - 2024',
    geeCollection: 'NASA/ORNL/DAYMET_V4',
    whatIsIt: 'A station-interpolated daily weather dataset. Takes measurements from weather stations and interpolates them to a 1 km grid accounting for elevation and terrain. The longest continuous high-res daily record for North America.',
    whatOneImageMeans: 'The tile endpoint aggregates by month. For the "swe" band, you see the MEAN DAILY SWE during that month — the average snowpack state. For "prcp" (precipitation), the proxy computes TOTAL SNOWFALL for the month by summing precipitation only on days where minimum temperature was below freezing (tmin < 0C). This is an approximation — real snowfall depends on precipitation type, not just temperature. The "tmin" band shows average daily minimum temperature for the month.',
    bands: [
      { value: 'swe', label: 'Mean Daily SWE (mm)' },
      { value: 'prcp', label: 'Monthly Snowfall (mm, precip where tmin<0)' },
      { value: 'tmin', label: 'Mean Daily Min Temp (°C)' },
    ],
    proxyEndpoint: `${GEE_PROXY}/api/snow/tiles/daymet`,
    defaultParams: { band: 'swe', year: '2024', month: '01' },
    timeControl: 'year-month' as const,
    defaultTime: '2024-01',
    colorRamp: {
      colors: ['#f7fbff', '#9ecae1', '#3182bd', '#08519c', '#6a1b9a'],
      min: 0, max: 500, unit: 'mm', label: 'SWE',
    },
  },
  {
    id: 'modis',
    title: 'MODIS MOD10A1 — Snow Cover',
    provider: 'NASA Terra/Aqua',
    resolution: '500 m',
    temporal: 'Daily',
    coverage: 'Global',
    dateRange: '2000 - present',
    geeCollection: 'MODIS/061/MOD10A1',
    whatIsIt: 'Satellite-derived snow cover from optical imagery. Uses the Normalized Difference Snow Index (NDSI) to distinguish snow from clouds, soil, and rock. The highest-resolution global daily snow product.',
    whatOneImageMeans: 'The tile endpoint computes a MONTHLY MEAN of daily NDSI Snow Cover values. Each pixel in a raw daily image is either: cloud-obscured (masked out), or a snow fraction 0-100% based on the NDSI. The monthly composite averages all cloud-free observations, so a pixel showing "60" means that on average, 60% of that pixel was snow-covered during cloud-free days that month. This is BINARY snow presence, not depth or water equivalent — MODIS cannot tell you HOW MUCH snow, only WHETHER there is snow.',
    bands: [
      { value: 'NDSI_Snow_Cover', label: 'NDSI Snow Cover (0-100%)' },
    ],
    proxyEndpoint: `${GEE_PROXY}/api/snow/tiles/modis`,
    defaultParams: { band: 'NDSI_Snow_Cover', year: '2025', month: '01' },
    timeControl: 'year-month' as const,
    defaultTime: '2025-01',
    colorRamp: {
      colors: ['#8B4513', '#D2B48C', '#E0E0E0', '#FFFFFF', '#B0C4DE', '#4682B4'],
      min: 0, max: 100, unit: '%', label: 'Snow Cover',
    },
  },
  {
    id: 'snotel',
    title: 'SNOTEL — Ground Station Network',
    provider: 'USDA NRCS',
    resolution: 'Point stations (~900)',
    temporal: 'Hourly',
    coverage: 'Western US Mountains',
    dateRange: '1980s - present',
    geeCollection: 'N/A (REST API)',
    whatIsIt: 'Automated ground stations on snow pillows that physically weigh the snowpack. The gold standard for SWE measurement — everything else is validated against SNOTEL.',
    whatOneImageMeans: 'Not an image — these are point measurements. Each station reports the weight of snow on its pillow (SWE), accumulated precipitation, and air temperature. A single reading tells you the exact SWE at that precise location and elevation. The limitation is spatial: ~900 stations across the entire western US, all at relatively high elevations, so they miss lowland and eastern snow entirely.',
    isStation: true,
    bands: [],
    proxyEndpoint: '',
    defaultParams: {},
    timeControl: 'none' as const,
    defaultCenter: [-110, 43] as [number, number],
    defaultZoom: 5,
  },
]

interface DatasetConfig {
  id: string
  title: string
  provider: string
  resolution: string
  temporal: string
  coverage: string
  dateRange: string
  geeCollection: string
  whatIsIt: string
  whatOneImageMeans: string
  bands: { value: string; label: string }[]
  proxyEndpoint: string
  clickQueryEndpoint?: string
  defaultParams: Record<string, string>
  timeControl: 'date' | 'year-month' | 'none'
  defaultTime?: string
  colorRamp?: { colors: string[]; min: number; max: number; unit: string; label: string }
  defaultCenter?: [number, number]
  defaultZoom?: number
  isStation?: boolean
}

const RESEARCH_QUESTIONS = [
  {
    q: 'Where has the most snowfall right now?',
    datasets: 'SNODAS (primary), SNOTEL (validation)',
    method: 'Load the latest SNODAS daily image. Map SWE values directly — higher SWE = more snow storage. Rank all grid cells to identify top regions. SNOTEL stations provide ground-truth comparison.',
    output: 'Choropleth map of current SWE with value labels on hover.',
  },
  {
    q: 'Timelapse of snowfall over this season',
    datasets: 'SNODAS daily',
    method: 'Load SNODAS SWE for each day from Oct 1 to present. Composite to weekly means to reduce noise. Animate as a sequence showing snow accumulation building through the winter.',
    output: 'Animated map with play controls, week-by-week snow buildup.',
  },
  {
    q: 'How is this year comparing to previous years?',
    datasets: 'SNODAS (current) + Daymet (historical mean)',
    method: 'Compute climatological mean SWE for each pixel (e.g., 2003-2023 average for this date). Subtract from current SNODAS to get anomaly. Express as Z-score (standard deviations from mean) or percent of normal. Show time series of current year vs mean curve at clicked locations.',
    output: 'Diverging color map (blue=above normal, red=below normal). Click for time series chart.',
  },
  {
    q: 'Timelapse of snowfall anomaly over time',
    datasets: 'Daymet (1980-2024)',
    method: 'For each year, compute winter season total snowfall (Oct-Apr). Calculate the long-term mean. For each year, compute departure from mean. Animate year by year to show which regions had more/less snow than typical.',
    output: 'Animated anomaly map showing wet/dry snow years across the US.',
  },
  {
    q: 'Historical snowfall — 5/10/20 year averages, ranked',
    datasets: 'Daymet (1980-2024)',
    method: 'Compute mean annual snowfall for three windows: last 5 years (2019-2024), last 10 (2014-2024), last 20 (2004-2024). For each pixel, calculate its percentile rank vs all other US pixels. Toggle between time windows to see how rankings shift.',
    output: 'Map with percentile coloring. Click a location to see its rank and absolute values.',
  },
  {
    q: 'When does peak snowfall occur at each location?',
    datasets: 'SNODAS or Daymet',
    method: 'For each pixel, find the calendar month when SWE historically reaches its maximum. Compute modal (most common) peak month across all available years. Map colored by month — reveals the west-to-east and elevation-driven timing gradient.',
    output: 'Categorical map: Jan=dark blue, Feb=blue, Mar=teal, Apr=green, May=yellow.',
  },
  {
    q: 'How has peak season timing shifted over 5/10/20 years?',
    datasets: 'Daymet (1980-2024), SNOTEL for validation',
    method: 'For each pixel and each year, identify the date of peak SWE. Fit a linear regression (peak date vs year) over 5, 10, and 20 year windows. Slope = days earlier/later per decade. Test significance with Mann-Kendall. Negative slope = peak shifting earlier (less snowpack persistence).',
    output: 'Map showing days of shift per decade. Red=earlier peak (losing winter), blue=later peak.',
  },
]

const SNOTEL_SAMPLE = [
  { name: 'Niwot Ridge', lat: 40.05, lng: -105.59, elev: 11300, state: 'CO' },
  { name: 'Berthoud Summit', lat: 39.80, lng: -105.78, elev: 11300, state: 'CO' },
  { name: 'Loveland Basin', lat: 39.68, lng: -105.90, elev: 11400, state: 'CO' },
  { name: 'Tower', lat: 44.92, lng: -110.42, elev: 6900, state: 'WY' },
  { name: 'Togwotee Pass', lat: 43.76, lng: -110.08, elev: 9580, state: 'WY' },
  { name: 'Phillips Bench', lat: 43.49, lng: -110.88, elev: 8200, state: 'WY' },
  { name: 'Stevens Pass', lat: 47.74, lng: -121.09, elev: 4060, state: 'WA' },
  { name: 'Paradise', lat: 46.79, lng: -121.74, elev: 5400, state: 'WA' },
  { name: 'Mt Hood Test Site', lat: 45.33, lng: -121.72, elev: 5400, state: 'OR' },
  { name: 'Snowbird', lat: 40.56, lng: -111.65, elev: 9640, state: 'UT' },
  { name: 'Tahoe City Cross', lat: 39.17, lng: -120.15, elev: 6740, state: 'CA' },
  { name: 'Mammoth Pass', lat: 37.61, lng: -119.03, elev: 9300, state: 'CA' },
]

export function DataMethodology({ onClose }: { onClose: () => void }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: '#f8fafc', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: '#fff', borderBottom: '1px solid #e2e8f0',
        padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Data Methodology</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
            Each dataset below has an interactive map showing real data. Change bands, dates, and click the map to query values.
          </p>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: '1px solid #cbd5e1', borderRadius: 6,
            padding: '6px 14px', fontSize: 13, color: '#475569', cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 32px' }}>
        {/* Dataset sections */}
        {DATASETS.map((ds) => (
          <section key={ds.id} style={{ marginBottom: 56 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{ds.title}</h2>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12 }}>{ds.provider}</div>

            {/* Specs row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {[
                `Resolution: ${ds.resolution}`,
                `Temporal: ${ds.temporal}`,
                `Coverage: ${ds.coverage}`,
                `Record: ${ds.dateRange}`,
              ].map((s, j) => (
                <div key={j} style={{
                  background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4,
                  padding: '4px 10px', fontSize: 11, color: '#475569',
                }}>
                  {s}
                </div>
              ))}
            </div>

            {/* What is it */}
            <div style={{
              background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
              padding: '14px 18px', marginBottom: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>What is this dataset?</div>
              <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6 }}>{ds.whatIsIt}</div>
            </div>

            {/* What one image means — THE KEY SECTION */}
            <div style={{
              background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8,
              padding: '14px 18px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e40af', marginBottom: 4 }}>
                What does a single image represent?
              </div>
              <div style={{ fontSize: 13, color: '#1e3a5f', lineHeight: 1.6 }}>{ds.whatOneImageMeans}</div>
            </div>

            {/* Bands table */}
            {ds.bands.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>Available Bands</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ds.bands.map((b) => (
                    <div key={b.value} style={{
                      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 4,
                      padding: '4px 10px', fontSize: 12, color: '#475569',
                    }}>
                      <strong style={{ color: '#0369a1' }}>{b.value}</strong> — {b.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* GEE Collection */}
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12, fontFamily: 'monospace' }}>
              GEE: {ds.geeCollection}
            </div>

            {/* Interactive map */}
            {ds.isStation ? (
              <DatasetExplorer
                proxyEndpoint=""
                defaultParams={{}}
                defaultCenter={ds.defaultCenter ?? [-110, 43]}
                defaultZoom={ds.defaultZoom ?? 5}
                height="420px"
                stationData={{
                  type: 'FeatureCollection' as const,
                  features: SNOTEL_SAMPLE.map((s) => ({
                    type: 'Feature' as const,
                    geometry: { type: 'Point' as const, coordinates: [s.lng, s.lat] },
                    properties: { name: s.name, elevation_ft: s.elev, state: s.state },
                  })),
                }}
              />
            ) : (
              <DatasetExplorer
                proxyEndpoint={ds.proxyEndpoint}
                defaultParams={ds.defaultParams}
                bands={ds.bands.length > 1 ? ds.bands : undefined}
                clickQueryEndpoint={ds.clickQueryEndpoint}
                timeControl={ds.timeControl}
                defaultTime={ds.defaultTime}
                colorRamp={ds.colorRamp}
                defaultCenter={ds.defaultCenter ?? [-106.5, 39.5]}
                defaultZoom={ds.defaultZoom ?? 5}
                height="420px"
              />
            )}
          </section>
        ))}

        {/* Research Questions */}
        <section style={{ marginBottom: 56 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>Research Questions</h2>
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 20, lineHeight: 1.6, maxWidth: 800 }}>
            These are the maps we want to build. Each question specifies which dataset(s) to use,
            the statistical approach, and what the final output looks like. US-only for now.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {RESEARCH_QUESTIONS.map((rq, i) => (
              <div key={i} style={{
                background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
                padding: '16px 20px',
              }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                  Q{i + 1}: {rq.q}
                </div>
                <div style={{ fontSize: 12, color: '#0369a1', fontWeight: 600, marginBottom: 4 }}>
                  Datasets: {rq.datasets}
                </div>
                <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, marginBottom: 6 }}>
                  <strong style={{ color: '#334155' }}>Method:</strong> {rq.method}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                  <strong style={{ color: '#475569' }}>Output:</strong> {rq.output}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

export default DataMethodology
