import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts'

// ═══════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════
type Dashboard = 'global' | 'us' | 'modis'
type USBand = 'Snow_Depth' | 'SWE' | 'Snowfall'
type ERA5Band = 'snowfall_sum' | 'snow_depth' | 'snow_cover'
type DaymetBand = 'swe' | 'prcp' | 'tmin'
type USSource = 'snodas' | 'daymet'
type ViewMode = 'snapshot' | 'trends' | 'variability' | 'season_shift'
type MODISViewMode = 'snapshot' | 'snowdays' | 'snowdays_trend' | 'onset_trend' | 'melt_trend' | 'duration_trend'

// GEE Proxy URL — Cloud Run endpoint
const GEE_PROXY = 'https://gee-proxy-787413290356.us-east1.run.app'

const BAND_LABELS: Record<string, string> = {
  snowfall_sum: 'Snowfall', snow_depth: 'Snow Depth', snow_cover: 'Snow Cover',
  Snow_Depth: 'Snow Depth', SWE: 'Snow Water Equiv', Snowfall: 'Snowfall',
}

const GLOBAL_REGIONS = [
  { name: 'Global', lat: 30, lon: 0, zoom: 2 },
  { name: 'North America', lat: 50, lon: -100, zoom: 3 },
  { name: 'Rockies', lat: 42, lon: -110, zoom: 5 },
  { name: 'Cascades/Sierra', lat: 44, lon: -121, zoom: 6 },
  { name: 'Great Lakes', lat: 44, lon: -82, zoom: 5 },
  { name: 'Scandinavia', lat: 63, lon: 15, zoom: 4 },
  { name: 'Alps', lat: 46.5, lon: 10, zoom: 6 },
  { name: 'Siberia', lat: 60, lon: 90, zoom: 3 },
  { name: 'Japan', lat: 38, lon: 138, zoom: 6 },
  { name: 'Himalayas', lat: 34, lon: 78, zoom: 5 },
]

const US_REGIONS = [
  { name: 'CONUS', lat: 39, lon: -98, zoom: 4 },
  { name: 'Rockies', lat: 40, lon: -107, zoom: 6 },
  { name: 'Sierra Nevada', lat: 38.5, lon: -120, zoom: 7 },
  { name: 'Cascades', lat: 46, lon: -121.5, zoom: 7 },
  { name: 'Great Lakes', lat: 44, lon: -83, zoom: 6 },
  { name: 'Northeast', lat: 43, lon: -73, zoom: 6 },
]

const ERA5_BANDS: { key: ERA5Band; label: string; icon: string }[] = [
  { key: 'snowfall_sum', label: 'Snowfall', icon: '❄️' },
  { key: 'snow_depth', label: 'Snow Depth', icon: '📏' },
  { key: 'snow_cover', label: 'Snow Cover', icon: '🗺️' },
]

const US_BANDS: { key: USBand; label: string; icon: string }[] = [
  { key: 'Snow_Depth', label: 'Snow Depth', icon: '📏' },
  { key: 'SWE', label: 'Snow Water Equiv', icon: '💧' },
  { key: 'Snowfall', label: 'Snowfall', icon: '❄️' },
]

const DAYMET_BANDS: { key: DaymetBand; label: string; icon: string }[] = [
  { key: 'swe', label: 'SWE', icon: '💧' },
  { key: 'prcp', label: 'Snow Precip', icon: '❄️' },
  { key: 'tmin', label: 'Min Temp', icon: '🌡️' },
]

