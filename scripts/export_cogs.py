#!/usr/bin/env python3
"""
Export high-resolution snow analysis COGs from GEE to Google Cloud Storage.
Then convert to PMTiles for fast web serving.

Usage:
  python3 export_cogs.py --demo    # Export 3 demo maps
  python3 export_cogs.py --all     # Export all planned maps
"""

import ee
import json
import sys
import time

# ── Auth ──
SA_KEY = '/Users/hutchbot/.config/gee/service-account.json'
with open(SA_KEY) as f:
    creds_data = json.load(f)
credentials = ee.ServiceAccountCredentials(creds_data['client_email'], SA_KEY)
ee.Initialize(credentials, project=creds_data['project_id'])

BUCKET = 'snow-tracker-cogs'
COG_PREFIX = 'cogs'

# CONUS bounds
CONUS = ee.Geometry.Rectangle([-125, 24, -66, 50])
# Global bounds (exclude poles for cleaner maps)
GLOBAL = ee.Geometry.Rectangle([-180, -60, 180, 75])

def export_cog(image, name, region, scale, description=None):
    """Export a single-band image as COG to GCS."""
    task = ee.batch.Export.image.toCloudStorage(
        image=image,
        description=description or name,
        bucket=BUCKET,
        fileNamePrefix=f'{COG_PREFIX}/{name}',
        region=region,
        scale=scale,
        crs='EPSG:4326',
        maxPixels=1e10,
        fileFormat='GeoTIFF',
        formatOptions={'cloudOptimized': True}
    )
    task.start()
    print(f'  ✅ Started export: {name} (scale={scale}m)')
    return task


