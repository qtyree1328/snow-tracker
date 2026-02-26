#!/usr/bin/env python3
"""Explore SNOTEL REST API for snow data."""
import json
import urllib.request
import csv
import io

OUT = '/Users/hutchbot/clawd/projects/snow-tracker/data/snotel_sample.json'

stations = {
    'Berthoud_Summit_CO': '335:CO:SNTL',
    'Mammoth_Pass_CA': '574:CA:SNTL',
    'Stevens_Pass_WA': '791:WA:SNTL',
}

results = {}

for name, station_id in stations.items():
    print(f"\n--- {name} ({station_id}) ---")
    url = (f'https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/'
           f'customSingleStationReport/daily/{station_id}%7Cid=%22%22%7Cname/'
           f'-150,0/WTEQ::value,PREC::value')
    
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        resp = urllib.request.urlopen(req, timeout=30)
        text = resp.read().decode('utf-8')
        
        # Parse CSV (skip comment lines starting with #)
        lines = [l for l in text.strip().split('\n') if not l.startswith('#') and l.strip()]
        if not lines:
            results[name] = {'error': 'No data lines'}
            continue
        
        reader = csv.DictReader(io.StringIO('\n'.join(lines)))
        rows = []
        for row in reader:
            rows.append(row)
        
        if not rows:
            results[name] = {'error': 'No data rows'}
            continue
        
        # Parse SWE values
        swe_col = [k for k in rows[0].keys() if 'Snow Water' in k or 'WTEQ' in k]
        prec_col = [k for k in rows[0].keys() if 'Precipitation' in k or 'PREC' in k]
        
        swe_key = swe_col[0] if swe_col else list(rows[0].keys())[1]
        prec_key = prec_col[0] if prec_col else list(rows[0].keys())[2] if len(rows[0].keys()) > 2 else None
        
        date_key = list(rows[0].keys())[0]
        
        swe_data = []
        for row in rows:
            try:
                swe_val = float(row[swe_key]) if row[swe_key] else None
                swe_data.append({'date': row[date_key], 'swe_in': swe_val})
            except (ValueError, KeyError):
                pass
        
        valid = [r for r in swe_data if r['swe_in'] is not None]
        if valid:
            peak = max(valid, key=lambda x: x['swe_in'])
            current = valid[-1]
            results[name] = {
                'station': station_id,
                'records': len(valid),
                'peak_swe_in': peak['swe_in'],
                'peak_date': peak['date'],
                'current_swe_in': current['swe_in'],
                'current_date': current['date'],
            }
            print(f"  Records: {len(valid)}")
            print(f"  Peak SWE: {peak['swe_in']}\" on {peak['date']}")
            print(f"  Current: {current['swe_in']}\" on {current['date']}")
        else:
            results[name] = {'error': 'No valid SWE values'}
    except Exception as e:
        results[name] = {'error': str(e)}
        print(f"  ERROR: {e}")

with open(OUT, 'w') as f:
    json.dump(results, f, indent=2)
print(f"\nSaved to {OUT}")
