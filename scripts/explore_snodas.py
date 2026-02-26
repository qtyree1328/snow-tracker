#!/usr/bin/env python3
"""Explore SNODAS daily snow data via GEE."""
import ee
import json
import datetime

credentials = ee.ServiceAccountCredentials(None, '/Users/hutchbot/.config/gee/service-account.json')
ee.Initialize(credentials, project='generalresearch-478019')

OUT = '/Users/hutchbot/clawd/projects/snow-tracker/data/snodas_sample.json'

points = {
    'Rockies': ee.Geometry.Point([-106.5, 39.5]),
    'Sierra': ee.Geometry.Point([-120.0, 38.5]),
    'Cascades': ee.Geometry.Point([-121.5, 46.8]),
    'Great_Lakes': ee.Geometry.Point([-85.5, 46.0]),
    'Northeast': ee.Geometry.Point([-72.0, 44.0]),
}

collection = ee.ImageCollection('projects/climate-engine/snodas/daily')
results = {}

# Latest date
latest = collection.sort('system:time_start', False).first()
latest_date = ee.Date(latest.get('system:time_start')).format('YYYY-MM-dd').getInfo()
results['latest_date'] = latest_date
print(f"Latest SNODAS date: {latest_date}")

# Band names
bands = latest.bandNames().getInfo()
results['bands'] = bands
print(f"Bands: {bands}")

# Sample points at latest date
swe_band = 'SWE' if 'SWE' in bands else bands[0]
depth_band = 'Snow_Depth' if 'Snow_Depth' in bands else (bands[1] if len(bands) > 1 else bands[0])
print(f"Using bands: SWE={swe_band}, Depth={depth_band}")

point_values = {}
for name, pt in points.items():
    try:
        vals = latest.select([swe_band, depth_band]).sample(pt, 1000).first().toDictionary().getInfo()
        point_values[name] = vals
        print(f"  {name}: {vals}")
    except Exception as e:
        point_values[name] = {'error': str(e)}
        print(f"  {name}: ERROR - {e}")
results['point_values'] = point_values

# Time series for Rockies - current water year
print("\nSWE time series for Rockies (water year 2024-2025)...")
start = '2024-10-01'
end = '2025-02-25'
wy = collection.filterDate(start, end)
rockies = points['Rockies']

def extract_swe(img):
    val = img.select(swe_band).sample(rockies, 1000).first()
    return ee.Feature(None, {
        'date': ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
        'SWE': val.get(swe_band)
    })

ts = wy.map(extract_swe).getInfo()
timeseries = [{'date': f['properties']['date'], 'SWE': f['properties']['SWE']} for f in ts['features'] if f['properties']['SWE'] is not None]
# Subsample to ~monthly for manageable output
results['rockies_timeseries_count'] = len(timeseries)
results['rockies_timeseries_sample'] = timeseries[::30] if len(timeseries) > 10 else timeseries
print(f"  Got {len(timeseries)} daily values")
for row in results['rockies_timeseries_sample']:
    print(f"  {row['date']}: {row['SWE']}")

with open(OUT, 'w') as f:
    json.dump(results, f, indent=2)
print(f"\nSaved to {OUT}")
