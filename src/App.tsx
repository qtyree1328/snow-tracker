import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, Area, AreaChart, Cell, ReferenceLine, ComposedChart, Scatter,
} from 'recharts'


// ═══════════════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════════════
type StoryTab = 'where' | 'changing' | 'shifting' | 'season' | 'explorer'
type Lens = 'global' | 'us' | 'mountain'
type TimeRange = '5' | '10' | '20' | 'all'

const GEE_PROXY = 'https://gee-proxy-787413290356.us-east1.run.app'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Use local CC proxy for SNOTEL (USDA blocks Cloud Run IPs)
const SNOTEL_BULK_URL = '/api/snotel?type=stations'

interface SnotelStation {
  id: string; name: string; state: string; elevation: number
  lat: number; lon: number; swe: number | null; pctMedian: number | null
}
interface HydroPoint {
  date: string; dowy: number; swe: number | null; median: number | null; pctMedian: number | null
}

// Period-of-record daily data point
interface PORDay { date: string; swe: number | null }

// Derived analytics from POR data
interface StationAnalytics {
  // Per water-year summaries
  waterYears: { wy: number; peakSWE: number; peakDate: string; onsetDate: string | null; meltOutDate: string | null; seasonDays: number }[]
  // Trend
  peakTrendSlope: number // inches per decade
  peakTrendPct: number // % change over record
  peakTrendSignificant: boolean
  // Season timing
  avgOnsetDOWY: number
  currentOnsetDOWY: number | null
  onsetTrendDays: number // days per decade shift
  avgMeltOutDOWY: number
  meltOutTrendDays: number
  avgSeasonLength: number
  seasonLengthChange: number // days change over record
  // Current context
  currentRank: number // rank of current SWE for this DOWY (1 = lowest)
  totalYears: number
  belowMedianCount10yr: number // how many of last 10 years were below median at this date
  projectedPeak: number | null
  // Monthly climatology
  monthlyClim: { month: string; avg: number; min: number; max: number }[]
  // Nearby comparison
  nearbyComparison: { name: string; pctMedian: number | null }[]
  // Regional
  regionName: string
  regionAvgPct: number
}

const TAB_CONFIG: { key: StoryTab; question: string; icon: string; lenses: { key: Lens; label: string; icon: string }[] }[] = [
  {
    key: 'where', question: 'Where does it snow?', icon: '',
    lenses: [
      { key: 'us', label: 'US Detail', icon: '' },
      { key: 'global', label: 'Global', icon: '' },
      { key: 'mountain', label: 'Station', icon: '' },
    ],
  },
  {
    key: 'changing', question: 'Is snowfall changing?', icon: '',
    lenses: [
      { key: 'us', label: 'US Trends', icon: '' },
      { key: 'global', label: 'Global Trends', icon: '' },
      { key: 'mountain', label: 'Station Trends', icon: '' },
    ],
  },
  {
    key: 'shifting', question: 'Is winter shifting?', icon: '',
    lenses: [
      { key: 'global', label: 'Season Map', icon: '' },
      { key: 'mountain', label: 'Station Compare', icon: '' },
    ],
  },
  {
    key: 'season', question: 'How is this season?', icon: '',
    lenses: [
      { key: 'us', label: 'Current Map', icon: '' },
      { key: 'mountain', label: 'Station Check', icon: '' },
    ],
  },
  {
    key: 'explorer', question: 'Explorer', icon: '',
    lenses: [
      { key: 'us', label: 'US', icon: '' },
      { key: 'global', label: 'Global', icon: '' },
      { key: 'mountain', label: 'Station', icon: '' },
    ],
  },
]

const HERO_COPY: Record<string, string> = {
  'where-global': 'Average snowfall patterns at 9 km resolution — ERA5-Land reanalysis',
  'where-us': 'US snowfall detail at 1 km — Daymet / SNODAS',
  'where-mountain': 'Pick a station to see its snowfall profile',
  'changing-global': 'How global snowfall has shifted over decades',
  'changing-us': 'US snowfall trends at 1 km resolution',
  'changing-mountain': 'Annual peak SWE trends at individual stations',
  'shifting-global': 'When does winter arrive and depart? — MODIS snow phenology',
  'shifting-mountain': 'How snow season timing is changing at your station',
  'season-us': 'Live snow depth across the US — SNODAS daily',
  'season-mountain': 'Current SWE vs. historical median at your station',
  'explorer-global': 'Free exploration — switch datasets, layers, and color ramps',
  'explorer-us': 'Free exploration — switch datasets, layers, and color ramps',
  'explorer-mountain': 'Free exploration — pick any station, any analysis',
}

const REGIONS: Record<string, string[]> = {
  'Sierra Nevada': ['CA', 'NV'],
  'Rockies': ['CO', 'WY', 'MT', 'ID', 'UT'],
  'Cascades': ['WA', 'OR'],
  'Northeast': ['VT', 'NH', 'ME', 'NY'],
  'Southwest': ['AZ', 'NM'],
}

// ═══════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════
function getSnotelColor(pct: number | null): string {
  if (pct === null) return '#94a3b8'
  if (pct < 50) return '#ef4444'
  if (pct < 80) return '#f97316'
  if (pct < 100) return '#eab308'
  if (pct <= 120) return '#22c55e'
  return '#3b82f6'
}

function dateToDOWY(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  const wy = d.getMonth() >= 9 ? d.getFullYear() : d.getFullYear() - 1
  const wyStart = new Date(wy, 9, 1)
  return Math.floor((d.getTime() - wyStart.getTime()) / 86400000) + 1
}

function dowyToLabel(dowy: number): string {
  const months = ['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep']
  return months[Math.min(11, Math.floor((dowy - 1) / 30.4))]
}

function dowyToDate(dowy: number, wyYear: number): string {
  const start = new Date(wyYear, 9, 1)
  start.setDate(start.getDate() + dowy - 1)
  return `${MONTHS[start.getMonth()]} ${start.getDate()}`
}

const SNOW_VAR_CONFIG: Record<string, { era5Band: string; snodasBand: string; label: string; unit: string }> = {
  snowfall:   { era5Band: 'snowfall_sum', snodasBand: 'Snowfall',   label: 'Snowfall',   unit: 'mm' },
  snow_depth: { era5Band: 'snow_depth',   snodasBand: 'Snow_Depth', label: 'Snow Depth', unit: 'm' },
  snow_cover: { era5Band: 'snow_cover',   snodasBand: 'SWE',        label: 'Snow Cover', unit: '%' }, // SNODAS has no cover band; use SWE as proxy for US
}

function parseCSV(text: string): string[][] {
  return text.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => l.split(',').map(c => c.trim()))
}

function waterYearDates() {
  const now = new Date()
  const wyYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1
  return {
    start: `${wyYear}-10-01`,
    end: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
    wyYear,
  }
}

function dateToWY(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return d.getMonth() >= 9 ? d.getFullYear() + 1 : d.getFullYear()
}

// Simple linear regression: returns { slope, intercept, r2 }
function linearRegression(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 }
  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXX = xs.reduce((a, x) => a + x * x, 0)
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0)
  const denom = n * sumXX - sumX * sumX
  if (denom === 0) return { slope: 0, intercept: sumY / n, r2: 0 }
  const slope = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  const meanY = sumY / n
  const ssRes = ys.reduce((a, y, i) => a + (y - (slope * xs[i] + intercept)) ** 2, 0)
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0)
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0
  return { slope, intercept, r2 }
}

