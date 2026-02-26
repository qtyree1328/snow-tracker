#!/usr/bin/env python3
"""Explore ERA5-Land Monthly for snow analysis."""
import ee
import json

credentials = ee.ServiceAccountCredentials(None, '/Users/hutchbot/.config/gee/service-account.json')
ee.Initialize(credentials, project='generalresearch-478019')

OUT = '/Users/hutchbot/clawd/projects/snow-tracker/data/era5_sample.json'
pt = ee.Geometry.Point([-106.5, 39.5])
results = {}

col = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR')

# Date range
first_date = ee.Date(col.sort('system:time_start').first().get('system:time_start')).format('YYYY-MM-dd').getInfo()
last_date = ee.Date(col.sort('system:time_start', False).first().get('system:time_start')).format('YYYY-MM-dd').getInfo()
results['date_range'] = {'start': first_date, 'end': last_date}
print(f"ERA5-Land Monthly range: {first_date} to {last_date}")

# List all bands, highlight snow-related
bands = col.first().bandNames().getInfo()
snow_bands = [b for b in bands if any(k in b.lower() for k in ['snow', 'swe', 'ice'])]
results['all_bands'] = bands
results['snow_related_bands'] = snow_bands
print(f"Total bands: {len(bands)}")
print(f"Snow-related: {snow_bands}")

# Monthly snowfall_sum time series
snowfall_band = 'snowfall_sum' if 'snowfall_sum' in bands else snow_bands[0] if snow_bands else None
if not snowfall_band:
    print("No snowfall band found!")
    results['error'] = 'No snowfall band'
else:
    print(f"\nExtracting monthly {snowfall_band}...")
    def extract(img):
        val = img.select(snowfall_band).sample(pt, 10000).first()
        return ee.Feature(None, {
            'date': ee.Date(img.get('system:time_start')).format('YYYY-MM'),
            'snowfall': val.get(snowfall_band)
        })
    
    ts = col.map(extract).getInfo()
    timeseries = []
    for f in ts['features']:
        p = f['properties']
        if p.get('snowfall') is not None:
            timeseries.append({'date': p['date'], 'snowfall_m': round(p['snowfall'], 6)})
    
    results['timeseries_count'] = len(timeseries)
    # Save every 12th (yearly sample) for JSON, full for analysis
    results['timeseries_yearly_sample'] = timeseries[::12][:20]
    print(f"  Got {len(timeseries)} monthly values")
    
    # Compute trend (simple linear regression: slope per decade)
    if len(timeseries) > 12:
        # Annual totals
        from collections import defaultdict
        annual = defaultdict(float)
        for row in timeseries:
            yr = row['date'][:4]
            annual[yr] += row['snowfall_m']
        
        years = sorted(annual.keys())
        x = list(range(len(years)))
        y = [annual[yr] for yr in years]
        
        n = len(x)
        sx = sum(x)
        sy = sum(y)
        sxy = sum(a*b for a, b in zip(x, y))
        sxx = sum(a*a for a in x)
        
        slope = (n * sxy - sx * sy) / (n * sxx - sx * sx)
        slope_per_decade = slope * 10
        
        results['annual_totals'] = {yr: round(annual[yr], 4) for yr in years}
        results['trend_slope_per_decade_m'] = round(slope_per_decade, 6)
        print(f"  Trend: {slope_per_decade:.6f} m/decade")
        print(f"  First year ({years[0]}): {annual[years[0]]:.4f} m")
        print(f"  Last year ({years[-1]}): {annual[years[-1]]:.4f} m")

with open(OUT, 'w') as f:
    json.dump(results, f, indent=2)
print(f"\nSaved to {OUT}")
