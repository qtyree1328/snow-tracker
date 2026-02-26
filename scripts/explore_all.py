#!/usr/bin/env python3
"""Master script: run all explorations and print summary."""
import subprocess
import sys
import json
import os

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(SCRIPTS_DIR), 'data')

scripts = [
    ('SNODAS', 'explore_snodas.py'),
    ('SNOTEL', 'explore_snotel.py'),
    ('Daymet V4', 'explore_daymet.py'),
    ('ERA5-Land', 'explore_era5.py'),
    ('MODIS Snow', 'explore_modis.py'),
    ('gridMET', 'explore_gridmet.py'),
]

results = {}
for name, script in scripts:
    print(f"\n{'='*60}")
    print(f"  Running: {name} ({script})")
    print(f"{'='*60}")
    path = os.path.join(SCRIPTS_DIR, script)
    try:
        r = subprocess.run([sys.executable, path], capture_output=True, text=True, timeout=600)
        print(r.stdout)
        if r.stderr:
            print(f"STDERR: {r.stderr[-500:]}")
        results[name] = 'OK' if r.returncode == 0 else f'FAIL (rc={r.returncode})'
    except subprocess.TimeoutExpired:
        results[name] = 'TIMEOUT'
        print(f"  TIMEOUT after 600s")
    except Exception as e:
        results[name] = f'ERROR: {e}'

# Summary
print(f"\n{'='*60}")
print("  SUMMARY")
print(f"{'='*60}")

for name, status in results.items():
    print(f"  {name:15s}: {status}")

# Load JSON outputs and summarize
print(f"\n--- Dataset Details ---")
json_files = {
    'SNODAS': 'snodas_sample.json',
    'Daymet V4': 'daymet_sample.json',
    'ERA5-Land': 'era5_sample.json',
    'MODIS Snow': 'modis_sample.json',
    'SNOTEL': 'snotel_sample.json',
    'gridMET': 'gridmet_sample.json',
}

summary = {}
for name, jf in json_files.items():
    fp = os.path.join(DATA_DIR, jf)
    if os.path.exists(fp):
        with open(fp) as f:
            data = json.load(f)
        dr = data.get('date_range', {})
        summary[name] = {
            'date_range': f"{dr.get('start', '?')} to {dr.get('end', '?')}" if dr else data.get('latest_date', '?'),
            'bands': data.get('snow_related_bands', data.get('bands', []))[:5],
        }
        print(f"\n{name}:")
        print(f"  Date range: {summary[name]['date_range']}")
        print(f"  Key bands: {summary[name]['bands']}")

out = os.path.join(DATA_DIR, 'exploration_summary.json')
with open(out, 'w') as f:
    json.dump({'run_status': results, 'datasets': summary}, f, indent=2)
print(f"\nSummary saved to {out}")
