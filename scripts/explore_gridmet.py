#!/usr/bin/env python3
"""Explore gridMET for snow-related analysis."""
import ee
import json

credentials = ee.ServiceAccountCredentials(None, '/Users/hutchbot/.config/gee/service-account.json')
ee.Initialize(credentials, project='generalresearch-478019')

OUT = '/Users/hutchbot/clawd/projects/snow-tracker/data/gridmet_sample.json'
pt = ee.Geometry.Point([-106.5, 39.5])
results = {}

col = ee.ImageCollection('IDAHO_EPSCOR/GRIDMET')

# Date range
first_date = ee.Date(col.sort('system:time_start').first().get('system:time_start')).format('YYYY-MM-dd').getInfo()
last_date = ee.Date(col.sort('system:time_start', False).first().get('system:time_start')).format('YYYY-MM-dd').getInfo()
results['date_range'] = {'start': first_date, 'end': last_date}
print(f"gridMET range: {first_date} to {last_date}")

bands = col.first().bandNames().getInfo()
results['bands'] = bands
print(f"Bands: {bands}")

# Daily precip (pr) and min temp (tmmn) for 2023
print("\nQuerying 2023 daily data...")
yr = col.filterDate('2023-01-01', '2024-01-01').select(['pr', 'tmmn'])

def extract(img):
    vals = img.sample(pt, 4000).first()
    return ee.Feature(None, {
        'date': ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
        'pr': vals.get('pr'),
        'tmmn': vals.get('tmmn')
    })

ts = yr.map(extract).getInfo()
data = []
for f in ts['features']:
    p = f['properties']
    if p.get('pr') is not None and p.get('tmmn') is not None:
        data.append({
            'date': p['date'],
            'pr_mm': round(p['pr'], 2),
            'tmmn_K': round(p['tmmn'], 2)
        })

results['daily_count_2023'] = len(data)

# Freezing days and snowfall days
freezing = [d for d in data if d['tmmn_K'] < 273.15]
snow_days = [d for d in data if d['tmmn_K'] < 273.15 and d['pr_mm'] > 0.5]
total_snow_precip = sum(d['pr_mm'] for d in snow_days)

results['freezing_days'] = len(freezing)
results['estimated_snow_days'] = len(snow_days)
results['estimated_snowfall_mm'] = round(total_snow_precip, 1)
results['monthly_sample'] = data[::30]

print(f"  Total days: {len(data)}")
print(f"  Freezing days (tmmn < 273.15K): {len(freezing)}")
print(f"  Estimated snow days (freezing + precip): {len(snow_days)}")
print(f"  Estimated snowfall: {total_snow_precip:.1f} mm")

with open(OUT, 'w') as f:
    json.dump(results, f, indent=2)
print(f"\nSaved to {OUT}")
