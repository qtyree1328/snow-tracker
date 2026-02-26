#!/usr/bin/env python3
"""Explore Daymet V4 for snow-related analysis."""
import ee
import json

credentials = ee.ServiceAccountCredentials(None, '/Users/hutchbot/.config/gee/service-account.json')
ee.Initialize(credentials, project='generalresearch-478019')

OUT = '/Users/hutchbot/clawd/projects/snow-tracker/data/daymet_sample.json'
pt = ee.Geometry.Point([-106.5, 39.5])  # Colorado Rockies
results = {}

col = ee.ImageCollection('NASA/ORNL/DAYMET_V4')

# Date range
first_date = ee.Date(col.sort('system:time_start').first().get('system:time_start')).format('YYYY-MM-dd').getInfo()
last_date = ee.Date(col.sort('system:time_start', False).first().get('system:time_start')).format('YYYY-MM-dd').getInfo()
results['date_range'] = {'start': first_date, 'end': last_date}
print(f"Daymet date range: {first_date} to {last_date}")

bands = col.first().bandNames().getInfo()
results['bands'] = bands
print(f"Bands: {bands}")

# Annual snowfall (prcp where tmin < 0) for 1980-2024
print("\nComputing annual snowfall (prcp where tmin < 0)...")
annual_snow = {}
for year in range(1980, 2025):
    yr_col = col.filterDate(f'{year}-01-01', f'{year+1}-01-01')
    # For each image: if tmin < 0, count prcp as snow
    def snow_prcp(img):
        tmin = img.select('tmin')
        prcp = img.select('prcp')
        mask = tmin.lt(0)
        return prcp.multiply(mask).rename('snow_prcp').copyProperties(img, ['system:time_start'])
    
    snow_col = yr_col.map(snow_prcp)
    total = snow_col.sum()
    val = total.sample(pt, 1000).first().get('snow_prcp').getInfo()
    annual_snow[str(year)] = round(val, 1) if val else None
    if year % 10 == 0:
        print(f"  {year}: {val:.1f} mm")

results['annual_snowfall_mm'] = annual_snow

# Compute means
vals = [v for v in annual_snow.values() if v is not None]
results['means'] = {
    '5yr_mean': round(sum(vals[-5:]) / len(vals[-5:]), 1),
    '10yr_mean': round(sum(vals[-10:]) / len(vals[-10:]), 1),
    '20yr_mean': round(sum(vals[-20:]) / len(vals[-20:]), 1),
    'full_mean': round(sum(vals) / len(vals), 1),
}
print(f"\nMeans: {results['means']}")

# Month of peak snow accumulation (use 2023 as sample)
print("\nMonthly snow accumulation for 2023...")
monthly = {}
for m in range(1, 13):
    end_m = m + 1 if m < 12 else 1
    end_y = 2023 if m < 12 else 2024
    mc = col.filterDate(f'2023-{m:02d}-01', f'{end_y}-{end_m:02d}-01')
    def snow_prcp2(img):
        return img.select('prcp').multiply(img.select('tmin').lt(0)).rename('snow_prcp').copyProperties(img, ['system:time_start'])
    total = mc.map(snow_prcp2).sum()
    val = total.sample(pt, 1000).first().get('snow_prcp').getInfo()
    monthly[m] = round(val, 1) if val else 0
    print(f"  Month {m}: {monthly[m]} mm")

peak_month = max(monthly, key=monthly.get)
results['monthly_snow_2023'] = monthly
results['peak_month'] = peak_month
print(f"Peak month: {peak_month}")

with open(OUT, 'w') as f:
    json.dump(results, f, indent=2)
print(f"\nSaved to {OUT}")