def demo_exports():
    """3 demo maps to validate the pipeline."""
    tasks = []

    # ════════════════════════════════════════════════════
    # MAP 1: Average Annual Snowfall (2020-2024) — Daymet 1km US
    # "Where in the US gets the most snow?"
    # ════════════════════════════════════════════════════
    print('\n🗺️  MAP 1: Average Annual Snowfall (Daymet 1km, 2020-2024)')
    
    daymet = ee.ImageCollection('NASA/ORNL/DAYMET_V4')
    
    # For each year, sum daily snowfall (prcp where tmin < 0) 
    # Daymet doesn't have explicit snowfall — derive from prcp + tmin
    annual_snow_images = []
    for yr in range(2020, 2025):
        year_data = daymet.filterDate(f'{yr}-01-01', f'{yr}-12-31')
        # Get daily precip and tmin
        prcp = year_data.select('prcp')  # mm/day
        tmin = year_data.select('tmin')  # degrees C
        # Snow = precip on days where tmin < 0
        snow_mask = tmin.map(lambda img: img.lt(0))
        # Multiply prcp by snow mask and sum for the year
        daily_snow = prcp.map(lambda img: 
            img.multiply(
                daymet.filterDate(img.date(), img.date().advance(1, 'day'))
                .select('tmin').first().lt(0).selfMask()
            )
        )
        annual_total = daily_snow.sum().rename('annual_snowfall')
        annual_snow_images.append(annual_total)
    
    # Alternative simpler approach: use SWE which Daymet provides directly
    # Actually Daymet V4 has 'swe' band — max annual SWE is a cleaner metric
    annual_swe = []
    for yr in range(2020, 2025):
        year_swe = daymet.filterDate(f'{yr}-01-01', f'{yr}-12-31').select('swe')
        max_swe = year_swe.max().rename('max_swe')
        annual_swe.append(max_swe)
    
    avg_max_swe = ee.ImageCollection(annual_swe).mean()
    tasks.append(export_cog(
        avg_max_swe, 
        'daymet_avg_max_swe_2020_2024',
        CONUS, 
        1000,  # 1km
        'daymet_avg_max_swe_2020_2024'
    ))
    
    # Also do total precip-as-snow approach
    # Simpler: use prcp summed where tmin < 0 for each year
    def annual_snowfall_daymet(yr):
        yr = ee.Number(yr)
        start = ee.Date.fromYMD(yr, 1, 1)
        end = ee.Date.fromYMD(yr, 12, 31)
        days = daymet.filterDate(start, end)
        # For each day: prcp * (tmin < 0)
        def snow_day(img):
            tmin_img = img.select('tmin')
            prcp_img = img.select('prcp')
            is_snow = tmin_img.lt(0)
            return prcp_img.multiply(is_snow).rename('snowfall')
        return ee.ImageCollection(days.map(snow_day)).sum()
    
    years = ee.List.sequence(2020, 2024)
    annual_snowfall_col = ee.ImageCollection(years.map(annual_snowfall_daymet))
    avg_annual_snowfall = annual_snowfall_col.mean().rename('avg_snowfall')
    
    tasks.append(export_cog(
        avg_annual_snowfall,
        'daymet_avg_annual_snowfall_2020_2024',
        CONUS,
        1000,
        'daymet_avg_annual_snowfall_2020_2024'
    ))

    # ════════════════════════════════════════════════════
    # MAP 2: Snowfall Trend (2004-2024) — Daymet 1km
    # "Where is snowfall increasing/decreasing?"
    # ════════════════════════════════════════════════════
    print('🗺️  MAP 2: Snowfall Trend 20yr (Daymet 1km, 2004-2024)')
    
    def annual_snowfall_with_year(yr):
        yr = ee.Number(yr)
        start = ee.Date.fromYMD(yr, 1, 1)
        end = ee.Date.fromYMD(yr, 12, 31)
        days = daymet.filterDate(start, end)
        def snow_day(img):
            return img.select('prcp').multiply(img.select('tmin').lt(0)).rename('snowfall')
        total = ee.ImageCollection(days.map(snow_day)).sum()
        return total.addBands(ee.Image.constant(yr).float().rename('year')) \
                     .set('system:time_start', start.millis()) \
                     .set('year', yr)
    
    trend_years = ee.List.sequence(2004, 2024)
    trend_col = ee.ImageCollection(trend_years.map(annual_snowfall_with_year))
    
    # Linear regression: slope per pixel (mm/year)
    fit = trend_col.select(['year', 'snowfall']).reduce(ee.Reducer.linearFit())
    slope = fit.select('scale')  # mm snowfall change per year
    slope_decade = slope.multiply(10).rename('trend_per_decade')  # mm/decade
    
    tasks.append(export_cog(
        slope_decade,
        'daymet_snowfall_trend_2004_2024',
        CONUS,
        1000,
        'daymet_snowfall_trend_2004_2024'
    ))

    # ════════════════════════════════════════════════════
    # MAP 3: Season Timing Trend — MODIS 500m
    # "Is snow arriving earlier or later?"
    # First snow day-of-year trend over 2001-2024
    # ════════════════════════════════════════════════════
    print('🗺️  MAP 3: Snow Season Onset Trend (MODIS 500m, 2001-2024)')
    
    modis = ee.ImageCollection('MODIS/061/MOD10A1').select('NDSI_Snow_Cover')
    
    def first_snow_doy(yr):
        yr = ee.Number(yr)
        # Water year: look at Oct-Dec for onset
        start = ee.Date.fromYMD(yr, 9, 1)
        end = ee.Date.fromYMD(yr.add(1), 3, 1)
        
        days = modis.filterDate(start, end)
        
        # For each image, create DOY band where snow > 40 NDSI
        def snow_doy(img):
            doy = img.date().getRelative('day', 'year')
            has_snow = img.gt(40)
            return ee.Image.constant(doy).int16().rename('doy').updateMask(has_snow)
        
        doy_images = days.map(snow_doy)
        # First snow = minimum DOY with snow
        first_doy = doy_images.min().rename('first_snow_doy')
        return first_doy.addBands(ee.Image.constant(yr).float().rename('year')) \
                        .set('year', yr)
    
    onset_years = ee.List.sequence(2001, 2023)
    onset_col = ee.ImageCollection(onset_years.map(first_snow_doy))
    
    # Trend in first snow DOY
    onset_fit = onset_col.select(['year', 'first_snow_doy']).reduce(ee.Reducer.linearFit())
    onset_slope = onset_fit.select('scale').multiply(10).rename('onset_trend_per_decade')
    # Positive = snow arriving later, Negative = snow arriving earlier
    
    tasks.append(export_cog(
        onset_slope,
        'modis_snow_onset_trend_2001_2024',
        CONUS,  # Start with CONUS, do global later
        500,    # 500m native MODIS res
        'modis_snow_onset_trend_2001_2024'
    ))

    # ════════════════════════════════════════════════════
    # Also export ERA5 global versions at native res
    # ════════════════════════════════════════════════════
    print('🗺️  MAP 4: Global Average Snowfall (ERA5-Land, 2020-2024)')
    
    era5 = ee.ImageCollection('ECMWF/ERA5_LAND/MONTHLY_AGGR').select('snowfall_sum')
    
    annual_era5 = []
    for yr in range(2020, 2025):
        annual = era5.filterDate(f'{yr}-01-01', f'{yr}-12-31').sum()
        annual_era5.append(annual)
    avg_global_snowfall = ee.ImageCollection(annual_era5).mean().rename('avg_snowfall')
    
    tasks.append(export_cog(
        avg_global_snowfall,
        'era5_avg_annual_snowfall_2020_2024_global',
        GLOBAL,
        11132,  # ~0.1 degree = ~11km
        'era5_avg_snowfall_global'
    ))
    
    print('🗺️  MAP 5: Global Snowfall Trend (ERA5-Land, 2004-2024)')
    
    def era5_annual_snowfall(yr):
        yr = ee.Number(yr)
        start = ee.Date.fromYMD(yr, 1, 1)
        end = ee.Date.fromYMD(yr, 12, 31)
        total = era5.filterDate(start, end).sum().rename('snowfall')
        return total.addBands(ee.Image.constant(yr).float().rename('year')) \
                    .set('year', yr)
    
    era5_trend_years = ee.List.sequence(2004, 2024)
    era5_trend_col = ee.ImageCollection(era5_trend_years.map(era5_annual_snowfall))
    era5_fit = era5_trend_col.select(['year', 'snowfall']).reduce(ee.Reducer.linearFit())
    era5_slope_decade = era5_fit.select('scale').multiply(10).rename('trend_per_decade')
    
    tasks.append(export_cog(
        era5_slope_decade,
        'era5_snowfall_trend_2004_2024_global',
        GLOBAL,
        11132,
        'era5_snowfall_trend_global'
    ))

    return tasks


def monitor_tasks(tasks):
    """Monitor GEE export tasks until completion."""
    print(f'\n⏳ Monitoring {len(tasks)} export tasks...')
    while True:
        statuses = []
        for t in tasks:
            status = t.status()
            statuses.append(status['state'])
            if status['state'] == 'FAILED':
                print(f'  ❌ FAILED: {status["description"]} — {status.get("error_message", "unknown")}')
        
        running = statuses.count('RUNNING')
        ready = statuses.count('READY')
        completed = statuses.count('COMPLETED')
        failed = statuses.count('FAILED')
        
        print(f'  Running: {running} | Queued: {ready} | Done: {completed} | Failed: {failed}')
        
        if running == 0 and ready == 0:
            print(f'\n✅ All tasks finished! {completed} completed, {failed} failed.')
            break
        
        time.sleep(15)


if __name__ == '__main__':
    mode = sys.argv[1] if len(sys.argv) > 1 else '--demo'
    
    if mode == '--demo':
        print('🚀 Exporting 5 demo COGs to GCS...')
        tasks = demo_exports()
        monitor_tasks(tasks)
    else:
        print('Full export not yet implemented')
