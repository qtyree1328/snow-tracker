import { useState, useEffect, useRef, useCallback } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

export const GEE_PROXY = 'https://gee-proxy-787413290356.us-east1.run.app'

export interface DatasetExplorerProps {
  /** GEE proxy endpoint — returns JSON { tileUrl: "..." } */
  proxyEndpoint: string
  /** Default query params for the proxy, e.g. { band: 'SWE', date: '2024-02-15' } */
  defaultParams?: Record<string, string>
  /** Available bands to toggle */
  bands?: { value: string; label: string }[]
  /** Click query endpoint — returns JSON with values. Use {lng} and {lat} placeholders */
  clickQueryEndpoint?: string
  /** Whether this has a year/month time control */
  timeControl?: 'date' | 'year-month' | 'none'
  /** Default date or year-month */
  defaultTime?: string
  colorRamp?: { colors: string[]; min: number; max: number; unit: string; label: string }
  defaultCenter?: [number, number]
  defaultZoom?: number
  height?: string
  /** For point-based datasets like SNOTEL */
  stationData?: GeoJSON.FeatureCollection
}

export function DatasetExplorer({
  proxyEndpoint,
  defaultParams = {},
  bands,
  clickQueryEndpoint,
  timeControl = 'none',
  defaultTime,
  colorRamp,
  defaultCenter = [-106.5, 39.5],
  defaultZoom = 5,
  height = '450px',
  stationData,
}: DatasetExplorerProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const tileIdRef = useRef(0)
  const currentLayerRef = useRef<string | null>(null)

  const [activeBand, setActiveBand] = useState(bands?.[0]?.value ?? defaultParams.band ?? '')
  const [opacity, setOpacity] = useState(0.75)
  const [timeValue, setTimeValue] = useState(defaultTime ?? '')
  const [loading, setLoading] = useState(false)
  const [tileInfo, setTileInfo] = useState<string>('')

  // Fetch tile URL from GEE proxy and add to map
  const loadTiles = useCallback(async () => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (stationData) return

    setLoading(true)
    try {
      // Build proxy URL
      const params = new URLSearchParams({ ...defaultParams })
      if (activeBand) params.set('band', activeBand)
      if (timeControl === 'date' && timeValue) {
        params.set('date', timeValue)
      } else if (timeControl === 'year-month' && timeValue) {
        const [y, m] = timeValue.split('-')
        params.set('year', y)
        params.set('month', m)
      }
      const url = `${proxyEndpoint}?${params.toString()}`
      
      const res = await fetch(url)
      const data = await res.json()
      if (data.error) {
        setTileInfo(`Error: ${data.error}`)
        setLoading(false)
        return
      }

      const geeTileUrl = data.tileUrl
      if (!geeTileUrl) {
        setTileInfo('No tile URL returned')
        setLoading(false)
        return
      }

      // Remove old layer
      if (currentLayerRef.current) {
        if (map.getLayer(currentLayerRef.current)) map.removeLayer(currentLayerRef.current)
        if (map.getSource(currentLayerRef.current)) map.removeSource(currentLayerRef.current)
      }

      // Add new raster source
      const id = `explorer-tile-${++tileIdRef.current}`
      map.addSource(id, {
        type: 'raster',
        tiles: [geeTileUrl],
        tileSize: 256,
        maxzoom: 12,
      })
      map.addLayer({
        id,
        type: 'raster',
        source: id,
        paint: { 'raster-opacity': opacity },
      })
      currentLayerRef.current = id

      // Info text
      const parts = []
      if (data.band) parts.push(`Band: ${data.band}`)
      if (data.date) parts.push(`Date: ${data.date}`)
      if (data.year) parts.push(`${data.year}-${data.month || ''}`)
      setTileInfo(parts.join(' | ') || 'Loaded')
    } catch (err) {
      setTileInfo(`Fetch error: ${(err as Error).message}`)
    } finally {
      setLoading(false)
    }
  }, [proxyEndpoint, defaultParams, activeBand, timeControl, timeValue, opacity, stationData])

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          carto: {
            type: 'raster',
            tiles: ['https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'],
            tileSize: 256,
          },
        },
        layers: [{ id: 'carto-base', type: 'raster', source: 'carto' }],
      },
      center: defaultCenter,
      zoom: defaultZoom,
    })

    map.addControl(new maplibregl.NavigationControl(), 'top-left')
    mapRef.current = map

    map.on('load', () => {
      // Station markers
      if (stationData) {
        map.addSource('stations', { type: 'geojson', data: stationData })
        map.addLayer({
          id: 'station-circles',
          type: 'circle',
          source: 'stations',
          paint: {
            'circle-radius': 5,
            'circle-color': '#0369a1',
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        })
        map.on('click', 'station-circles', (e) => {
          const f = e.features?.[0]
          if (!f) return
          const props = f.properties ?? {}
          const coords = (f.geometry as GeoJSON.Point).coordinates as [number, number]
          const html = Object.entries(props)
            .map(([k, v]) => `<div style="font-size:12px"><strong>${k}:</strong> ${v}</div>`)
            .join('')
          new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
            .setLngLat(coords)
            .setHTML(`<div style="font-family:system-ui;padding:4px">${html}</div>`)
            .addTo(map)
        })
        map.on('mouseenter', 'station-circles', () => { map.getCanvas().style.cursor = 'pointer' })
        map.on('mouseleave', 'station-circles', () => { map.getCanvas().style.cursor = '' })
      }

      // Load initial tiles for raster datasets
      if (!stationData && proxyEndpoint) {
        // Trigger loadTiles after map is ready
        setTimeout(() => loadTiles(), 100)
      }
    })

    // Click-to-query
    if (clickQueryEndpoint && !stationData) {
      map.on('click', async (e) => {
        const { lng, lat } = e.lngLat
        popupRef.current?.remove()
        setLoading(true)
        try {
          const url = clickQueryEndpoint
            .replace('{lng}', lng.toFixed(5))
            .replace('{lat}', lat.toFixed(5))
          const res = await fetch(url)
          const data = await res.json()

          let html = `<div style="font-family:system-ui;padding:4px">
            <div style="font-size:11px;color:#94a3b8;margin-bottom:6px">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>`

          if (Array.isArray(data)) {
            // Time series response
            html += `<div style="font-size:11px;color:#64748b">${data.length} records returned</div>`
            const last3 = data.slice(-3)
            last3.forEach((r: { date: string; value: number }) => {
              html += `<div style="font-size:12px"><strong>${r.date}:</strong> ${r.value?.toFixed(3) ?? 'N/A'}</div>`
            })
            if (data.length > 3) html += `<div style="font-size:10px;color:#94a3b8">...and ${data.length - 3} more</div>`
          } else if (data.error) {
            html += `<div style="font-size:12px;color:#ef4444">${data.error}</div>`
          } else {
            const entries = Object.entries(data)
              .filter(([k]) => !['error', 'cached'].includes(k))
              .map(([k, v]) => {
                const val = typeof v === 'number' ? v.toFixed(4) : String(v)
                return `<div style="font-size:12px"><strong>${k}:</strong> ${val}</div>`
              })
              .join('')
            html += entries || '<div style="font-size:12px;color:#94a3b8">No data at this location</div>'
          }
          html += '</div>'

          popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map)
        } catch {
          popupRef.current = new maplibregl.Popup({ closeButton: true })
            .setLngLat(e.lngLat)
            .setHTML('<div style="font-size:12px;color:#ef4444">Query failed</div>')
            .addTo(map)
        } finally {
          setLoading(false)
        }
      })
    }

    return () => { map.remove(); mapRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reload tiles when band or time changes
  useEffect(() => {
    if (mapRef.current?.isStyleLoaded() && !stationData) {
      loadTiles()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBand, timeValue])

  // Update opacity live
  useEffect(() => {
    const map = mapRef.current
    if (!map || !currentLayerRef.current) return
    if (map.getLayer(currentLayerRef.current)) {
      map.setPaintProperty(currentLayerRef.current, 'raster-opacity', opacity)
    }
  }, [opacity])

  return (
    <div style={{ position: 'relative', width: '100%', height, borderRadius: 8, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Loading */}
      {loading && (
        <div style={{
          position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,255,255,0.95)', padding: '6px 16px', borderRadius: 6,
          fontSize: 12, color: '#475569', boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
        }}>
          Loading tiles...
        </div>
      )}

      {/* Info bar */}
      {tileInfo && (
        <div style={{
          position: 'absolute', bottom: 8, left: 8,
          background: 'rgba(15,23,42,0.8)', padding: '4px 10px', borderRadius: 4,
          fontSize: 11, color: '#e2e8f0',
        }}>
          {tileInfo}
        </div>
      )}

      {/* Right control panel */}
      <div style={{
        position: 'absolute', top: 10, right: 10, width: 180,
        background: 'rgba(255,255,255,0.95)', borderRadius: 6, padding: '10px 12px',
        fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 10,
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
      }}>
        {/* Band selector */}
        {bands && bands.length > 1 && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 3 }}>Band</label>
            <select
              value={activeBand}
              onChange={(e) => setActiveBand(e.target.value)}
              style={{
                width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1',
                borderRadius: 4, background: '#fff', color: '#334155',
              }}
            >
              {bands.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
        )}

        {/* Time control */}
        {timeControl === 'date' && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 3 }}>Date</label>
            <input
              type="date"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
            />
          </div>
        )}
        {timeControl === 'year-month' && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 3 }}>Month</label>
            <input
              type="month"
              value={timeValue}
              onChange={(e) => setTimeValue(e.target.value)}
              style={{ width: '100%', padding: '4px 6px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
            />
          </div>
        )}

        {/* Opacity */}
        {!stationData && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 3 }}>
              Opacity: {Math.round(opacity * 100)}%
            </label>
            <input
              type="range" min={20} max={100}
              value={Math.round(opacity * 100)}
              onChange={(e) => setOpacity(Number(e.target.value) / 100)}
              style={{ width: '100%', accentColor: '#0369a1' }}
            />
          </div>
        )}

        {/* Legend */}
        {colorRamp && (
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>
              {colorRamp.label}
            </label>
            <div style={{
              height: 10, borderRadius: 3, width: '100%',
              background: `linear-gradient(90deg, ${colorRamp.colors.join(', ')})`,
            }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginTop: 2 }}>
              <span>{colorRamp.min} {colorRamp.unit}</span>
              <span>{colorRamp.max} {colorRamp.unit}</span>
            </div>
          </div>
        )}

        {clickQueryEndpoint && (
          <div style={{ fontSize: 10, color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
            Click map to query pixel values
          </div>
        )}
      </div>
    </div>
  )
}

export default DatasetExplorer
