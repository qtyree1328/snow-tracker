#!/usr/bin/env python3
"""Explore MODIS Snow Cover (MOD10A1)."""
import ee
import json

credentials = ee.ServiceAccountCredentials(None, '/Users/hutchbot/.config/gee/service-account.json')
ee.Initialize(credentials, project='generalresearch-478019')

OUT = '/Users/hutchbot/clawd/projects/snow-tracker/data/modis_sample.json'
pt = ee.Geometry.Point([-106.5, 39.5])
results = {}

col = ee.ImageCollection('MODIS/061/MOD10A1')

first_date = ee.Date(col.sort('system:time_start').first().get('system:time_start')).format('YYYY-MM-dd').getInfo()
last_date = ee.Date(col.sort('system:time_start', False).first().get('system:time_start')).format('YYYY-MM-dd').getInfo()
results['date_range'] = {'start': first_date, 'end': last_date}
print(f"MODIS MOD10A1 range: {first_date} to {last_date}")

bands = col.first().bandNames().getInfo()
results['bands'] = bands
print(f"Bands: {bands}")

# One year of NDSI_Snow_Cover (2023) - use reduceRegion instead of sample
print("\nQuerying NDSI_Snow_Cover for 2023...")
yr_col = col.filterDate('2023-01-01', '2024-01-01').select('NDSI_Snow_Cover')

def extract(img):
    val = img.reduceRegion(ee.Reducer.first(), pt, 500)
    return ee.Feature(None, {
        'date': ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
        'NDSI': val.get('NDSI_Snow_Cover')
    })

ts = yr_col.map(extract).getInfo()
timeseries = [{'date': f['properties']['date'], 'NDSI': f['properties']['NDSI']} 
              for f in ts['features'] if f['properties'].get('NDSI') is not None]
results['timeseries_2023_count'] = len(timeseries)
results['timeseries_2023_monthly_sample'] = timeseries[::30]
print(f"  Got {len(timeseries)} daily values")

# Snow season onset/melt
snow_days = [r for r in timeseries if r['NDSI'] is not None and r['NDSI'] > 50]
if snow_days:
    results['season_2023'] = {
        'onset': snow_days[0]['date'],
        'melt': snow_days[-1]['date'],
        'snow_days': len(snow_days)
    }
    print(f"  Season onset: {snow_days[0]['date']}, melt: {snow_days[-1]['date']}, snow days: {len(snow_days)}")
else:
    results['season_2023'] = {'note': 'No days > 50% cover found'}

# Snow days per year for 5 years using reduceRegion
print("\nSnow days per year (NDSI > 50%)...")
snow_days_by_year = {}
for year in range(2019, 2024):
    yc = col.filterDate(f'{year}-01-01', f'{year+1}-01-01').select('NDSI_Snow_Cover')
    # Count images where NDSI > 50
    def is_snow(img):
        val = img.reduceRegion(ee.Reducer.first(), pt, 500).get('NDSI_Snow_Cover')
        return img.set('is_snow', ee.Algorithms.If(ee.Algorithms.IsEqual(val, None), 0,
                       ee.Algorithms.If(ee.Number(val).gt(50), 1, 0)))
    
    counted = yc.map(is_snow).aggregate_sum('is_snow').getInfo()
    snow_days_by_year[str(year)] = counted
    print(f"  {year}: {counted} snow days")

results['snow_days_by_year'] = snow_days_by_year

with open(OUT, 'w') as f:
    json.dump(results, f, indent=2)
print(f"\nSaved to {OUT}")