// ═══════════════════════════════════════════════════════════════════════
// POR ANALYTICS ENGINE
// ═══════════════════════════════════════════════════════════════════════
function computeAnalytics(
  porData: PORDay[],
  station: SnotelStation,
  allStations: SnotelStation[],
  currentWYHydro: HydroPoint[],
): StationAnalytics {
  // Group POR data by water year
  const byWY: Record<number, PORDay[]> = {}
  for (const d of porData) {
    if (d.swe === null) continue
    const wy = dateToWY(d.date)
    if (!byWY[wy]) byWY[wy] = []
    byWY[wy].push(d)
  }

  // Per water-year summaries
  const waterYears = Object.entries(byWY)
    .filter(([_, days]) => days.length > 60) // need at least ~2 months of data
    .map(([wyStr, days]) => {
      const wy = parseInt(wyStr)
      const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
      // Peak SWE
      let peakSWE = 0, peakDate = sorted[0].date
      for (const d of sorted) {
        if (d.swe !== null && d.swe > peakSWE) { peakSWE = d.swe; peakDate = d.date }
      }
      // Onset: first date SWE > 1"
      const onsetDay = sorted.find(d => d.swe !== null && d.swe > 1)
      const onsetDate = onsetDay?.date || null
      // Melt-out: last date SWE > 1" (after peak)
      const afterPeak = sorted.filter(d => d.date >= peakDate)
      const lastAbove = [...afterPeak].reverse().find(d => d.swe !== null && d.swe > 1)
      const meltOutDate = lastAbove?.date || null
      // Season length
      const seasonDays = onsetDate && meltOutDate
        ? Math.round((new Date(meltOutDate).getTime() - new Date(onsetDate).getTime()) / 86400000)
        : 0
      return { wy, peakSWE, peakDate, onsetDate, meltOutDate, seasonDays }
    })
    .sort((a, b) => a.wy - b.wy)

  // Peak SWE trend
  const peakXs = waterYears.map(w => w.wy)
  const peakYs = waterYears.map(w => w.peakSWE)
  const peakReg = linearRegression(peakXs, peakYs)
  const peakTrendSlope = peakReg.slope * 10 // per decade
  const span = waterYears.length > 1 ? waterYears[waterYears.length - 1].wy - waterYears[0].wy : 1
  const avgPeak = peakYs.length > 0 ? peakYs.reduce((a, b) => a + b, 0) / peakYs.length : 1
  const peakTrendPct = avgPeak > 0 ? (peakReg.slope * span / avgPeak) * 100 : 0

  // Season timing trends
  const onsetData = waterYears.filter(w => w.onsetDate).map(w => ({ wy: w.wy, dowy: dateToDOWY(w.onsetDate!) }))
  const onsetReg = onsetData.length > 5 ? linearRegression(onsetData.map(o => o.wy), onsetData.map(o => o.dowy)) : { slope: 0, r2: 0 }
  const avgOnsetDOWY = onsetData.length > 0 ? Math.round(onsetData.reduce((a, o) => a + o.dowy, 0) / onsetData.length) : 0

  const meltData = waterYears.filter(w => w.meltOutDate).map(w => ({ wy: w.wy, dowy: dateToDOWY(w.meltOutDate!) }))
  const meltReg = meltData.length > 5 ? linearRegression(meltData.map(m => m.wy), meltData.map(m => m.dowy)) : { slope: 0, r2: 0 }
  const avgMeltOutDOWY = meltData.length > 0 ? Math.round(meltData.reduce((a, m) => a + m.dowy, 0) / meltData.length) : 0

  const seasonsWithLength = waterYears.filter(w => w.seasonDays > 0)
  const avgSeasonLength = seasonsWithLength.length > 0 ? Math.round(seasonsWithLength.reduce((a, w) => a + w.seasonDays, 0) / seasonsWithLength.length) : 0
  const seasonReg = seasonsWithLength.length > 5 ? linearRegression(seasonsWithLength.map(s => s.wy), seasonsWithLength.map(s => s.seasonDays)) : { slope: 0 }

  // Current onset for this water year
  const { wyYear } = waterYearDates()
  const currentWY = waterYears.find(w => w.wy === wyYear)
  const currentOnsetDOWY = currentWY?.onsetDate ? dateToDOWY(currentWY.onsetDate) : null

  // Current rank: where does today's SWE fall historically for this day-of-water-year?
  const todayDOWY = dateToDOWY(new Date().toISOString().slice(0, 10))
  const currentSWE = station.swe ?? 0
  const historicalAtDOWY: number[] = []
  for (const [_, days] of Object.entries(byWY)) {
    const dayAtDOWY = days.find(d => {
      const dowy = dateToDOWY(d.date)
      return Math.abs(dowy - todayDOWY) <= 3 // within ±3 days
    })
    if (dayAtDOWY?.swe !== null && dayAtDOWY?.swe !== undefined) historicalAtDOWY.push(dayAtDOWY.swe)
  }
  historicalAtDOWY.sort((a, b) => a - b)
  const currentRank = historicalAtDOWY.filter(v => v < currentSWE).length + 1

  // Below median count in last 10 years
  const recent10 = waterYears.slice(-10)
  const medianPeak = peakYs.length > 0 ? [...peakYs].sort((a, b) => a - b)[Math.floor(peakYs.length / 2)] : 0
  const belowMedianCount10yr = recent10.filter(w => w.peakSWE < medianPeak).length

  // Projected peak: if we're before peak, extrapolate
  let projectedPeak: number | null = null
  if (currentWYHydro.length > 5) {
    const latestHydro = currentWYHydro[currentWYHydro.length - 1]
    const latestMedian = latestHydro.median
    const latestSWE = latestHydro.swe
    if (latestMedian && latestSWE && latestMedian > 0) {
      const ratio = latestSWE / latestMedian
      // Find typical peak median from historical medians
      const peakMedian = Math.max(...currentWYHydro.filter(h => h.median !== null).map(h => h.median!))
      if (peakMedian > latestMedian) {
        projectedPeak = Math.round(ratio * peakMedian * 10) / 10
      }
    }
  }

  // Monthly climatology from POR
  const monthlyBuckets: Record<number, number[]> = {}
  for (const d of porData) {
    if (d.swe === null) continue
    const mo = new Date(d.date + 'T00:00:00').getMonth()
    if (!monthlyBuckets[mo]) monthlyBuckets[mo] = []
    monthlyBuckets[mo].push(d.swe)
  }
  const monthlyClim = [9, 10, 11, 0, 1, 2, 3, 4, 5].map(mo => {
    const vals = monthlyBuckets[mo] || []
    const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
    const min = vals.length > 0 ? Math.min(...vals) : 0
    const max = vals.length > 0 ? Math.max(...vals) : 0
    return { month: MONTHS[mo], avg: Math.round(avg * 10) / 10, min: Math.round(min * 10) / 10, max: Math.round(max * 10) / 10 }
  })

  // Nearby stations comparison (within ~1° lat/lon)
  const nearby = allStations
    .filter(s => s.id !== station.id && Math.abs(s.lat - station.lat) < 1 && Math.abs(s.lon - station.lon) < 1 && s.pctMedian !== null)
    .sort((a, b) => {
      const da = Math.abs(a.lat - station.lat) + Math.abs(a.lon - station.lon)
      const db = Math.abs(b.lat - station.lat) + Math.abs(b.lon - station.lon)
      return da - db
    })
    .slice(0, 3)
    .map(s => ({ name: s.name, pctMedian: s.pctMedian }))

  // Regional average
  let regionName = 'Region'
  let regionStations: SnotelStation[] = []
  for (const [name, states] of Object.entries(REGIONS)) {
    if (states.includes(station.state)) {
      regionName = name
      regionStations = allStations.filter(s => states.includes(s.state) && s.pctMedian !== null)
      break
    }
  }
  const regionAvgPct = regionStations.length > 0
    ? Math.round(regionStations.reduce((a, s) => a + s.pctMedian!, 0) / regionStations.length)
    : 0

  return {
    waterYears,
    peakTrendSlope,
    peakTrendPct,
    peakTrendSignificant: peakReg.r2 > 0.15 && waterYears.length > 10,
    avgOnsetDOWY,
    currentOnsetDOWY,
    onsetTrendDays: onsetReg.slope * 10,
    avgMeltOutDOWY,
    meltOutTrendDays: meltReg.slope * 10,
    avgSeasonLength,
    seasonLengthChange: seasonReg.slope * span,
    currentRank,
    totalYears: historicalAtDOWY.length,
    belowMedianCount10yr,
    projectedPeak,
    monthlyClim,
    nearbyComparison: nearby,
    regionName,
    regionAvgPct,
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CSS
// ═══════════════════════════════════════════════════════════════════════
const snowCSS = `
/* ── Clean Design System — NO glass, NO blur, NO transparency ── */
.snow-panel { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.snow-panel-dark { background: #0f172a; border: 1px solid #1e293b; border-radius: 12px; }
.snow-btn { background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; color: #334155; font-size: 13px; padding: 8px 16px; cursor: pointer; transition: all 0.15s; }
.snow-btn:hover { background: #f1f5f9; border-color: #94a3b8; }
.snow-btn-active { background: #0369a1; border-color: #0369a1; color: #ffffff; }
.snow-next { background: #0369a1; color: white; border: none; border-radius: 12px; padding: 16px 48px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.snow-next:hover { background: #075985; }

.slide-up { animation: slideUp 0.4s cubic-bezier(0.16,1,0.3,1) forwards; }
@keyframes slideUp { from { transform: translateY(100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.fade-in { animation: fadeIn 0.4s ease forwards; }
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

.insight-card { border-left: 3px solid; padding: 8px 12px; border-radius: 0 8px 8px 0; margin-bottom: 6px; background: #f8fafc; }
.insight-card p { color: #475569; }
.insight-card strong { color: #0f172a; }

.hero-overlay { position: absolute; inset: 0; z-index: 3000; display: flex; align-items: center; justify-content: center; }
.hero-bg { position: absolute; inset: 0; background: linear-gradient(180deg, #f8fafc, #e0f2fe, #f8fafc); }
.hero-enter { animation: heroFadeIn 1s ease forwards; }
@keyframes heroFadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.hero-exit { animation: heroFadeOut 0.6s ease forwards; }
@keyframes heroFadeOut { from { opacity: 1; } to { opacity: 0; pointer-events: none; } }

.tab-active { background: #0369a1; color: #fff; border: none; }
.tab-inactive { color: #475569; }
.tab-inactive:hover { color: #0f172a; background: #f1f5f9; }
`

// ═══════════════════════════════════════════════════════════════════════
// STATION INSIGHTS PANEL (sub-component)
// ═══════════════════════════════════════════════════════════════════════
function StationInsightsPanel({
  station, hydroData, hydroLoading, analytics, analyticsLoading, activeTab,
}: {
  station: SnotelStation
  hydroData: HydroPoint[]
  hydroLoading: boolean
  analytics: StationAnalytics | null
  analyticsLoading: boolean
  activeTab: StoryTab
}) {
  const { wyYear } = waterYearDates()

  // Peak SWE bar chart data with trend line
  const peakChartData = useMemo(() => {
    if (!analytics) return []
    const wys = analytics.waterYears
    if (wys.length === 0) return []
    const xs = wys.map(w => w.wy)
    const ys = wys.map(w => w.peakSWE)
    const reg = linearRegression(xs, ys)
    return wys.map(w => ({
      wy: w.wy,
      peak: Math.round(w.peakSWE * 10) / 10,
      trend: Math.round((reg.slope * w.wy + reg.intercept) * 10) / 10,
    }))
  }, [analytics])

  return (
    <div className="space-y-3">
      {/* ─── CURRENT CONDITIONS ─── */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(3,105,161,0.06)', border: '1px solid rgba(3,105,161,0.1)' }}>
          <div className="text-2xl font-bold" style={{ color: '#0891b2' }}>
            {station.swe !== null ? `${station.swe}"` : 'N/A'}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>Current SWE</div>
        </div>
        <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(3,105,161,0.06)', border: '1px solid rgba(3,105,161,0.1)' }}>
          <div className="text-2xl font-bold" style={{ color: getSnotelColor(station.pctMedian) }}>
            {station.pctMedian !== null ? `${station.pctMedian}%` : 'N/A'}
          </div>
          <div className="text-[10px] mt-0.5" style={{ color: '#64748b' }}>of median</div>
        </div>
      </div>

      {/* ─── NARRATIVE INSIGHTS ─── */}
      {analyticsLoading ? (
        <div className="flex items-center gap-2 py-3">
          <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#0369a1', borderTopColor: 'transparent' }} />
          <span className="text-xs" style={{ color: '#64748b' }}>Computing historical analysis...</span>
        </div>
      ) : analytics ? (
        <div className="space-y-1.5">
          {/* Context-specific narratives */}
          {(activeTab === 'season' || activeTab === 'where') && (
            <>
              {/* Current season context */}
              <div className="insight-card" style={{ borderColor: getSnotelColor(station.pctMedian) }}>
                <p className="text-xs leading-relaxed">
                  {station.pctMedian !== null
                    ? station.pctMedian >= 120
                      ? `${station.name} is running well above normal at ${station.pctMedian}% of median.`
                      : station.pctMedian >= 90
                        ? `${station.name} is near normal at ${station.pctMedian}% of median.`
                        : station.pctMedian >= 50
                          ? `${station.name} is below normal at ${station.pctMedian}% of median — a moderate deficit.`
                          : `${station.name} is critically low at ${station.pctMedian}% of median.`
                    : `No median comparison available.`}
                  {analytics.currentRank > 0 && analytics.totalYears > 5 && (
                    <> This is the <strong>{ordinal(analytics.currentRank)} {analytics.currentRank <= 3 ? 'lowest' : analytics.currentRank >= analytics.totalYears - 2 ? 'highest' : ''}</strong> SWE on record for this date ({analytics.totalYears} years).</>
                  )}
                </p>
              </div>

              {analytics.projectedPeak !== null && (
                <div className="insight-card" style={{ borderColor: '#6366f1' }}>
                  <p className="text-xs leading-relaxed">
                    At the current pace, peak SWE will reach approximately <strong>{analytics.projectedPeak}"</strong> vs. a typical peak of {analytics.waterYears.length > 0 ? Math.round([...analytics.waterYears].sort((a, b) => a.peakSWE - b.peakSWE)[Math.floor(analytics.waterYears.length / 2)].peakSWE * 10) / 10 : '?'}".
                  </p>
                </div>
              )}

              {analytics.belowMedianCount10yr > 0 && (
                <div className="insight-card" style={{ borderColor: '#f59e0b' }}>
                  <p className="text-xs leading-relaxed">
                    <strong>{analytics.belowMedianCount10yr} of the last 10 years</strong> were below median at this point in the season.
                  </p>
                </div>
              )}
            </>
          )}

          {(activeTab === 'changing' || activeTab === 'where') && analytics.waterYears.length > 5 && (
            <>
              <div className="insight-card" style={{ borderColor: analytics.peakTrendSlope > 0 ? '#22c55e' : '#ef4444' }}>
                <p className="text-xs leading-relaxed">
                  Peak SWE has <strong>{analytics.peakTrendSlope > 0 ? 'increased' : 'decreased'}</strong> by {Math.abs(Math.round(analytics.peakTrendSlope * 10) / 10)}" per decade
                  ({Math.abs(Math.round(analytics.peakTrendPct))}% over the {analytics.waterYears.length}-year record).
                  {!analytics.peakTrendSignificant && <span className="text-slate-400"> (weak trend — high variability)</span>}
                </p>
              </div>
            </>
          )}

          {(activeTab === 'shifting' || activeTab === 'changing') && analytics.avgOnsetDOWY > 0 && (
            <>
              <div className="insight-card" style={{ borderColor: '#0891b2' }}>
                <p className="text-xs leading-relaxed">
                  Snow typically arrives around <strong>{dowyToDate(analytics.avgOnsetDOWY, wyYear - 1)}</strong>.
                  {analytics.currentOnsetDOWY !== null && (
                    <> This year it arrived {dowyToDate(analytics.currentOnsetDOWY, wyYear - 1)} — <strong>{Math.abs(analytics.currentOnsetDOWY - analytics.avgOnsetDOWY)} days {analytics.currentOnsetDOWY < analytics.avgOnsetDOWY ? 'earlier' : 'later'}</strong> than average.</>
                  )}
                </p>
              </div>

              {Math.abs(analytics.onsetTrendDays) > 0.5 && (
                <div className="insight-card" style={{ borderColor: '#7c3aed' }}>
                  <p className="text-xs leading-relaxed">
                    Snow onset has shifted <strong>{Math.abs(Math.round(analytics.onsetTrendDays))} days {analytics.onsetTrendDays > 0 ? 'later' : 'earlier'}</strong> per decade.
                    Melt-out has shifted <strong>{Math.abs(Math.round(analytics.meltOutTrendDays))} days {analytics.meltOutTrendDays > 0 ? 'later' : 'earlier'}</strong> per decade.
                    {analytics.avgSeasonLength > 0 && (
                      <> The snow season is now approximately <strong>{Math.abs(Math.round(analytics.seasonLengthChange))} days {analytics.seasonLengthChange > 0 ? 'longer' : 'shorter'}</strong> than the historical average of {analytics.avgSeasonLength} days.</>
                    )}
                  </p>
                </div>
              )}
            </>
          )}

          {/* Nearby comparison */}
          {analytics.nearbyComparison.length > 0 && (
            <div className="insight-card" style={{ borderColor: '#64748b' }}>
              <p className="text-xs leading-relaxed">
                <strong>Nearby:</strong>{' '}
                {analytics.nearbyComparison.map((n, i) => (
                  <span key={i}>
                    {n.name} <span style={{ color: getSnotelColor(n.pctMedian) }} className="font-semibold">{n.pctMedian}%</span>
                    {i < analytics.nearbyComparison.length - 1 ? ' · ' : ''}
                  </span>
                ))}
                {analytics.regionAvgPct > 0 && (
                  <>. The <strong>{analytics.regionName}</strong> average is <span className="font-semibold" style={{ color: getSnotelColor(analytics.regionAvgPct) }}>{analytics.regionAvgPct}%</span>.</>
                )}
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* ─── HYDROGRAPH ─── */}
      <div>
        <div style={{ color: "#64748b" }} className="text-[10px] uppercase tracking-wider mb-1.5 font-medium">Water Year Hydrograph</div>
        {hydroLoading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hydroData.length > 0 ? (
          <>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <LineChart data={hydroData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="dowy" tickFormatter={dowyToLabel} tick={{ fontSize: 9, fill: '#94a3b8' }} interval={29} />
                  <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={32} />
                  <RTooltip
                    contentStyle={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 11 }}
                    formatter={(v: any, name: any) => [v !== null ? `${v}"` : 'N/A', name]}
                    labelFormatter={d => `Day ${d} (${dowyToLabel(d as number)})`}
                  />
                  <Line type="monotone" dataKey="median" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Median" />
                  <Line type="monotone" dataKey="swe" stroke="#3b82f6" strokeWidth={2.5} dot={false} name="Current WY" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-400">
              <span className="flex items-center gap-1"><span className="w-5 border-t-2 border-blue-500 inline-block" /> Current</span>
              <span className="flex items-center gap-1"><span className="w-5 border-t-2 border-dashed border-slate-400 inline-block" /> Median</span>
            </div>
          </>
        ) : (
          <div className="text-center text-xs text-slate-400 py-4">No hydrograph data</div>
        )}
      </div>

      {/* ─── PEAK SWE TREND (bar chart + trend line) ─── */}
      {peakChartData.length > 3 && (
        <div>
          <div style={{ color: "#64748b" }} className="text-[10px] uppercase tracking-wider mb-1.5 font-medium">Annual Peak SWE</div>
          <div style={{ height: 150 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <ComposedChart data={peakChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="wy" tick={{ fontSize: 8, fill: '#94a3b8' }} interval={Math.max(1, Math.floor(peakChartData.length / 8))} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={30} />
                <RTooltip
                  contentStyle={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 11 }}
                  formatter={(v: any, name: any) => [`${v}"`, name]}
                />
                <Bar dataKey="peak" fill="#818cf8" radius={[2, 2, 0, 0]} name="Peak SWE" opacity={0.7} />
                <Line type="monotone" dataKey="trend" stroke={analytics && analytics.peakTrendSlope > 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} dot={false} name="Trend" strokeDasharray="6 3" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* ─── MONTHLY CLIMATOLOGY ─── */}
      {analytics && analytics.monthlyClim.some(m => m.avg > 0) && (
        <div>
          <div style={{ color: "#64748b" }} className="text-[10px] uppercase tracking-wider mb-1.5 font-medium">Monthly SWE Climatology</div>
          <div style={{ height: 120 }}>
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={analytics.monthlyClim}>
                <defs>
                  <linearGradient id="climGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#94a3b8' }} />
                <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} width={28} />
                <RTooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 11 }}
                  formatter={(v: any, name: any) => [`${v}"`, name]} />
                <Area type="monotone" dataKey="max" stroke="none" fill="#e2e8f0" fillOpacity={0.5} name="Max" />
                <Area type="monotone" dataKey="avg" stroke="#6366f1" fill="url(#climGrad)" strokeWidth={2} name="Average" />
                <Area type="monotone" dataKey="min" stroke="none" fill="transparent" name="Min" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  )
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function getInfoContent(tab: StoryTab, lens: Lens): { source: string; resolution: string; method: string; collection: string } {
  const key = `${tab}-${lens}`
  const info: Record<string, { source: string; resolution: string; method: string; collection: string }> = {
    'where-global': { source: 'ERA5-Land Monthly Aggregated via Google Earth Engine', resolution: '~9 km global, 1950–present', method: 'Monthly snowfall totals computed from ECMWF ERA5-Land reanalysis. Tiles served via GEE proxy to Cloud Run.', collection: 'ECMWF/ERA5_LAND/MONTHLY_AGGR' },
    'where-us': { source: 'SNODAS Daily via GEE Community Catalog', resolution: '~1 km, CONUS, 2003–present', method: 'Daily snow depth from NOAA SNODAS model assimilation. Tiles served via GEE proxy.', collection: 'projects/climate-engine/snodas/daily' },
    'where-mountain': { source: 'SNOTEL via USDA NRCS AWDB Report Generator', resolution: '~900 point stations, 1978–present', method: 'Automated snow telemetry stations measuring SWE, snow depth, and temperature. Proxied through GEE Cloud Run.', collection: 'USDA NRCS SNOTEL Network' },
    'changing-global': { source: 'ERA5-Land Linear Regression', resolution: '~9 km global, 1950–present', method: 'Pixel-wise linear regression of snowfall_sum over selected period. Slope represents change per decade.', collection: 'ECMWF/ERA5_LAND/MONTHLY_AGGR' },
    'changing-us': { source: 'ERA5-Land Trends (Daymet when available)', resolution: '~9 km (ERA5) or ~1 km (Daymet)', method: 'Linear trend analysis on monthly snowfall aggregates over the US.', collection: 'ECMWF/ERA5_LAND/MONTHLY_AGGR' },
    'changing-mountain': { source: 'SNOTEL Period-of-Record Analysis', resolution: 'Point stations, variable record length', method: 'Linear regression on annual peak SWE at each SNOTEL station over its period of record.', collection: 'USDA NRCS SNOTEL Network' },
    'shifting-global': { source: 'MODIS MOD10A1 Snow Cover', resolution: '500 m, 2001–present', method: 'Day-of-year trends for snow cover onset and melt computed from MODIS daily snow cover.', collection: 'MODIS/061/MOD10A1' },
    'shifting-us': { source: 'MODIS MOD10A1 Snow Cover', resolution: '500 m, 2001–present', method: 'Day-of-year trends for snow cover onset and melt computed from MODIS daily snow cover.', collection: 'MODIS/061/MOD10A1' },
    'shifting-mountain': { source: 'SNOTEL Period-of-Record Analysis', resolution: 'Point stations, variable record length', method: 'Snow onset / melt-out DOY trends from SNOTEL daily SWE records, split by decade.', collection: 'USDA NRCS SNOTEL Network' },
    'season-global': { source: 'SNODAS Current Conditions', resolution: '~1 km, CONUS', method: 'Latest SNODAS snow depth model output.', collection: 'projects/climate-engine/snodas/daily' },
    'season-us': { source: 'SNODAS Current Conditions', resolution: '~1 km, CONUS', method: 'Latest SNODAS snow depth model output showing current snow conditions.', collection: 'projects/climate-engine/snodas/daily' },
    'season-mountain': { source: 'SNOTEL Current SWE vs 1991-2020 Median', resolution: '~900 point stations', method: 'Current SWE readings compared to 1991-2020 historical median for each station.', collection: 'USDA NRCS SNOTEL Network' },
  }
  return info[key] || info['where-global']
}

// ═══════════════════════════════════════════════════════════════════════
// COLOR RAMP HELPERS
// ═══════════════════════════════════════════════════════════════════════
const RAMP_GRADIENTS: Record<string, string> = {
  cool_blues: 'linear-gradient(to right, #1e1b4b, #312e81, #4338ca, #818cf8, #a78bfa, #e9d5ff, #faf5ff)',
  arctic: 'linear-gradient(to right, #042f2e, #0d9488, #5eead4, #ccfbf1, #f0fdfa)',
  warm_snow: 'linear-gradient(to right, #3b0764, #7c3aed, #a78bfa, #c4b5fd, #ede9fe, #faf5ff)',
  viridis: 'linear-gradient(to right, #440154, #31688e, #35b779, #fde725)',
  plasma: 'linear-gradient(to right, #0d0887, #7e03a8, #cc4778, #f89540, #f0f921)',
  deep_purple: 'linear-gradient(to right, #0c0a23, #2e1065, #6d28d9, #a78bfa, #ddd6fe)',
  red_blue: 'linear-gradient(to right, #dc2626, #fca5a5, #e5e7eb, #93c5fd, #1d4ed8)',
  brown_green: 'linear-gradient(to right, #92400e, #d97706, #fde68a, #e5e7eb, #86efac, #16a34a, #14532d)',
  spectral: 'linear-gradient(to right, #d53e4f, #fc8d59, #fee08b, #e6f598, #99d594, #3288bd)',
  coolwarm: 'linear-gradient(to right, #b2182b, #ef8a62, #fddbc7, #d1e5f0, #67a9cf, #2166ac)',
  orange_teal: 'linear-gradient(to right, #ea580c, #fed7aa, #e5e7eb, #a5f3fc, #0891b2)',
  piyg: 'linear-gradient(to right, #c51b7d, #e9a3c9, #fde0ef, #e6f5d0, #a1d76a, #4d9221)',
}

function getRampGradient(ramp: string, tab: string): string {
  if (tab === 'where' || tab === 'season') return RAMP_GRADIENTS[ramp] || RAMP_GRADIENTS.cool_blues
  if (tab === 'changing') return RAMP_GRADIENTS[ramp] || RAMP_GRADIENTS.red_blue
  if (tab === 'shifting') return RAMP_GRADIENTS[ramp] || RAMP_GRADIENTS.orange_teal
  return RAMP_GRADIENTS[ramp] || RAMP_GRADIENTS.cool_blues
}

function getAvailableRamps(tab: string): { key: string; label: string; gradient: string }[] {
  if (tab === 'where' || tab === 'season') {
    return [
      { key: 'cool_blues', label: 'Cool Blues', gradient: RAMP_GRADIENTS.cool_blues },
      { key: 'arctic', label: 'Arctic', gradient: RAMP_GRADIENTS.arctic },
      { key: 'warm_snow', label: 'Warm Snow', gradient: RAMP_GRADIENTS.warm_snow },
      { key: 'viridis', label: 'Viridis', gradient: RAMP_GRADIENTS.viridis },
      { key: 'plasma', label: 'Plasma', gradient: RAMP_GRADIENTS.plasma },
      { key: 'deep_purple', label: 'Deep Purple', gradient: RAMP_GRADIENTS.deep_purple },
    ]
  }
  if (tab === 'changing') {
    return [
      { key: 'red_blue', label: 'Red → Blue', gradient: RAMP_GRADIENTS.red_blue },
      { key: 'brown_green', label: 'Brown → Green', gradient: RAMP_GRADIENTS.brown_green },
      { key: 'spectral', label: 'Spectral', gradient: RAMP_GRADIENTS.spectral },
      { key: 'coolwarm', label: 'Cool Warm', gradient: RAMP_GRADIENTS.coolwarm },
      { key: 'piyg', label: 'PiYG', gradient: RAMP_GRADIENTS.piyg },
    ]
  }
  if (tab === 'shifting') {
    return [
      { key: 'orange_teal', label: 'Orange → Teal', gradient: RAMP_GRADIENTS.orange_teal },
      { key: 'red_blue', label: 'Red → Blue', gradient: RAMP_GRADIENTS.red_blue },
      { key: 'spectral', label: 'Spectral', gradient: RAMP_GRADIENTS.spectral },
      { key: 'coolwarm', label: 'Cool Warm', gradient: RAMP_GRADIENTS.coolwarm },
    ]
  }
  return [{ key: 'cool_blues', label: 'Cool Blues', gradient: RAMP_GRADIENTS.cool_blues }]
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════
export default function App() {
  const [activeTab, setActiveTab] = useState<StoryTab>('where')
  const [activeLens, setActiveLens] = useState<Lens>('global')
  const [timeRange, setTimeRange] = useState<TimeRange>('20')
  const [snowVar, setSnowVar] = useState<'snowfall' | 'snow_depth' | 'snow_cover'>('snowfall')

  // Map
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const tileLayerRef = useRef<any>(null)
  const baseTileRef = useRef<any>(null)
  const snotelLayerRef = useRef<any>(null)
  const [mapReady, setMapReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tileError, setTileError] = useState<string | null>(null)
  const [currentZoom, setCurrentZoom] = useState(3)

  // Grid stats
  const gridStatsRef = useRef<any>(null)
  const [gridStatsLoaded, setGridStatsLoaded] = useState(false)

  // Click / info panel
  const [clickedPoint, setClickedPoint] = useState<{ lat: number; lon: number } | null>(null)
  const [timeSeries, setTimeSeries] = useState<{ date: string; value: number }[]>([])
  const [tsLoading, setTsLoading] = useState(false)
  const [gridPointData, setGridPointData] = useState<any>(null)
  const [infoPanelOpen, setInfoPanelOpen] = useState(false)
  const [narrative, setNarrative] = useState('')

  // Animation
  const [playing, setPlaying] = useState(false)
  const [animSpeed, setAnimSpeed] = useState(1)
  const [timelapseFrames, setTimelapseFrames] = useState<any[]>([])
  const [timelapseIdx, setTimelapseIdx] = useState(0)
  const [timelapseActive, setTimelapseActive] = useState(false)
  const [animLoading, setAnimLoading] = useState(false)
  const playRef = useRef(false)
  const [showSpeedControl, setShowSpeedControl] = useState(false)

  // SNOTEL
  const [snotelStations, setSnotelStations] = useState<SnotelStation[]>([])
  const [snotelLoading, setSnotelLoading] = useState(false)
  const [snotelLoaded, setSnotelLoaded] = useState(false)
  const [selectedStation, setSelectedStation] = useState<SnotelStation | null>(null)
  const [stationSearch, setStationSearch] = useState('')
  const [hydroData, setHydroData] = useState<HydroPoint[]>([])
  const [hydroLoading, setHydroLoading] = useState(false)
  const [showStationDropdown, setShowStationDropdown] = useState(false)

  // POR analytics
  const porCacheRef = useRef<Record<string, PORDay[]>>({})
  const [analytics, setAnalytics] = useState<StationAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // Info modal (Issue 1)
  const [showInfoModal, setShowInfoModal] = useState(false)

  // Color ramp (Issue 4)
  type ColorRamp = 'cool_blues' | 'arctic' | 'warm_snow' | 'viridis' | 'plasma' | 'deep_purple' | 'red_blue' | 'brown_green' | 'spectral' | 'coolwarm' | 'orange_teal' | 'piyg'
  const [colorRamp, setColorRamp] = useState<ColorRamp>('cool_blues')

  // ── TEMPORARY EVAL MODE ──
  const [evalMode, setEvalMode] = useState(false)
  const [dataSource, setDataSource] = useState<'auto' | 'gcs' | 'gee-era5' | 'gee-snodas' | 'gee-daymet'>('auto')
  const [tileLoadTime, setTileLoadTime] = useState<number | null>(null)
  const [activeTileSource, setActiveTileSource] = useState<string>('')
  const [legendExpanded, setLegendExpanded] = useState(false)

  // Story flow
  const [showHero, setShowHero] = useState(true)
  const [heroExiting, setHeroExiting] = useState(false)
  const [showDataControls, setShowDataControls] = useState(false)

  // Smooth animation (Issue 4)
  const prevTileLayerRef = useRef<any>(null)

  // Shifting chart (Issue 5)
  const [shiftingPeriod, setShiftingPeriod] = useState<'10' | '20'>('20')
  const [shiftingData, setShiftingData] = useState<{ month: string; early: number; recent: number }[]>([])
  const [shiftingInsight, setShiftingInsight] = useState('')

  // Explorer question toggle (for explorer mode data loading)
  const [explorerQuestion, setExplorerQuestion] = useState<'where' | 'changing' | 'shifting' | 'season'>('where')

  // Derived - effectiveTab drives data loading, activeTab drives UI
  const isExplorerMode = activeTab === 'explorer'
  const effectiveTab: StoryTab = isExplorerMode ? explorerQuestion : activeTab
  const currentTabConfig = TAB_CONFIG.find(t => t.key === activeTab)!
  const heroText = HERO_COPY[`${effectiveTab}-${activeLens}`] || ''
  const isMountainLens = activeLens === 'mountain'

  // ═══════════════════════════════════════════════════════════════════
  // LOAD GRID STATS
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    fetch('/data/snow/grid_stats.json').then(r => r.json())
      .then(data => { gridStatsRef.current = data; setGridStatsLoaded(true) }).catch(() => {})
  }, [])

  // ═══════════════════════════════════════════════════════════════════
  // LOAD SNOTEL STATIONS
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!isMountainLens || snotelLoaded) return
    setSnotelLoading(true)
    fetch(SNOTEL_BULK_URL).then(r => r.text()).then(text => {
      const rows = parseCSV(text)
      const headerIdx = rows.findIndex(r => r[0]?.toLowerCase().includes('station id'))
      const dataRows = headerIdx >= 0 ? rows.slice(headerIdx + 1) : rows.slice(1)
      const parsed: SnotelStation[] = dataRows
        .filter(r => r.length >= 8 && r[4] && r[5])
        .map(r => ({
          id: r[0]?.trim(), name: r[1]?.trim(), state: r[2]?.trim(),
          elevation: parseFloat(r[3]) || 0, lat: parseFloat(r[4]) || 0, lon: parseFloat(r[5]) || 0,
          swe: r[6]?.trim() ? parseFloat(r[6]) : null, pctMedian: r[7]?.trim() ? parseFloat(r[7]) : null,
        }))
        .filter(s => s.lat !== 0 && s.lon !== 0 && s.id)
      setSnotelStations(parsed)
      setSnotelLoaded(true)
      setSnotelLoading(false)
    }).catch(() => setSnotelLoading(false))
  }, [isMountainLens, snotelLoaded])

  const filteredStations = useMemo(() => {
    if (!stationSearch || stationSearch.length < 2) return snotelStations.slice(0, 20)
    const q = stationSearch.toLowerCase()
    return snotelStations.filter(s => s.name.toLowerCase().includes(q) || s.state.toLowerCase().includes(q) || s.id.includes(q)).slice(0, 30)
  }, [snotelStations, stationSearch])

  const snotelSummary = useMemo(() => {
    const withData = snotelStations.filter(s => s.pctMedian !== null)
    const avg = withData.length > 0 ? Math.round(withData.reduce((a, s) => a + s.pctMedian!, 0) / withData.length) : 0
    const above = withData.filter(s => s.pctMedian! >= 100).length
    const below = withData.filter(s => s.pctMedian! < 100).length
    return { avg, above, below, total: withData.length }
  }, [snotelStations])

  // ═══════════════════════════════════════════════════════════════════
  // MAP INIT
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return
    let cancelled = false
    const init = async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !mapRef.current) return
      const map = L.map(mapRef.current, { center: [40, -30], zoom: 3, zoomControl: false, attributionControl: false })
      const base = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(map)
      baseTileRef.current = base
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      map.on('click', (e: any) => {
        if (activeLens === 'mountain') return
        const { lat, lng } = e.latlng
        setClickedPoint({ lat: Math.round(lat * 100) / 100, lon: Math.round(lng * 100) / 100 })
        setInfoPanelOpen(true)
      })
      map.on('zoomend', () => setCurrentZoom(map.getZoom()))
      mapInstanceRef.current = map
      setMapReady(true)
    }
    init()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) return
    map.off('click')
    map.on('click', (e: any) => {
      if (activeLens === 'mountain') return
      const { lat, lng } = e.latlng
      setClickedPoint({ lat: Math.round(lat * 100) / 100, lon: Math.round(lng * 100) / 100 })
      setInfoPanelOpen(true)
    })
  }, [activeLens])

  // Basemap
  useEffect(() => {
    if (!baseTileRef.current) return
    const useDark = effectiveTab === 'where' || effectiveTab === 'season' || activeTab === 'explorer'
    baseTileRef.current.setUrl(useDark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png')
  }, [activeTab, effectiveTab])

  // ═══════════════════════════════════════════════════════════════════
  // TILE HELPERS
  // ═══════════════════════════════════════════════════════════════════
  const clearTileLayer = useCallback(async () => {
    if (mapInstanceRef.current && tileLayerRef.current) { mapInstanceRef.current.removeLayer(tileLayerRef.current); tileLayerRef.current = null }
  }, [])

  const setTileFromUrl = useCallback(async (tileUrl: string, opts?: { opacity?: number; maxZoom?: number; maxNativeZoom?: number }) => {
    const L = (await import('leaflet')).default
    if (!mapInstanceRef.current) return
    if (tileLayerRef.current) mapInstanceRef.current.removeLayer(tileLayerRef.current)
    const layer = L.tileLayer(tileUrl, { opacity: opts?.opacity ?? 0.75, maxZoom: opts?.maxZoom ?? 12, maxNativeZoom: opts?.maxNativeZoom, errorTileUrl: '' })
    layer.addTo(mapInstanceRef.current)
    tileLayerRef.current = layer
  }, [])

  const clearSnotelMarkers = useCallback(async () => {
    if (mapInstanceRef.current && snotelLayerRef.current) { mapInstanceRef.current.removeLayer(snotelLayerRef.current); snotelLayerRef.current = null }
  }, [])

  const showSnotelMarkers = useCallback(async (stations: SnotelStation[]) => {
    if (!mapInstanceRef.current) return
    const L = (await import('leaflet')).default
    await clearSnotelMarkers()
    const group = L.layerGroup()
    for (const s of stations) {
      const color = getSnotelColor(s.pctMedian)
      const marker = L.circleMarker([s.lat, s.lon], { radius: 6, fillColor: color, color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.85 })
      marker.bindTooltip(`<b>${s.name}</b><br/>${s.swe !== null ? s.swe + '″ SWE' : ''} ${s.pctMedian !== null ? '• ' + s.pctMedian + '% of median' : ''}`, { direction: 'top', offset: [0, -8] })
      marker.on('click', (e: any) => { L.DomEvent.stopPropagation(e); selectStation(s) })
      group.addLayer(marker)
    }
    group.addTo(mapInstanceRef.current)
    snotelLayerRef.current = group
  }, [])

  // ═══════════════════════════════════════════════════════════════════
  // STATION SELECTION + POR ANALYTICS
  // ═══════════════════════════════════════════════════════════════════
  const selectStation = useCallback((station: SnotelStation) => {
    setSelectedStation(station)
    setShowStationDropdown(false)
    setStationSearch('')
    setInfoPanelOpen(true)
    setAnalytics(null)
    mapInstanceRef.current?.flyTo([station.lat, station.lon], 10, { duration: 1.5 })
    loadHydrograph(station)
    loadPORAnalytics(station)
  }, [snotelStations])

  const loadHydrograph = useCallback(async (station: SnotelStation) => {
    setHydroLoading(true)
    try {
      const { start, end } = waterYearDates()
      const triplet = `${station.id}:${station.state}:SNTL`
      const url = `/api/snotel?type=station&triplet=${triplet}&start=${start}&end=${end}&elements=WTEQ::value,WTEQ::median_1991,WTEQ::pctOfMedian_1991`
      const resp = await fetch(url)
      const text = await resp.text()
      const dataRows = parseCSV(text).filter(r => r[0]?.match(/^\d{4}-\d{2}-\d{2}$/))
      setHydroData(dataRows.map(r => ({
        date: r[0], dowy: dateToDOWY(r[0]),
        swe: r[1]?.trim() ? parseFloat(r[1]) : null,
        median: r[2]?.trim() ? parseFloat(r[2]) : null,
        pctMedian: r[3]?.trim() ? parseFloat(r[3]) : null,
      })))
    } catch { setHydroData([]) }
    setHydroLoading(false)
  }, [])

  const loadPORAnalytics = useCallback(async (station: SnotelStation) => {
    setAnalyticsLoading(true)
    try {
      const cacheKey = `${station.id}:${station.state}`
      let porData = porCacheRef.current[cacheKey]
      if (!porData) {
        const triplet = `${station.id}:${station.state}:SNTL`
        const url = `/api/snotel?type=por&triplet=${triplet}`
        const resp = await fetch(url)
        const text = await resp.text()
        const dataRows = parseCSV(text).filter(r => r[0]?.match(/^\d{4}-\d{2}-\d{2}$/))
        porData = dataRows.map(r => ({
          date: r[0],
          swe: r[1]?.trim() ? parseFloat(r[1]) : null,
        }))
        porCacheRef.current[cacheKey] = porData
      }
      // Wait for hydroData to be available (small delay)
      // We'll compute with what we have; hydroData may still be loading
      setTimeout(() => {
        const result = computeAnalytics(porData!, station, snotelStations, hydroData)
        setAnalytics(result)
        setAnalyticsLoading(false)
      }, 500)
    } catch {
      setAnalyticsLoading(false)
    }
  }, [snotelStations, hydroData])

  // Recompute analytics when hydroData arrives (for projected peak)
  useEffect(() => {
    if (!selectedStation || hydroData.length === 0 || analyticsLoading) return
    const cacheKey = `${selectedStation.id}:${selectedStation.state}`
    const porData = porCacheRef.current[cacheKey]
    if (porData) {
      const result = computeAnalytics(porData, selectedStation, snotelStations, hydroData)
      setAnalytics(result)
    }
  }, [hydroData])

  // ═══════════════════════════════════════════════════════════════════
  // SMART DATA LOADING
  // ═══════════════════════════════════════════════════════════════════
  const loadDataForView = useCallback(async () => {
    if (!mapInstanceRef.current) return
    await clearTileLayer()
    await clearSnotelMarkers()
    setTileError(null)

    if (isMountainLens) {
      if (snotelStations.length > 0) {
        showSnotelMarkers(snotelStations)
        mapInstanceRef.current.flyTo([42, -110], 5, { duration: 1.5 })
      }
      return
    }

    setLoading(true)
    const month = new Date().getMonth() + 1

    const varCfg = SNOW_VAR_CONFIG[snowVar]

    // GCS-hosted pre-rendered tiles (fast, no proxy needed)
    const GCS_TILES = 'https://storage.googleapis.com/snow-tracker-cogs/tiles'
    const GCS_TILE_SETS: Record<string, string> = {
      'where-us-snowfall': `${GCS_TILES}/daymet_avg_max_swe/{z}/{x}/{y}.png`,
      'changing-us-snowfall': `${GCS_TILES}/daymet_snowfall_trend/{z}/{x}/{y}.png`,
      'shifting-us-snowfall': `${GCS_TILES}/modis_snow_days/{z}/{x}/{y}.png`,
    }

    const t0 = performance.now()
    let sourceLabel = ''

    try {
      let url: string | null = null
      let sourceLabel = ''

      // GCS tiles — pre-rendered, instant, but static color ramp
      const gcsKey = `${effectiveTab}-${activeLens}-${snowVar}`
      const useGCS = GCS_TILE_SETS[gcsKey] && (dataSource === 'auto' || dataSource === 'gcs')
      const forceGEE = dataSource === 'gee-era5' || dataSource === 'gee-snodas' || dataSource === 'gee-daymet'

      if (useGCS && !forceGEE) {
        sourceLabel = `GCS Tiles (pre-rendered ${gcsKey.includes('daymet') || effectiveTab === 'where' ? 'Daymet 1km' : effectiveTab === 'shifting' ? 'MODIS 500m' : 'Daymet 1km'})`
        await setTileFromUrl(GCS_TILE_SETS[gcsKey], { maxNativeZoom: 7, maxZoom: 12 } as any)
        if (activeLens === 'us') mapInstanceRef.current.flyTo([39, -98], 4, { duration: 1.5 })
        setTileLoadTime(Math.round(performance.now() - t0))
        setActiveTileSource(sourceLabel)
        setLoading(false)
        return
      }

      if (effectiveTab === 'where') {
        if (activeLens === 'global') {
          url = `${GEE_PROXY}/api/snow/tiles/era5?year=2024&month=${String(month).padStart(2,'0')}&band=${varCfg.era5Band}&palette=${colorRamp}`
          sourceLabel = 'GEE Proxy → ERA5-Land 9km (live)'
        } else if (dataSource === 'gee-snodas') {
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
          url = `${GEE_PROXY}/api/snow/tiles/snodas?date=${yesterday.toISOString().slice(0,10)}&band=${varCfg.snodasBand}&palette=${colorRamp}`
          sourceLabel = 'GEE Proxy → SNODAS 1km (live, current day)'
          mapInstanceRef.current.flyTo([39, -98], 4, { duration: 1.5 })
        } else if (dataSource === 'gee-era5') {
          url = `${GEE_PROXY}/api/snow/tiles/era5?year=2024&month=${String(month).padStart(2,'0')}&band=${varCfg.era5Band}&palette=${colorRamp}`
          sourceLabel = 'GEE Proxy → ERA5-Land 9km (live)'
          mapInstanceRef.current.flyTo([39, -98], 4, { duration: 1.5 })
        } else {
          const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
          url = `${GEE_PROXY}/api/snow/tiles/snodas?date=${yesterday.toISOString().slice(0,10)}&band=${varCfg.snodasBand}&palette=${colorRamp}`
          sourceLabel = 'GEE Proxy → SNODAS 1km (live, current day)'
          mapInstanceRef.current.flyTo([39, -98], 4, { duration: 1.5 })
        }
      } else if (effectiveTab === 'changing') {
        const startYear = timeRange === '5' ? 2019 : timeRange === '10' ? 2014 : timeRange === '20' ? 2004 : 1980
        if (activeLens === 'global') {
          url = `${GEE_PROXY}/api/snow/trends/era5?band=${varCfg.era5Band}&startYear=${startYear}&endYear=2024&month=${month}&metric=trend&palette=${colorRamp}`
          sourceLabel = `GEE Proxy → ERA5-Land trend (${startYear}–2024)`
        } else {
          url = `${GEE_PROXY}/api/snow/trends/era5?band=${varCfg.era5Band}&startYear=${startYear}&endYear=2024&month=${month}&metric=trend&palette=${colorRamp}`
          sourceLabel = `GEE Proxy → ERA5-Land US trend (${startYear}–2024)`
          mapInstanceRef.current.flyTo([39, -98], 4, { duration: 1.5 })
        }
      } else if (effectiveTab === 'shifting') {
        if (activeLens === 'global' || activeLens === 'us') {
          // Load grid_stats for seasonal distribution curves
          if (gridStatsRef.current?.points?.length) {
            // Grid stats only have 2015-2024, so adjust periods
            const cutYear = shiftingPeriod === '10' ? 2019 : 2018
            // Compute NH average seasonal distribution from grid_stats
            const nhPoints = gridStatsRef.current.points.filter((p: any) => p.lat > 30)
            if (nhPoints.length > 0) {
              const monthOrder = [9, 10, 11, 0, 1, 2, 3, 4, 5] // Oct-Jun
              const monthLabels = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
              const earlyBuckets = new Array(9).fill(0)
              const recentBuckets = new Array(9).fill(0)
              let earlyCount = 0, recentCount = 0
              for (const pt of nhPoints) {
                if (!pt.annualTotals || !pt.monthlyClim) continue
                const years = Object.keys(pt.annualTotals).map(Number).sort()
                const earlyYears = years.filter((y: number) => y >= 2015 && y <= cutYear)
                const recentYears = years.filter((y: number) => y > cutYear && y <= 2024)
                if (earlyYears.length > 0 && recentYears.length > 0) {
                  const climSum = pt.monthlyClim.reduce((a: number, b: number) => a + b, 0)
                  if (climSum <= 0) continue
                  const earlyAvgTotal = earlyYears.reduce((s: number, y: number) => s + (pt.annualTotals[y] || 0), 0) / earlyYears.length
                  const recentAvgTotal = recentYears.reduce((s: number, y: number) => s + (pt.annualTotals[y] || 0), 0) / recentYears.length
                  monthOrder.forEach((mo, i) => {
                    const frac = pt.monthlyClim[mo] / climSum
                    earlyBuckets[i] += frac * earlyAvgTotal
                    recentBuckets[i] += frac * recentAvgTotal
                  })
                  earlyCount++; recentCount++
                }
              }
              if (earlyCount > 0) {
                const data = monthLabels.map((m, i) => ({
                  month: m,
                  early: Math.round((earlyBuckets[i] / earlyCount) * 10000) / 10000,
                  recent: Math.round((recentBuckets[i] / recentCount) * 10000) / 10000,
                }))
                setShiftingData(data)
                const earlyPeakIdx = data.reduce((best, d, i) => d.early > data[best].early ? i : best, 0)
                const recentPeakIdx = data.reduce((best, d, i) => d.recent > data[best].recent ? i : best, 0)
                const earlyTotal = data.reduce((s, d) => s + d.early, 0)
                const recentTotal = data.reduce((s, d) => s + d.recent, 0)
                const pctChange = earlyTotal > 0 ? ((recentTotal - earlyTotal) / earlyTotal * 100).toFixed(1) : '0'
                setShiftingInsight(
                  earlyPeakIdx !== recentPeakIdx
                    ? `Peak snowfall shifted from ${monthLabels[earlyPeakIdx]} to ${monthLabels[recentPeakIdx]}. Total snowfall ${Number(pctChange) > 0 ? 'increased' : 'decreased'} by ${Math.abs(Number(pctChange))}%.`
                    : `Peak snowfall remains in ${monthLabels[earlyPeakIdx]}. Total snowfall ${Number(pctChange) > 0 ? 'increased' : 'decreased'} by ${Math.abs(Number(pctChange))}%.`
                )
              }
            }
          }
          // Still try MODIS onset trend as background map
          url = `${GEE_PROXY}/api/snow/trends/modis?metric=onset_trend&startYear=2001&endYear=2024&palette=${colorRamp}`
          if (activeLens === 'us') mapInstanceRef.current.flyTo([39, -98], 4, { duration: 1.5 })
        }
      } else if (effectiveTab === 'season') {
        const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
        url = `${GEE_PROXY}/api/snow/tiles/snodas?date=${yesterday.toISOString().slice(0,10)}&band=${varCfg.snodasBand}&palette=${colorRamp}`
        mapInstanceRef.current.flyTo([39, -98], 4, { duration: 1.5 })
      }

      if (url) {
        // For shifting tab, tile map is optional background — don't show errors
        const suppressError = effectiveTab === 'shifting'
        let attempts = 0
        let lastErr = ''
        while (attempts < 2) {
          try {
            const resp = await fetch(url)
            if (!resp.ok) { lastErr = `HTTP ${resp.status}`; attempts++; continue }
            const data = await resp.json()
            if (data.tileUrl) { await setTileFromUrl(data.tileUrl); lastErr = ''; break }
            else { lastErr = data.error || 'No tile URL returned'; attempts++ }
          } catch (e: any) { lastErr = e.message; attempts++ }
          if (attempts < 2) await new Promise(r => setTimeout(r, 2000))
        }
        if (lastErr && !suppressError) setTileError(lastErr)
      }
    } catch (e: any) { setTileError(e.message) }
    setTileLoadTime(Math.round(performance.now() - t0))
    setActiveTileSource(sourceLabel || 'GEE Proxy')
    setLoading(false)
  }, [effectiveTab, activeLens, timeRange, isMountainLens, snotelStations, colorRamp, shiftingPeriod, gridStatsLoaded, snowVar, dataSource])

  useEffect(() => {
    if (mapReady && !timelapseActive) loadDataForView()
  }, [mapReady, effectiveTab, activeLens, timeRange, snotelLoaded, colorRamp, shiftingPeriod, gridStatsLoaded, snowVar])

  // ═══════════════════════════════════════════════════════════════════
  // CLICK → TIME SERIES
  // ═══════════════════════════════════════════════════════════════════
  const findNearestGridPoint = useCallback((lat: number, lon: number) => {
    if (!gridStatsRef.current?.points?.length) return null
    let best = null, bestDist = Infinity
    for (const pt of gridStatsRef.current.points) {
      const d = Math.abs(pt.lat - lat) + Math.abs(pt.lon - lon)
      if (d < bestDist) { bestDist = d; best = pt }
    }
    return bestDist <= 7 ? best : null
  }, [])

  const generateNarrative = useCallback((point: any, ts: any[], lat: number, lon: number) => {
    const lines: string[] = []
    if (point) {
      const years = Object.keys(point.annualTotals || {}).sort()
      const recentYears = years.slice(-5)
      const recentAvg = recentYears.length > 0 ? recentYears.reduce((s: number, y: string) => s + (point.annualTotals[y] || 0), 0) / recentYears.length : 0
      if (recentAvg > 0) lines.push(`This location receives approximately ${(recentAvg * 1000).toFixed(0)} mm of annual snowfall (water equivalent).`)
      if (point.trend !== undefined) {
        lines.push(`Snowfall here has ${point.trend > 0 ? 'increased' : 'decreased'} by ${Math.abs(point.trend * 10000).toFixed(1)} mm per decade.`)
      }
      if (point.variability !== undefined) lines.push(`Year-to-year variability: ${(point.variability * 100).toFixed(0)}%.`)
    } else if (ts.length > 0) {
      lines.push(`Peak value this period: ${Math.max(...ts.map((d: any) => d.value)).toFixed(3)}.`)
    }
    if (lines.length === 0) lines.push(`Click other locations to compare snowfall data.`)
    setNarrative(lines.join(' '))
  }, [])

  useEffect(() => {
    if (!clickedPoint || isMountainLens) return

    if (gridStatsRef.current) {
      const nearest = findNearestGridPoint(clickedPoint.lat, clickedPoint.lon)
      if (nearest) {
        setGridPointData(nearest)
        const series: { date: string; value: number }[] = []
        for (const [yr, totals] of Object.entries(nearest.annualTotals || {})) {
          const climSum = nearest.monthlyClim.reduce((a: number, b: number) => a + b, 0)
          nearest.monthlyClim.forEach((c: number, mo: number) => {
            const val = climSum > 0 ? (c / climSum) * (totals as number) : 0
            series.push({ date: `${yr}-${String(mo + 1).padStart(2, '0')}`, value: Math.round(val * 10000) / 10000 })
          })
        }
        setTimeSeries(series); setTsLoading(false)
        generateNarrative(nearest, series, clickedPoint.lat, clickedPoint.lon)
        return
      }
    }

    setGridPointData(null); setTsLoading(true)
    const varCfg = SNOW_VAR_CONFIG[snowVar]
    const isUS = effectiveTab === 'season' || activeLens === 'us'
    let fetchUrl: string
    if (isUS) {
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
      const yr = yesterday.getFullYear(); const mo = yesterday.getMonth()
      const ss = mo >= 9 ? `${yr}-10-01` : `${yr-1}-10-01`; const se = mo >= 9 ? `${yr+1}-04-30` : `${yr}-04-30`
      fetchUrl = `${GEE_PROXY}/api/snow/stats/snodas?lat=${clickedPoint.lat}&lon=${clickedPoint.lon}&start=${ss}&end=${se}&band=${varCfg.snodasBand}`
    } else {
      fetchUrl = `${GEE_PROXY}/api/snow/stats/era5?lat=${clickedPoint.lat}&lon=${clickedPoint.lon}&start=2015-01&end=2024-12&band=${varCfg.era5Band}`
    }
    fetch(fetchUrl).then(r => r.json()).then(data => {
      const series = data.series || []; setTimeSeries(series); setTsLoading(false)
      generateNarrative(null, series, clickedPoint.lat, clickedPoint.lon)
    }).catch(() => setTsLoading(false))
  }, [clickedPoint, effectiveTab, activeLens])

  // ═══════════════════════════════════════════════════════════════════
  // ANIMATION
  // ═══════════════════════════════════════════════════════════════════
  const startTimelapse = useCallback(async () => {
    setTimelapseActive(true); setTimelapseIdx(0); setPlaying(false); setAnimLoading(true)
    try {
      const varCfg = SNOW_VAR_CONFIG[snowVar]
      const month = new Date().getMonth() + 1
      let fetchUrl: string
      if (activeLens === 'us') {
        fetchUrl = `${GEE_PROXY}/api/snow/animation/snodas?startYear=2015&endYear=2024&band=${varCfg.snodasBand}`
        mapInstanceRef.current?.flyTo([39, -98], 4, { duration: 1.5 })
      } else {
        fetchUrl = `${GEE_PROXY}/api/snow/animation/era5?startYear=2015&endYear=2024&month=${String(month).padStart(2,'0')}&band=${varCfg.era5Band}`
      }
      const resp = await fetch(fetchUrl)
      const data = await resp.json()
      setTimelapseFrames(data.frames || []); setAnimLoading(false)
      if ((data.frames || []).length > 0) setPlaying(true)
    } catch { setTimelapseFrames([]); setAnimLoading(false) }
  }, [activeLens])

  // Smooth crossfade between animation frames (Issue 4)
  useEffect(() => {
    if (!timelapseActive || !timelapseFrames.length || !mapInstanceRef.current) return
    const frame = timelapseFrames[timelapseIdx]
    if (!frame?.tileUrl) return
    ;(async () => {
      const L = (await import('leaflet')).default
      const map = mapInstanceRef.current
      if (!map) return
      // Create next layer with opacity 0
      const nextLayer = L.tileLayer(frame.tileUrl, { opacity: 0, maxZoom: 12, errorTileUrl: '' })
      nextLayer.addTo(map)
      // Fade in new, fade out old
      const container = nextLayer.getContainer?.()
      if (container) {
        container.style.transition = 'opacity 0.4s ease'
        requestAnimationFrame(() => { container.style.opacity = '0.75' })
      } else {
        nextLayer.setOpacity(0.75)
      }
      if (tileLayerRef.current) {
        const oldContainer = tileLayerRef.current.getContainer?.()
        if (oldContainer) {
          oldContainer.style.transition = 'opacity 0.4s ease'
          oldContainer.style.opacity = '0'
        }
        const oldLayer = tileLayerRef.current
        setTimeout(() => { try { map.removeLayer(oldLayer) } catch {} }, 500)
      }
      tileLayerRef.current = nextLayer
    })()
  }, [timelapseIdx, timelapseActive, timelapseFrames])

  useEffect(() => { playRef.current = playing }, [playing])
  useEffect(() => {
    if (!playing || !timelapseFrames.length) return
    let cancelled = false
    const interval = Math.round(1500 / animSpeed)
    const advance = () => {
      if (cancelled || !playRef.current) return
      setTimelapseIdx(prev => prev < timelapseFrames.length - 1 ? prev + 1 : 0)
      setTimeout(advance, interval)
    }
    setTimeout(advance, interval)
    return () => { cancelled = true }
  }, [playing, timelapseFrames.length, animSpeed])

  const yearlyData = useMemo(() => {
    const byYear: Record<string, number> = {}
    timeSeries.forEach(d => { const y = d.date.slice(0,4); byYear[y] = (byYear[y] || 0) + d.value })
    return Object.entries(byYear).map(([y, v]) => ({ year: y, total: Math.round(v * 10000) / 10000 }))
  }, [timeSeries])

  // ═══════════════════════════════════════════════════════════════════
  // TAB / LENS CHANGE
  // ═══════════════════════════════════════════════════════════════════
  const handleTabChange = (tab: StoryTab) => {
    setActiveTab(tab); setInfoPanelOpen(false); setClickedPoint(null); setSelectedStation(null)
    setTimelapseActive(false); setPlaying(false); setHydroData([]); setAnalytics(null)
    setActiveLens(TAB_CONFIG.find(t => t.key === tab)!.lenses[0].key)
  }

  const handleLensChange = (lens: Lens) => {
    setActiveLens(lens); setInfoPanelOpen(false); setClickedPoint(null)
    setSelectedStation(null); setHydroData([]); setAnalytics(null)
  }

  // Guided story steps: each is a (tab, lens) pair
  const STORY_STEPS: { tab: StoryTab; lens: Lens; label: string }[] = [
    { tab: 'where', lens: 'us', label: 'US Snowfall' },
    { tab: 'where', lens: 'global', label: 'Global Snowfall' },
    { tab: 'where', lens: 'mountain', label: 'Pick a Station' },
    { tab: 'changing', lens: 'us', label: 'US Trends' },
    { tab: 'changing', lens: 'global', label: 'Global Trends' },
    { tab: 'changing', lens: 'mountain', label: 'Station Trends' },
    { tab: 'shifting', lens: 'global', label: 'Season Timing' },
    { tab: 'shifting', lens: 'mountain', label: 'Station Timing' },
    { tab: 'season', lens: 'us', label: 'Current Snow' },
    { tab: 'season', lens: 'mountain', label: 'Station Check' },
  ]
  const isGuided = !isExplorerMode && !showHero
  const currentStepIdx = isGuided ? STORY_STEPS.findIndex(s => s.tab === activeTab && s.lens === activeLens) : -1
  const hasNextStep = currentStepIdx >= 0 && currentStepIdx < STORY_STEPS.length - 1
  const hasPrevStep = currentStepIdx > 0

  const goToStep = (idx: number) => {
    if (idx < 0 || idx >= STORY_STEPS.length) return
    const step = STORY_STEPS[idx]
    if (step.tab !== activeTab) {
      setActiveTab(step.tab); setInfoPanelOpen(false); setClickedPoint(null); setSelectedStation(null)
      setTimelapseActive(false); setPlaying(false); setHydroData([]); setAnalytics(null)
    }
    setActiveLens(step.lens)
  }

  const enterExplorer = () => {
    setActiveTab('explorer'); setActiveLens('us')
    setInfoPanelOpen(false); setClickedPoint(null); setSelectedStation(null)
    setTimelapseActive(false); setPlaying(false); setHydroData([]); setAnalytics(null)
  }

  const dismissHero = () => {
    setHeroExiting(true)
    setTimeout(() => { setShowHero(false); setHeroExiting(false) }, 600)
  }

  // effectiveTab already computed near state declarations

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="relative w-full h-screen overflow-hidden" style={{ background: '#0f172a' }}>
      <style>{snowCSS}</style>

      {/* ═══ LANDING HERO OVERLAY ═══ */}
      {showHero && (
        <div className={`hero-overlay ${heroExiting ? 'hero-exit' : ''}`}>
          <div className="hero-bg" />
          <div className="relative z-10 text-center max-w-2xl px-8 hero-enter">
            <h1 className="text-5xl font-bold tracking-tight mb-4" style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#0f172a' }}>
              Snow Tracker
            </h1>
            <p className="text-lg leading-relaxed mb-6" style={{ color: '#475569' }}>
              Where does it snow most? Is snowfall changing? Is winter shifting?
            </p>
            <p className="text-sm leading-relaxed max-w-lg mx-auto mb-10" style={{ color: '#94a3b8' }}>
              Snow feeds rivers that supply water to billions. It regulates climate, reflects sunlight, and shapes ecosystems.
              As the planet warms, understanding how snowfall is changing matters more than ever.
            </p>
            <button onClick={dismissHero}
              className="snow-next hover:scale-105" style={{ transition: 'all 0.15s' }}>
              Begin Exploring
            </button>
          </div>
        </div>
      )}

      {/* Full-bleed Map */}
      <div ref={mapRef} className="absolute inset-0 z-0" />

      {/* ═══ MAP UI (hidden during hero) ═══ */}
      {!showHero && (<>

      {/* ─── TOP BAR: Nav + Narrative ─── z-index: 1000 */}
      <div className="absolute top-0 left-0 right-0 z-[1000] pointer-events-none">
        <div className="flex items-start justify-between p-4 pointer-events-auto">
          {/* Left: Hub link (only when inside Command Center) */}
          <div>
            {window.location.pathname.startsWith('/snow') && (
              <a href="/" className="snow-panel rounded-xl px-3 py-2 text-sm inline-flex items-center gap-1.5" style={{ color: '#0369a1' }}>Hub</a>
            )}
          </div>

          {/* Center: Narrative bar */}
          <div className="snow-panel rounded-2xl px-6 py-3 text-center max-w-xl">
            {isExplorerMode ? (
              <>
                <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: '#94a3b8' }}>Explorer Mode</div>
                <div className="text-lg font-semibold" style={{ color: '#0f172a' }}>Free Exploration</div>
              </>
            ) : (
              <>
                <div className="text-[10px] uppercase tracking-widest mb-0.5" style={{ color: '#94a3b8' }}>
                  Step {currentStepIdx + 1} of {STORY_STEPS.length}
                </div>
                <div className="text-lg font-semibold" style={{ color: '#0f172a' }}>{currentTabConfig.question}</div>
                <div className="text-sm mt-0.5" style={{ color: '#475569' }}>{heroText}</div>
              </>
            )}
            {loading && <div className="mt-1 flex items-center justify-center gap-2"><div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#0369a1' }} /><span className="text-xs" style={{ color: '#0369a1' }}>Loading...</span></div>}
            {tileError && <div className="mt-1 text-xs" style={{ color: '#dc2626' }}>{tileError}</div>}
          </div>

          {/* Right: Info button only */}
          <div className="flex items-center gap-2">
            <button onClick={() => setShowInfoModal(true)}
              className="snow-panel rounded-full w-9 h-9 flex items-center justify-center text-xs font-bold hover:scale-110 transition-transform cursor-pointer"
              title="Data source info" style={{ color: '#0369a1' }}>i</button>
          </div>
        </div>

      </div>

      {/* ── TEMPORARY EVAL PANEL ── */}
      {!showHero && (
        <div style={{ position: 'fixed', right: 16, top: 120, zIndex: 1100 }}>
          <button onClick={() => setEvalMode(!evalMode)}
            style={{ background: evalMode ? '#0369a1' : '#fff', color: evalMode ? '#fff' : '#0369a1', border: '1px solid #0369a1', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            {evalMode ? 'Close Eval' : 'Eval Mode'}
          </button>
          {evalMode && (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 16, marginTop: 8, width: 320, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Data Source Evaluation</div>

              {/* Current status */}
              <div style={{ background: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 11 }}>
                <div style={{ color: '#64748b', marginBottom: 4 }}>Currently showing:</div>
                <div style={{ color: '#0f172a', fontWeight: 600 }}>{activeTileSource || 'None'}</div>
                {tileLoadTime !== null && (
                  <div style={{ color: tileLoadTime < 500 ? '#16a34a' : tileLoadTime < 2000 ? '#d97706' : '#dc2626', marginTop: 4, fontWeight: 600 }}>
                    Load time: {tileLoadTime}ms
                  </div>
                )}
              </div>

              {/* Source selector */}
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: 1 }}>Switch source:</div>
              {[
                { key: 'auto' as const, label: 'Auto (best available)', desc: 'GCS tiles when available, GEE proxy fallback' },
                { key: 'gcs' as const, label: 'GCS Pre-rendered Tiles', desc: 'Daymet 1km / MODIS 500m, static color ramp, instant load. Only US views for snowfall variable.' },
                { key: 'gee-era5' as const, label: 'GEE Proxy → ERA5-Land', desc: '9km global reanalysis, live computation, custom color ramps. Slower but flexible.' },
                { key: 'gee-snodas' as const, label: 'GEE Proxy → SNODAS', desc: '1km US model assimilation, current day only, live computation.' },
              ].map(opt => (
                <button key={opt.key} onClick={() => setDataSource(opt.key)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', marginBottom: 4,
                    background: dataSource === opt.key ? '#e0f2fe' : '#fff',
                    border: `1px solid ${dataSource === opt.key ? '#0369a1' : '#e2e8f0'}`,
                    borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: dataSource === opt.key ? '#0369a1' : '#334155' }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, lineHeight: 1.3 }}>{opt.desc}</div>
                </button>
              ))}

              {/* Comparison guide */}
              <div style={{ marginTop: 12, padding: 10, background: '#f0f9ff', borderRadius: 8, fontSize: 10, lineHeight: 1.5, color: '#334155' }}>
                <div style={{ fontWeight: 700, marginBottom: 4, fontSize: 11 }}>What to compare:</div>
                <div><b>GCS tiles</b> = pre-rendered PNGs on Google Cloud Storage. Fast (no server computation), but fixed color ramp and only available for US snowfall views.</div>
                <div style={{ marginTop: 4 }}><b>GEE Proxy</b> = live computation via Google Earth Engine. Slower first load, but supports any band, time range, color ramp, and click-for-time-series.</div>
                <div style={{ marginTop: 4 }}><b>ERA5 vs SNODAS vs Daymet:</b> ERA5 = 9km global reanalysis (coarser, global). SNODAS = 1km US model (current conditions). Daymet = 1km US 45yr record (best for long-term US trends).</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Left vertical progress bar — guided mode only */}
      {isGuided && (
        <div style={{ position: 'fixed', left: 16, top: '50%', transform: 'translateY(-50%)', zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
          {/* Connecting line behind dots */}
          <div style={{ position: 'absolute', top: 6, bottom: 6, left: '50%', transform: 'translateX(-50%)', width: 2, background: '#e2e8f0', borderRadius: 1 }} />
          {STORY_STEPS.map((step, i) => (
            <div key={i} style={{
              position: 'relative', zIndex: 1,
              width: i === currentStepIdx ? 14 : 8,
              height: i === currentStepIdx ? 14 : 8,
              borderRadius: '50%',
              background: i < currentStepIdx ? '#0369a1' : i === currentStepIdx ? '#0284c7' : '#cbd5e1',
              border: i === currentStepIdx ? '2px solid #0369a1' : 'none',
              transition: 'all 0.3s',
              cursor: 'pointer',
              boxShadow: i === currentStepIdx ? '0 0 0 3px rgba(3,105,161,0.2)' : 'none',
            }} onClick={() => goToStep(i)} title={step.label} />
          ))}
        </div>
      )}

      {/* ─── EXPLORER MODE CONTROLS ─── z-index: 900 */}
      {isExplorerMode && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[900] fade-in">
          <div className="flex flex-col items-center gap-1.5">
            {/* Question selector */}
            <div className="snow-panel rounded-xl p-1 flex items-center gap-0.5">
              {(['where', 'changing', 'shifting', 'season'] as const).map(q => (
                <button key={q} onClick={() => setExplorerQuestion(q)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${explorerQuestion === q ? 'tab-active' : 'tab-inactive'}`}>
                  {q === 'where' ? 'Where' : q === 'changing' ? 'Changing' : q === 'shifting' ? 'Shifting' : 'This Season'}
                </button>
              ))}
            </div>

            {/* Lens selector */}
            <div className="snow-panel rounded-xl p-1 flex items-center gap-0.5">
              {currentTabConfig.lenses.map(l => (
                <button key={l.key} onClick={() => handleLensChange(l.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${activeLens === l.key ? 'tab-active' : 'tab-inactive'}`}>
                  {l.label}
                </button>
              ))}
            </div>

            {/* Snow variable toggle */}
            {!isMountainLens && (effectiveTab === 'where' || effectiveTab === 'changing' || effectiveTab === 'season') && (
              <div className="snow-panel rounded-xl p-1 flex items-center gap-0.5">
                {([['snowfall', 'Snowfall'], ['snow_depth', 'Snow Depth'], ['snow_cover', 'Snow Cover']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => setSnowVar(val as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${snowVar === val ? 'tab-active' : 'tab-inactive'}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Time range */}
            {effectiveTab === 'changing' && !isMountainLens && (
              <div className="snow-panel rounded-xl p-1 flex items-center gap-0.5">
                <span className="text-[10px] px-2" style={{ color: '#64748b' }}>Range:</span>
                {(['5','10','20','all'] as TimeRange[]).map(tr => (
                  <button key={tr} onClick={() => setTimeRange(tr)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${timeRange === tr ? 'tab-active' : 'tab-inactive'}`}>
                    {tr === 'all' ? 'All' : `${tr}yr`}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── STATION SEARCH ─── z-index: 950 (above explorer controls, below top bar) */}
      {isMountainLens && (
        <div className="absolute z-[950] fade-in" style={{ top: isExplorerMode ? 200 : 100, left: '50%', transform: 'translateX(-50%)' }}>
          <div className="snow-panel rounded-xl px-4 py-2.5 w-80">
            {snotelLoading ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#64748b' }}>
                <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#0369a1', borderTopColor: 'transparent' }} />Loading stations...
              </div>
            ) : (
              <div className="relative">
                <input type="text" value={stationSearch}
                  onChange={e => { setStationSearch(e.target.value); setShowStationDropdown(true) }}
                  onFocus={() => setShowStationDropdown(true)}
                  placeholder="Search SNOTEL stations..."
                  className="w-full rounded-xl px-3 py-2 text-sm outline-none transition-colors"
                  style={{ background: 'rgba(255,255,255,0.6)', color: '#0f172a', border: '1px solid rgba(3,105,161,0.15)' }} />
                {selectedStation && !showStationDropdown && (
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="font-medium" style={{ color: '#0f172a' }}>{selectedStation.name} ({selectedStation.state})</span>
                    <span className="font-bold" style={{ color: getSnotelColor(selectedStation.pctMedian) }}>
                      {selectedStation.pctMedian !== null ? `${selectedStation.pctMedian}%` : '--'}
                    </span>
                  </div>
                )}
                {showStationDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl max-h-64 overflow-y-auto z-50" style={{ background: 'rgba(255,255,255,0.97)', border: '1px solid rgba(3,105,161,0.12)', boxShadow: '0 8px 30px rgba(3,105,161,0.08)' }}>
                    {filteredStations.map(s => (
                      <button key={s.id} onClick={() => selectStation(s)}
                        className="w-full text-left px-3 py-2 transition-colors last:border-0 hover:bg-sky-50" style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium" style={{ color: '#0f172a' }}>{s.name}</div>
                            <div className="text-[10px]" style={{ color: '#64748b' }}>{s.state} · {s.elevation.toLocaleString()}' · {s.swe !== null ? s.swe + '"' : 'N/A'}</div>
                          </div>
                          <div className="text-sm font-bold" style={{ color: getSnotelColor(s.pctMedian) }}>
                            {s.pctMedian !== null ? `${s.pctMedian}%` : '--'}
                          </div>
                        </div>
                      </button>
                    ))}
                    {filteredStations.length === 0 && <div className="px-3 py-4 text-center text-sm" style={{ color: '#94a3b8' }}>No stations found</div>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showStationDropdown && <div className="absolute inset-0 z-[940]" onClick={() => setShowStationDropdown(false)} />}

      {/* Timelapse year overlay */}
      {timelapseActive && timelapseFrames.length > 0 && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className="text-8xl font-bold tracking-wider" style={{ color: 'rgba(3,105,161,0.15)', textShadow: '0 0 60px rgba(3,105,161,0.08)' }}>
            {timelapseFrames[timelapseIdx]?.year || ''}
          </div>
        </div>
      )}

      {/* ─── BOTTOM LEFT: Animation controls ─── z-index: 800 */}
      <div className="absolute bottom-24 left-4 z-[800] flex flex-col gap-2.5">
        {!isMountainLens && (
          <div className="snow-panel rounded-xl px-4 py-3"
            onMouseEnter={() => setShowSpeedControl(true)} onMouseLeave={() => setShowSpeedControl(false)}>
            {!timelapseActive ? (
              <button onClick={startTimelapse} disabled={animLoading || effectiveTab === 'shifting'}
                className="flex items-center gap-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" style={{ color: '#334155' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center transition-colors" style={{ background: '#0369a1', boxShadow: '0 2px 12px rgba(3,105,161,0.2)' }}>
                  <span className="text-sm font-semibold text-white">Play</span>
                </div>
                <div><div className="text-xs font-medium" style={{ color: '#0f172a' }}>Animate</div><div className="text-[10px]" style={{ color: '#64748b' }}>2015 - 2024</div></div>
              </button>
            ) : (
              <div className="space-y-2">
                {animLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(3,105,161,0.08)' }}><div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#0369a1', borderTopColor: 'transparent' }} /></div>
                    <span className="text-xs" style={{ color: '#0369a1' }}>Loading...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPlaying(!playing)} className="w-10 h-10 rounded-full flex items-center justify-center transition-colors" style={{ background: '#0369a1', boxShadow: '0 2px 12px rgba(3,105,161,0.2)' }}>
                        <span className="text-sm font-semibold text-white">{playing ? 'Pause' : 'Play'}</span>
                      </button>
                      <div className="text-xs font-medium" style={{ color: '#0f172a' }}>{timelapseIdx + 1} / {timelapseFrames.length}</div>
                      <button onClick={() => { setTimelapseActive(false); setPlaying(false); loadDataForView() }} className="ml-auto text-sm" style={{ color: '#94a3b8' }}>x</button>
                    </div>
                    <input type="range" min={0} max={timelapseFrames.length - 1} value={timelapseIdx}
                      onChange={e => { setTimelapseIdx(Number(e.target.value)); setPlaying(false) }} className="w-full h-1.5 appearance-none rounded-lg" style={{ background: 'rgba(3,105,161,0.12)' }} />
                    {showSpeedControl && (
                      <div className="flex items-center gap-2 fade-in">
                        <span className="text-[10px]" style={{ color: '#64748b' }}>Speed</span>
                        <input type="range" min={0.5} max={3} step={0.25} value={animSpeed} onChange={e => setAnimSpeed(Number(e.target.value))} className="flex-1 h-1 appearance-none rounded" style={{ background: 'rgba(3,105,161,0.12)' }} />
                        <span className="text-[10px] min-w-[2rem]" style={{ color: '#64748b' }}>{animSpeed}x</span>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── BOTTOM RIGHT: Legend + Color Ramp ─── z-index: 800 */}
      <div className="absolute bottom-24 right-4 z-[800]">
        <div className="snow-panel rounded-2xl w-52 overflow-hidden transition-all duration-300">
          <button onClick={() => setLegendExpanded(!legendExpanded)} className="w-full px-4 py-3 text-left cursor-pointer transition-colors hover:bg-slate-50">
            {(effectiveTab === 'where' || effectiveTab === 'season') && !isMountainLens ? (
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium" style={{ color: '#334155' }}>{effectiveTab === 'season' || activeLens === 'us' ? 'Snow Depth' : 'Snowfall'}</span>
                  <span className="text-[10px]" style={{ color: '#0369a1' }}>{legendExpanded ? 'Collapse' : 'Ramps'}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: getRampGradient(colorRamp, 'where') }} />
                <div className="flex justify-between mt-1 text-[10px]" style={{ color: '#94a3b8' }}><span>None</span><span>Deep</span></div>
              </div>
            ) : effectiveTab === 'changing' && !isMountainLens ? (
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium" style={{ color: '#334155' }}>Snowfall Trend</span>
                  <span className="text-[10px]" style={{ color: '#0369a1' }}>{legendExpanded ? 'Collapse' : 'Ramps'}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: getRampGradient(colorRamp, 'changing') }} />
                <div className="flex justify-between mt-1 text-[10px]" style={{ color: '#94a3b8' }}><span>Declining</span><span>Increasing</span></div>
              </div>
            ) : effectiveTab === 'shifting' && !isMountainLens ? (
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium" style={{ color: '#334155' }}>Season Shift</span>
                  <span className="text-[10px]" style={{ color: '#0369a1' }}>{legendExpanded ? 'Collapse' : 'Ramps'}</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: getRampGradient(colorRamp, 'shifting') }} />
                <div className="flex justify-between mt-1 text-[10px]" style={{ color: '#94a3b8' }}><span>Earlier</span><span>Later</span></div>
              </div>
            ) : isMountainLens ? (
              <div className="text-xs">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium" style={{ color: '#334155' }}>% of Median SWE</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {[{ color: '#ef4444', label: '<50%' }, { color: '#f97316', label: '50-80%' }, { color: '#eab308', label: '80-100%' }, { color: '#22c55e', label: '100-120%' }, { color: '#3b82f6', label: '>120%' }].map(s => (
                    <div key={s.label} className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} /><span className="text-[10px]" style={{ color: '#94a3b8' }}>{s.label}</span></div>
                  ))}
                </div>
              </div>
            ) : null}
          </button>

          {legendExpanded && !isMountainLens && (
            <div className="px-4 pb-3 pt-2 fade-in" style={{ borderTop: '1px solid #e2e8f0' }}>
              <div className="text-[10px] uppercase tracking-wider mb-2 font-medium" style={{ color: '#0369a1' }}>Color Ramp</div>
              <div className="space-y-1">
                {getAvailableRamps(effectiveTab).map(({ key, label, gradient }) => (
                  <button key={key} onClick={() => { setColorRamp(key as ColorRamp); setLegendExpanded(false) }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all hover:bg-slate-50"
                    style={{ background: colorRamp === key ? 'rgba(3,105,161,0.08)' : 'transparent', border: colorRamp === key ? '1px solid #0369a1' : '1px solid transparent' }}>
                    <div className="h-3 flex-1 rounded-full overflow-hidden" style={{ background: gradient }} />
                    <span className="text-[10px] min-w-[60px] text-right" style={{ color: '#64748b' }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ─── INFO PANEL ─── z-index: 850 (below top bar, above legend) */}
      {infoPanelOpen && (isMountainLens ? selectedStation : clickedPoint) && (
        <div className="absolute top-20 right-4 z-[850] w-[400px] slide-up" style={{ maxHeight: 'calc(100vh - 140px)' }}>
          <div className="snow-panel rounded-2xl overflow-hidden overflow-y-auto" style={{ maxHeight: 'calc(100vh - 160px)', boxShadow: '0 8px 40px rgba(3,105,161,0.08)' }}>
            {isMountainLens && selectedStation ? (
              <>
                <div className="px-5 py-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-lg font-semibold" style={{ color: '#0f172a' }}>{selectedStation.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{selectedStation.state} · {selectedStation.elevation.toLocaleString()}' · ID {selectedStation.id}</div>
                    </div>
                    <button onClick={() => { setInfoPanelOpen(false); setSelectedStation(null); setAnalytics(null) }}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-sky-100" style={{ background: 'rgba(3,105,161,0.08)', color: '#64748b' }}>x</button>
                  </div>
                </div>
                <div className="px-5 py-3">
                  <StationInsightsPanel
                    station={selectedStation}
                    hydroData={hydroData}
                    hydroLoading={hydroLoading}
                    analytics={analytics}
                    analyticsLoading={analyticsLoading}
                    activeTab={effectiveTab}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-lg font-semibold" style={{ color: '#0f172a' }}>
                        {clickedPoint!.lat}N, {Math.abs(clickedPoint!.lon)}{clickedPoint!.lon < 0 ? 'W' : 'E'}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{gridPointData ? 'Pre-computed' : 'Live query'}</div>
                    </div>
                    <button onClick={() => { setInfoPanelOpen(false); setClickedPoint(null) }}
                      className="w-8 h-8 rounded-full flex items-center justify-center transition-colors hover:bg-sky-100" style={{ background: 'rgba(3,105,161,0.08)', color: '#64748b' }}>x</button>
                  </div>
                </div>
                <div className="px-5 py-3">
                  {tsLoading ? (
                    <div className="flex items-center gap-2 py-4">
                      <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: '#0369a1', borderTopColor: 'transparent' }} />
                      <span className="text-sm" style={{ color: '#64748b' }}>Querying snow data...</span>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>{narrative}</p>
                      {gridPointData && (
                        <div className="grid grid-cols-2 gap-2 mt-3">
                          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(3,105,161,0.06)', border: '1px solid rgba(3,105,161,0.1)' }}>
                            <div className="text-2xl font-bold" style={{ color: gridPointData.trend > 0 ? '#0891b2' : '#dc2626' }}>
                              {gridPointData.trend > 0 ? '+' : ''}{(gridPointData.trend * 10000).toFixed(1)}
                            </div>
                            <div className="text-[10px] mt-1" style={{ color: '#64748b' }}>mm/decade</div>
                          </div>
                          <div className="rounded-xl p-3 text-center" style={{ background: 'rgba(3,105,161,0.06)', border: '1px solid rgba(3,105,161,0.1)' }}>
                            <div className="text-2xl font-bold" style={{ color: '#7c3aed' }}>{(gridPointData.variability * 100).toFixed(0)}%</div>
                            <div className="text-[10px] mt-1" style={{ color: '#64748b' }}>variability</div>
                          </div>
                        </div>
                      )}
                      {timeSeries.length > 0 && (
                        <div className="mt-3" style={{ height: 150 }}>
                          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                            <AreaChart data={timeSeries}>
                              <defs><linearGradient id="snowGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} /></linearGradient></defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(3,105,161,0.08)" />
                              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 8 }} interval={Math.max(1, Math.floor(timeSeries.length / 6))} />
                              <YAxis tick={{ fill: '#94a3b8', fontSize: 9 }} width={40} />
                              <RTooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', border: '1px solid rgba(3,105,161,0.12)', borderRadius: 12, fontSize: 11, color: '#0f172a' }} />
                              <Area type="monotone" dataKey="value" stroke="#0ea5e9" fill="url(#snowGrad)" strokeWidth={1.5} name="Snow" />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                      {yearlyData.length > 2 && (
                        <div className="mt-2">
                          <div className="text-[10px] mb-1 font-medium uppercase tracking-wider" style={{ color: '#0369a1' }}>Annual Totals</div>
                          <div style={{ height: 90 }}>
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                              <BarChart data={yearlyData}>
                                <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 8 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 8 }} width={35} />
                                <Bar dataKey="total" fill="#0ea5e9" radius={[3, 3, 0, 0]} name="Total" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}
                      {timeSeries.length === 0 && !tsLoading && <div className="text-center py-4 text-sm" style={{ color: '#94a3b8' }}>No data at this location</div>}
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Info Modal */}
      {showInfoModal && (() => {
        const info = getInfoContent(effectiveTab, activeLens)
        return (
          <div className="absolute inset-0 z-[2000] flex items-center justify-center" onClick={() => setShowInfoModal(false)}>
            <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.25)' }} />
            <div className="relative snow-panel rounded-3xl px-8 py-6 max-w-md" style={{ boxShadow: '0 8px 40px rgba(3,105,161,0.12)' }} onClick={e => e.stopPropagation()}>
              <button onClick={() => setShowInfoModal(false)} className="absolute top-3 right-4 text-lg" style={{ color: '#94a3b8' }}>x</button>
              <h3 className="text-lg font-semibold mb-4" style={{ color: '#0f172a' }}>Data Source</h3>
              <div className="space-y-3">
                <div><div className="text-[10px] uppercase tracking-wider" style={{ color: '#0369a1' }}>Source</div><div className="text-sm" style={{ color: '#0f172a' }}>{info.source}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider" style={{ color: '#0369a1' }}>Resolution</div><div className="text-sm" style={{ color: '#0f172a' }}>{info.resolution}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider" style={{ color: '#0369a1' }}>Method</div><div className="text-sm leading-relaxed" style={{ color: '#475569' }}>{info.method}</div></div>
                <div><div className="text-[10px] uppercase tracking-wider" style={{ color: '#0369a1' }}>Collection ID</div><div className="text-xs font-mono" style={{ color: '#0891b2' }}>{info.collection}</div></div>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Shifting Chart Panel */}
      {effectiveTab === 'shifting' && !isMountainLens && shiftingData.length > 0 && (
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 z-[700] fade-in" style={{ width: 'min(600px, 90vw)' }}>
          <div className="snow-panel rounded-2xl px-6 py-5" style={{ boxShadow: '0 8px 40px rgba(3,105,161,0.08)' }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: '#0f172a' }}>Seasonal Snowfall Distribution</div>
                <div className="text-[10px]" style={{ color: '#64748b' }}>Northern Hemisphere average</div>
              </div>
              <div className="flex gap-1">
                {(['10', '20'] as const).map(p => (
                  <button key={p} onClick={() => setShiftingPeriod(p)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${shiftingPeriod === p ? 'tab-active' : 'tab-inactive'}`}>
                    {p} yr
                  </button>
                ))}
              </div>
            </div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <AreaChart data={shiftingData}>
                  <defs>
                    <linearGradient id="earlyGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.25} /><stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="recentGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#7c3aed" stopOpacity={0.2} /><stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(3,105,161,0.08)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} width={45} />
                  <RTooltip contentStyle={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', border: '1px solid rgba(3,105,161,0.12)', borderRadius: 12, fontSize: 11, color: '#0f172a' }} />
                  <Area type="monotone" dataKey="early" stroke="#0ea5e9" fill="url(#earlyGrad)" strokeWidth={2} name={`2015-${shiftingPeriod === '10' ? '2019' : '2018'}`} />
                  <Area type="monotone" dataKey="recent" stroke="#7c3aed" fill="url(#recentGrad)" strokeWidth={2} name={`${shiftingPeriod === '10' ? '2020' : '2019'}-2024`} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}><span className="w-3 h-0.5 inline-block rounded" style={{ background: '#0369a1' }} /> Early period</span>
              <span className="flex items-center gap-1.5 text-xs" style={{ color: '#64748b' }}><span className="w-3 h-0.5 inline-block rounded" style={{ background: '#7c3aed' }} /> Recent period</span>
              {shiftingInsight && <span className="text-xs font-medium ml-auto" style={{ color: '#0891b2' }}>{shiftingInsight}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Season summary overlay */}
      {effectiveTab === 'season' && isMountainLens && !selectedStation && snotelLoaded && (
        <div className="absolute top-32 left-1/2 -translate-x-1/2 z-[600] fade-in">
          <div className="snow-panel rounded-2xl px-8 py-6 text-center max-w-sm" style={{ boxShadow: '0 8px 40px rgba(3,105,161,0.08)' }}>
            <div className="text-5xl font-bold" style={{ color: getSnotelColor(snotelSummary.avg) }}>{snotelSummary.avg}%</div>
            <div className="text-sm mt-1" style={{ color: '#475569' }}>average of median across {snotelSummary.total} stations</div>
            <div className="flex items-center justify-center gap-6 mt-3 text-sm">
              <span className="font-semibold" style={{ color: '#16a34a' }}>{snotelSummary.above} above</span>
              <span className="font-semibold" style={{ color: '#dc2626' }}>{snotelSummary.below} below</span>
            </div>
            <div className="text-xs mt-2" style={{ color: '#94a3b8' }}>Select a station to see full analysis</div>
          </div>
        </div>
      )}

      {/* ═══ BIG NEXT BUTTON ═══ z-index: 900, fixed bottom center */}
      {!infoPanelOpen && !timelapseActive && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[900] flex items-center gap-3">
          {isGuided && hasPrevStep && (
            <button onClick={() => goToStep(currentStepIdx - 1)}
              className="snow-btn rounded-xl px-4 py-4 transition-all hover:scale-105"
              style={{ color: '#475569' }}>&larr;</button>
          )}
          {isGuided && hasNextStep && (
            <button onClick={() => goToStep(currentStepIdx + 1)}
              className="snow-next flex items-center gap-3 transition-all hover:scale-105 group">
              <span>Next: {STORY_STEPS[currentStepIdx + 1]?.label}</span>
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            </button>
          )}
          {isGuided && !hasNextStep && (
            <button onClick={enterExplorer}
              className="snow-next flex items-center gap-3 transition-all hover:scale-105 group">
              <span>Enter Explorer Mode</span>
              <span className="transition-transform group-hover:translate-x-1">&rarr;</span>
            </button>
          )}
        </div>
      )}

      </>)}
    </div>
  )
}