const VIEW_MODES: { key: ViewMode; label: string; icon: string; desc: string }[] = [
  { key: 'snapshot', label: 'Snapshot', icon: '📸', desc: 'Current month/year' },
  { key: 'trends', label: 'Trends', icon: '📈', desc: 'Increasing/decreasing over decades' },
  { key: 'variability', label: 'Variability', icon: '🎲', desc: 'Coefficient of variation' },
  { key: 'season_shift', label: 'Season Shift', icon: '📅', desc: 'Peak month changes (coming soon)' },
]

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ═══════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [dashboard, setDashboard] = useState<Dashboard>('global')

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-mono">
      <div className="bg-white/80 backdrop-blur-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-[1800px] mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-800">❄️ Snow Tracker</h1>
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button onClick={() => setDashboard('global')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                dashboard === 'global' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
              }`}>🌍 Global</button>
            <button onClick={() => setDashboard('us')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                dashboard === 'us' ? 'bg-emerald-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
              }`}>🇺🇸 US Detail</button>
            <button onClick={() => setDashboard('modis')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                dashboard === 'modis' ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200'
              }`}>🛰️ MODIS</button>
          </div>
          <div className="text-xs text-slate-400">
            {dashboard === 'global' ? 'ERA5-Land • ~9km' : dashboard === 'us' ? 'SNODAS/Daymet • ~1km' : 'MODIS 500m'}
          </div>
        </div>
      </div>
      {dashboard === 'global' ? <GlobalDashboard /> : dashboard === 'us' ? <USDashboard /> : <MODISDashboard />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// GLOBAL DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function GlobalDashboard() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [band, setBand] = useState<ERA5Band>('snowfall_sum')
  const [year, setYear] = useState(2024)
  const [month, setMonth] = useState(1)
  const [viewMode, setViewMode] = useState<ViewMode>('snapshot')
  const [loading, setLoading] = useState(false)
  const [tileError, setTileError] = useState<string | null>(null)
  const [clickedPoint, setClickedPoint] = useState<{lat: number, lon: number} | null>(null)
  const [timeSeries, setTimeSeries] = useState<{date: string, value: number}[]>([])
  const [tsLoading, setTsLoading] = useState(false)

  // Animation
  const [animMode, setAnimMode] = useState<'seasonal' | 'year-over-year'>('year-over-year')
  const [timelapseFrames, setTimelapseFrames] = useState<any[]>([])
  const [timelapseIdx, setTimelapseIdx] = useState(0)
  const [timelapseActive, setTimelapseActive] = useState(false)
  const [playing, setPlaying] = useState(false)
  const playRef = useRef(false)
  const [animLoading, setAnimLoading] = useState(false)
  const [seasonalYear] = useState(2024)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    let cancelled = false
    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !mapRef.current) return
      const map = L.map(mapRef.current, { center: [45, 0], zoom: 2, zoomControl: true })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO', maxZoom: 18,
      }).addTo(map)
      map.on('click', (e: any) => {
        const { lat, lng } = e.latlng
        setClickedPoint({ lat: Math.round(lat * 100) / 100, lon: Math.round(lng * 100) / 100 })
      })
      mapInstanceRef.current = map
      setMapReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [])

  const loadTileLayer = useCallback(async (tileUrl?: string) => {
    if (!mapInstanceRef.current) return
    const L = (await import('leaflet')).default
    const map = mapInstanceRef.current
    if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null }
    if (tileUrl) {
      const layer = L.tileLayer(tileUrl, { opacity: 0.75, maxZoom: 12 })
      layer.addTo(map); tileLayerRef.current = layer; return
    }
    setLoading(true); setTileError(null)
    try {
      let url: string
      if (viewMode === 'trends') {
        url = `${GEE_PROXY}/api/snow/trends/era5?band=${band}&startYear=1980&endYear=2024&month=${month}&metric=trend`
      } else if (viewMode === 'variability') {
        url = `${GEE_PROXY}/api/snow/trends/era5?band=${band}&startYear=1980&endYear=2024&month=${month}&metric=variability`
      } else {
        url = `${GEE_PROXY}/api/snow/tiles/era5?year=${year}&month=${String(month).padStart(2, '0')}&band=${band}`
      }
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.tileUrl) {
        const layer = L.tileLayer(data.tileUrl, { opacity: 0.75, maxZoom: 12 })
        layer.addTo(map); tileLayerRef.current = layer
      } else setTileError(data.error || 'No tile URL')
    } catch (e: any) { setTileError(e.message) }
    setLoading(false)
  }, [year, month, band, viewMode])

  useEffect(() => {
    if (mapReady && !timelapseActive) loadTileLayer()
  }, [mapReady, year, month, band, viewMode, timelapseActive])

  useEffect(() => {
    if (!clickedPoint) return
    setTsLoading(true)
    fetch(`${GEE_PROXY}/api/snow/stats/era5?lat=${clickedPoint.lat}&lon=${clickedPoint.lon}&start=2015-01&end=2024-12&band=${band}`)
      .then(r => r.json())
      .then(data => { setTimeSeries(data.series || []); setTsLoading(false) })
      .catch(() => setTsLoading(false))
  }, [clickedPoint, band])

  const startTimelapse = useCallback(async () => {
    setTimelapseActive(true); setTimelapseIdx(0); setPlaying(false); setAnimLoading(true)
    try {
      let resp: Response
      if (animMode === 'seasonal') {
        resp = await fetch(`${GEE_PROXY}/api/snow/animation/era5/seasonal?year=${seasonalYear}&band=${band}`)
      } else {
        resp = await fetch(`${GEE_PROXY}/api/snow/animation/era5?startYear=2015&endYear=2024&month=${String(month).padStart(2, '0')}&band=${band}`)
      }
      const data = await resp.json()
      setTimelapseFrames(data.frames || [])
      setAnimLoading(false)
      if ((data.frames || []).length > 0) setPlaying(true)
    } catch { setTimelapseFrames([]); setAnimLoading(false) }
  }, [month, band, animMode, seasonalYear])

  useEffect(() => {
    if (!timelapseActive || !timelapseFrames.length) return
    const frame = timelapseFrames[timelapseIdx]
    if (frame?.tileUrl) loadTileLayer(frame.tileUrl)
  }, [timelapseIdx, timelapseActive, timelapseFrames])

  useEffect(() => { playRef.current = playing }, [playing])
  useEffect(() => {
    if (!playing || !timelapseFrames.length) return
    let cancelled = false
    const advance = () => {
      if (cancelled || !playRef.current) return
      setTimelapseIdx(prev => prev < timelapseFrames.length - 1 ? prev + 1 : 0)
      setTimeout(advance, 800)
    }
    setTimeout(advance, 800)
    return () => { cancelled = true }
  }, [playing, timelapseFrames.length])

  const navigateTo = useCallback((r: typeof GLOBAL_REGIONS[0]) => {
    mapInstanceRef.current?.flyTo([r.lat, r.lon], r.zoom, { duration: 1.5 })
  }, [])

  const yearlyData = useMemo(() => {
    const byYear: Record<string, number> = {}
    timeSeries.forEach(d => { const y = d.date.slice(0, 4); byYear[y] = (byYear[y] || 0) + d.value })
    return Object.entries(byYear).map(([y, v]) => ({ year: y, total: Math.round(v * 10000) / 10000 }))
  }, [timeSeries])

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="max-w-[1800px] mx-auto flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 mr-1">Band:</span>
          {ERA5_BANDS.map(b => (
            <button key={b.key} onClick={() => setBand(b.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                band === b.key ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}>{b.icon} {b.label}</button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-2" />
          <span className="text-xs text-slate-400">View:</span>
          {VIEW_MODES.map(vm => (
            <button key={vm.key} onClick={() => vm.key !== 'season_shift' && setViewMode(vm.key)}
              title={vm.desc}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                vm.key === 'season_shift' ? 'bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100' :
                viewMode === vm.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}>{vm.icon} {vm.label}</button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-2" />
          <span className="text-xs text-slate-400">Month:</span>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700">
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          {viewMode === 'snapshot' && (
            <>
              <span className="text-xs text-slate-400">Year:</span>
              <input type="range" min={1950} max={2024} value={year} onChange={e => setYear(Number(e.target.value))} className="w-32" />
              <span className="text-xs text-blue-600 font-bold w-10">{year}</span>
            </>
          )}
          {loading && <span className="text-xs text-amber-500 animate-pulse">Loading tiles...</span>}
          {tileError && <span className="text-xs text-red-500">⚠ {tileError}</span>}
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3" style={{ height: 'calc(100vh - 140px)' }}>
          <div className="lg:col-span-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <h3 className="font-semibold mb-2 text-slate-700 text-sm">📍 Regions</h3>
              <div className="space-y-0.5">
                {GLOBAL_REGIONS.map(r => (
                  <button key={r.name} onClick={() => navigateTo(r)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-500 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                  >{r.name}</button>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <h3 className="font-semibold mb-2 text-slate-700 text-sm">🎬 Animation</h3>
              <div className="flex gap-1 mb-2">
                <button onClick={() => setAnimMode('seasonal')}
                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${animMode === 'seasonal' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'}`}>📅 Seasonal</button>
                <button onClick={() => setAnimMode('year-over-year')}
                  className={`flex-1 px-2 py-1 rounded text-xs font-medium transition-colors ${animMode === 'year-over-year' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'}`}>📊 YoY</button>
              </div>
              {!timelapseActive ? (
                <button onClick={startTimelapse}
                  className="w-full px-3 py-2 rounded text-xs font-medium bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-colors">
                  ▶️ Load Animation
                </button>
              ) : (
                <div className="space-y-2">
                  {animLoading ? (
                    <div className="text-xs text-amber-500 animate-pulse text-center py-2">Loading frames...</div>
                  ) : timelapseFrames.length > 0 ? (
                    <>
                      <div className="text-center text-2xl font-bold text-blue-600">
                        {animMode === 'seasonal' ? timelapseFrames[timelapseIdx]?.monthName : timelapseFrames[timelapseIdx]?.year}
                      </div>
                      <input type="range" min={0} max={timelapseFrames.length - 1} value={timelapseIdx}
                        onChange={e => { setTimelapseIdx(Number(e.target.value)); setPlaying(false) }} className="w-full" />
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setTimelapseIdx(Math.max(0, timelapseIdx - 1))}
                          className="px-3 py-1 bg-slate-100 rounded text-xs hover:bg-slate-200 border border-slate-200">⏮</button>
                        <button onClick={() => setPlaying(!playing)}
                          className="px-4 py-1 bg-blue-600 text-white rounded text-xs font-bold hover:bg-blue-500">{playing ? '⏸' : '▶️'}</button>
                        <button onClick={() => setTimelapseIdx(Math.min(timelapseFrames.length - 1, timelapseIdx + 1))}
                          className="px-3 py-1 bg-slate-100 rounded text-xs hover:bg-slate-200 border border-slate-200">⏭</button>
                      </div>
                    </>
                  ) : null}
                  <button onClick={() => { setTimelapseActive(false); setPlaying(false); loadTileLayer() }}
                    className="w-full px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-700">✕ Exit</button>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <h3 className="font-semibold mb-2 text-slate-700 text-sm">ℹ️ About</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                ERA5-Land reanalysis from ECMWF via Google Earth Engine. ~9km resolution, global, 1950–present.
                Click map for time series. Supports Daymet (N. America 1km, 1980+), MODIS (500m snow cover), and SNODAS (US 1km).
              </p>
            </div>
          </div>

          <div className="lg:col-span-3 relative rounded-lg overflow-hidden border border-slate-200 shadow-sm">
            <div ref={mapRef} className="w-full h-full" style={{ minHeight: 500 }} />
            {timelapseActive && timelapseFrames.length > 0 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/80 backdrop-blur-sm px-6 py-2 rounded-lg border border-slate-200 shadow-md z-[1000]">
                <span className="text-3xl font-bold text-blue-600">
                  {animMode === 'seasonal' ? `${timelapseFrames[timelapseIdx]?.monthName} ${seasonalYear}` : `${MONTHS[month - 1]} ${timelapseFrames[timelapseIdx]?.year}`}
                </span>
              </div>
            )}
            {clickedPoint && (
              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm z-[1000] text-xs text-slate-700">
                📍 {clickedPoint.lat}°, {clickedPoint.lon}°
              </div>
            )}
          </div>

          <div className="lg:col-span-1 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            {clickedPoint ? (
              <div className="space-y-3">
                <div className="bg-white rounded-lg p-3 border border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-sm text-slate-700">📍 {clickedPoint.lat}°, {clickedPoint.lon}°</h3>
                    <button onClick={() => setClickedPoint(null)} className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
                  </div>
                </div>
                {tsLoading ? (
                  <div className="bg-white rounded-lg p-4 border border-slate-200 text-center">
                    <div className="text-xs text-amber-500 animate-pulse">Querying GEE...</div>
                  </div>
                ) : timeSeries.length > 0 ? (
                  <>
                    <div className="bg-white rounded-lg p-3 border border-slate-200">
                      <h3 className="font-semibold text-sm text-slate-700 mb-2">📊 Monthly Series</h3>
                      <div style={{ height: 200 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={timeSeries}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 8 }} interval={11} />
                            <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} />
                            <RTooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                            <Area type="monotone" dataKey="value" stroke="#3b82f6" fill="#3b82f620" strokeWidth={1.5} name={BAND_LABELS[band]} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                    {yearlyData.length > 0 && (
                      <div className="bg-white rounded-lg p-3 border border-slate-200">
                        <h3 className="font-semibold text-sm text-slate-700 mb-2">📅 Annual Totals</h3>
                        <div style={{ height: 150 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={yearlyData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 9 }} />
                              <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} />
                              <RTooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                              <Bar dataKey="total" fill="#6366f1" radius={[2, 2, 0, 0]} name="Annual Total" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="bg-white rounded-lg p-3 border border-slate-200 text-center text-xs text-slate-500">
                    No data at this location
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg p-4 border border-slate-200 text-center">
                <div className="text-4xl mb-3">❄️</div>
                <p className="text-slate-500 text-sm">Click anywhere on the map</p>
                <p className="text-slate-400 text-xs mt-1">to see a 10-year snow time series</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// US DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function USDashboard() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [usSource, setUsSource] = useState<USSource>('snodas')
  const [band, setBand] = useState<USBand>('Snow_Depth')
  const [daymetBand, setDaymetBand] = useState<DaymetBand>('swe')
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [loading, setLoading] = useState(false)
  const [tileError, setTileError] = useState<string | null>(null)
  const [clickedPoint, setClickedPoint] = useState<{lat: number, lon: number} | null>(null)
  const [timeSeries, setTimeSeries] = useState<{date: string, value: number}[]>([])
  const [_tsLoading, setTsLoading] = useState(false)
  void _tsLoading

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    let cancelled = false
    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !mapRef.current) return
      const map = L.map(mapRef.current, { center: [39, -98], zoom: 4, zoomControl: true })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO', maxZoom: 18,
      }).addTo(map)
      map.on('click', (e: any) => {
        setClickedPoint({ lat: Math.round(e.latlng.lat * 100) / 100, lon: Math.round(e.latlng.lng * 100) / 100 })
      })
      mapInstanceRef.current = map
      setMapReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [])

  const loadTile = useCallback(async () => {
    if (!mapInstanceRef.current) return
    const L = (await import('leaflet')).default
    const map = mapInstanceRef.current
    if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null }
    setLoading(true); setTileError(null)
    try {
      let url: string
      if (usSource === 'daymet') {
        const yr = new Date(date).getFullYear()
        const mo = String(new Date(date).getMonth() + 1).padStart(2, '0')
        url = `${GEE_PROXY}/api/snow/tiles/daymet?year=${yr}&month=${mo}&band=${daymetBand}`
      } else {
        url = `${GEE_PROXY}/api/snow/tiles/snodas?date=${date}&band=${band}`
      }
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.tileUrl) {
        const layer = L.tileLayer(data.tileUrl, { opacity: 0.8, maxZoom: 14 })
        layer.addTo(map); tileLayerRef.current = layer
      } else setTileError(data.error || 'Failed')
    } catch (e: any) { setTileError(e.message) }
    setLoading(false)
  }, [date, band, usSource, daymetBand])

  useEffect(() => { if (mapReady) loadTile() }, [mapReady, date, band, usSource, daymetBand])

  useEffect(() => {
    if (!clickedPoint) return
    setTsLoading(true)
    const yr = new Date(date).getFullYear()
    const mo = new Date(date).getMonth()
    const seasonStart = mo >= 9 ? `${yr}-10-01` : `${yr - 1}-10-01`
    const seasonEnd = mo >= 9 ? `${yr + 1}-04-30` : `${yr}-04-30`
    fetch(`${GEE_PROXY}/api/snow/stats/snodas?lat=${clickedPoint.lat}&lon=${clickedPoint.lon}&start=${seasonStart}&end=${seasonEnd}&band=${band}`)
      .then(r => r.json())
      .then(data => { setTimeSeries(data.series || []); setTsLoading(false) })
      .catch(() => setTsLoading(false))
  }, [clickedPoint, band, date])

  const shiftDate = useCallback((days: number) => {
    const d = new Date(date); d.setDate(d.getDate() + days); setDate(d.toISOString().slice(0, 10))
  }, [date])

  const navigateTo = useCallback((r: typeof US_REGIONS[0]) => {
    mapInstanceRef.current?.flyTo([r.lat, r.lon], r.zoom, { duration: 1.5 })
  }, [])

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="max-w-[1800px] mx-auto flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400 mr-1">Source:</span>
          <button onClick={() => setUsSource('snodas')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${usSource === 'snodas' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'}`}>SNODAS 1km</button>
          <button onClick={() => setUsSource('daymet')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${usSource === 'daymet' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'}`}>Daymet 1km</button>
          <div className="w-px h-5 bg-slate-200 mx-1" />
          <span className="text-xs text-slate-400">Band:</span>
          {usSource === 'snodas' ? US_BANDS.map(b => (
            <button key={b.key} onClick={() => setBand(b.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                band === b.key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}>{b.icon} {b.label}</button>
          )) : DAYMET_BANDS.map(b => (
            <button key={b.key} onClick={() => setDaymetBand(b.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                daymetBand === b.key ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}>{b.icon} {b.label}</button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-2" />
          <button onClick={() => shiftDate(-1)} className="px-2 py-1 bg-slate-100 rounded text-xs hover:bg-slate-200 border border-slate-200">◀</button>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} min="2003-10-01"
            className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700" />
          <button onClick={() => shiftDate(1)} className="px-2 py-1 bg-slate-100 rounded text-xs hover:bg-slate-200 border border-slate-200">▶</button>
          {loading && <span className="text-xs text-amber-500 animate-pulse ml-2">Loading...</span>}
          {tileError && <span className="text-xs text-red-500 ml-2">⚠ {tileError}</span>}
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3" style={{ height: 'calc(100vh - 140px)' }}>
          <div className="lg:col-span-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <h3 className="font-semibold mb-2 text-emerald-700 text-sm">📍 Regions</h3>
              <div className="space-y-0.5">
                {US_REGIONS.map(r => (
                  <button key={r.name} onClick={() => navigateTo(r)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                  >{r.name}</button>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <h3 className="font-semibold mb-2 text-emerald-700 text-sm">ℹ️ About</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {usSource === 'snodas' ? 'SNODAS: 1km CONUS snow data assimilation, daily since 2003.' : 'Daymet V4: 1km N. America climate, daily since 1980. Snowfall proxy: precip where tmin < 0°C.'}
              </p>
            </div>
          </div>

          <div className="lg:col-span-3 relative rounded-lg overflow-hidden border border-slate-200 shadow-sm">
            <div ref={mapRef} className="w-full h-full" style={{ minHeight: 500 }} />
            {clickedPoint && (
              <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm z-[1000] text-xs text-slate-700">
                📍 {clickedPoint.lat}°N, {Math.abs(clickedPoint.lon)}°W
              </div>
            )}
          </div>

          <div className="lg:col-span-1 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            {clickedPoint && timeSeries.length > 0 ? (
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-sm text-slate-700">📊 Season</h3>
                  <button onClick={() => setClickedPoint(null)} className="text-slate-400 hover:text-slate-700 text-sm">✕</button>
                </div>
                <div style={{ height: 250 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={timeSeries}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 8 }} interval={Math.floor(timeSeries.length / 8)} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} />
                      <RTooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 11 }} />
                      <Area type="monotone" dataKey="value" stroke="#10b981" fill="#10b98120" strokeWidth={1.5} name={BAND_LABELS[band]} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg p-4 border border-slate-200 text-center">
                <div className="text-4xl mb-3">🏔️</div>
                <p className="text-slate-500 text-sm">Click the map</p>
                <p className="text-slate-400 text-xs mt-1">for seasonal time series</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════
// MODIS DASHBOARD
// ═══════════════════════════════════════════════════════════════════════
function MODISDashboard() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [year, setYear] = useState(2024)
  const [month, setMonth] = useState(1)
  const [modisView, setModisView] = useState<MODISViewMode>('snapshot')
  const [loading, setLoading] = useState(false)
  const [tileError, setTileError] = useState<string | null>(null)

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    let cancelled = false
    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !mapRef.current) return
      const map = L.map(mapRef.current, { center: [30, 0], zoom: 2, zoomControl: true })
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO', maxZoom: 18,
      }).addTo(map)
      mapInstanceRef.current = map
      setMapReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [])

  const loadTileLayer = useCallback(async () => {
    if (!mapInstanceRef.current) return
    const L = (await import('leaflet')).default
    const map = mapInstanceRef.current
    if (tileLayerRef.current) { map.removeLayer(tileLayerRef.current); tileLayerRef.current = null }
    setLoading(true); setTileError(null)
    try {
      let url: string
      if (modisView === 'snapshot') {
        url = `${GEE_PROXY}/api/snow/tiles/modis?year=${year}&month=${String(month).padStart(2, '0')}&band=NDSI_Snow_Cover`
      } else if (modisView === 'snowdays') {
        url = `${GEE_PROXY}/api/snow/tiles/modis/snowdays?year=${year}`
      } else {
        url = `${GEE_PROXY}/api/snow/trends/modis?metric=${modisView}&startYear=2001&endYear=2024`
      }
      const resp = await fetch(url)
      const data = await resp.json()
      if (data.tileUrl) {
        const layer = L.tileLayer(data.tileUrl, { opacity: 0.75, maxZoom: 12 })
        layer.addTo(map); tileLayerRef.current = layer
      } else setTileError(data.error || 'No tile URL')
    } catch (e: any) { setTileError(e.message) }
    setLoading(false)
  }, [year, month, modisView])

  useEffect(() => { if (mapReady) loadTileLayer() }, [mapReady, year, month, modisView])

  const MODIS_VIEWS: { key: MODISViewMode; label: string; icon: string }[] = [
    { key: 'snapshot', label: 'Snow Cover', icon: '📸' },
    { key: 'snowdays', label: 'Snow Days', icon: '📅' },
    { key: 'snowdays_trend', label: 'Days Trend', icon: '📈' },
    { key: 'onset_trend', label: 'Onset', icon: '🌨️' },
    { key: 'melt_trend', label: 'Melt', icon: '☀️' },
    { key: 'duration_trend', label: 'Duration', icon: '⏱️' },
  ]

  const navigateTo = useCallback((r: typeof GLOBAL_REGIONS[0]) => {
    mapInstanceRef.current?.flyTo([r.lat, r.lon], r.zoom, { duration: 1.5 })
  }, [])

  return (
    <>
      <div className="bg-white border-b border-slate-200 px-4 py-2">
        <div className="max-w-[1800px] mx-auto flex items-center gap-2 flex-wrap">
          <span className="text-xs text-slate-400">View:</span>
          {MODIS_VIEWS.map(v => (
            <button key={v.key} onClick={() => setModisView(v.key)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                modisView === v.key ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}>{v.icon} {v.label}</button>
          ))}
          <div className="w-px h-5 bg-slate-200 mx-2" />
          {(modisView === 'snapshot' || modisView === 'snowdays') && (
            <>
              <span className="text-xs text-slate-400">Year:</span>
              <input type="range" min={2001} max={2024} value={year} onChange={e => setYear(Number(e.target.value))} className="w-28" />
              <span className="text-xs text-cyan-600 font-bold w-10">{year}</span>
            </>
          )}
          {modisView === 'snapshot' && (
            <>
              <span className="text-xs text-slate-400">Month:</span>
              <select value={month} onChange={e => setMonth(Number(e.target.value))}
                className="bg-white border border-slate-200 rounded px-2 py-1 text-xs text-slate-700">
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </>
          )}
          {loading && <span className="text-xs text-amber-500 animate-pulse">Loading...</span>}
          {tileError && <span className="text-xs text-red-500">⚠ {tileError}</span>}
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3" style={{ height: 'calc(100vh - 140px)' }}>
          <div className="lg:col-span-1 space-y-3 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 160px)' }}>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <h3 className="font-semibold mb-2 text-cyan-700 text-sm">📍 Regions</h3>
              <div className="space-y-0.5">
                {GLOBAL_REGIONS.map(r => (
                  <button key={r.name} onClick={() => navigateTo(r)}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-500 hover:bg-cyan-50 hover:text-cyan-700 transition-colors"
                  >{r.name}</button>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 border border-slate-200">
              <h3 className="font-semibold mb-2 text-cyan-700 text-sm">ℹ️ MODIS</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                MODIS/Terra Snow Cover (MOD10A1 v061) — 500m resolution, global, daily since Feb 2000.
                NDSI-based snow detection. Snow days use NDSI {'>'} 40 threshold.
                Trend views show change per decade (2001–2024).
              </p>
            </div>
          </div>

          <div className="lg:col-span-4 relative rounded-lg overflow-hidden border border-slate-200 shadow-sm">
            <div ref={mapRef} className="w-full h-full" style={{ minHeight: 500 }} />
          </div>
        </div>
      </div>
    </>
  )
}
