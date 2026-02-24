#!/bin/bash
# Convert COGs from GCS to PMTiles
# Usage: ./cog_to_pmtiles.sh

set -e
WORKDIR="/tmp/snow-pmtiles"
GCS_COGS="gs://snow-tracker-cogs/cogs"
GCS_OUT="gs://snow-tracker-cogs/pmtiles"
mkdir -p "$WORKDIR"

DATASETS=(
  "daymet_avg_max_swe_2020_2024"
  "daymet_snowfall_trend_2004_2024"
  "era5_avg_annual_snowfall_2020_2024_global"
  "era5_snowfall_trend_2004_2024_global"
)

NAMES=(
  "daymet_avg_max_swe"
  "daymet_snowfall_trend"
  "era5_avg_snowfall_global"
  "era5_snowfall_trend_global"
)

for i in "${!DATASETS[@]}"; do
  COG="${DATASETS[$i]}"
  NAME="${NAMES[$i]}"
  echo "=== Processing: $COG → $NAME ==="

  # Download COG from GCS
  if [ ! -f "$WORKDIR/${COG}.tif" ]; then
    echo "  Downloading COG..."
    gsutil cp "${GCS_COGS}/${COG}.tif" "$WORKDIR/${COG}.tif"
  fi

  # Reproject to EPSG:3857 (Web Mercator) if needed
  echo "  Reprojecting to Web Mercator..."
  /opt/homebrew/bin/gdalwarp -t_srs EPSG:3857 -r bilinear -overwrite \
    "$WORKDIR/${COG}.tif" "$WORKDIR/${COG}_3857.tif" 2>/dev/null

  # Generate MBTiles (raster tiles, zoom 0-7)
  echo "  Generating MBTiles (zoom 0-7)..."
  /opt/homebrew/bin/gdal_translate -of MBTiles \
    "$WORKDIR/${COG}_3857.tif" "$WORKDIR/${NAME}.mbtiles" 2>/dev/null
  /opt/homebrew/bin/gdaladdo -r average "$WORKDIR/${NAME}.mbtiles" 2 4 8 16 32 64 128 2>/dev/null

  # Convert MBTiles to PMTiles
  echo "  Converting to PMTiles..."
  pmtiles convert "$WORKDIR/${NAME}.mbtiles" "$WORKDIR/${NAME}.pmtiles"

  # Upload to GCS
  echo "  Uploading to GCS..."
  gsutil -h "Content-Type:application/vnd.pmtiles" cp "$WORKDIR/${NAME}.pmtiles" "${GCS_OUT}/${NAME}.pmtiles"

  echo "  Done: ${GCS_OUT}/${NAME}.pmtiles"
  echo ""
done

echo "=== All PMTiles generated and uploaded ==="
echo "URLs:"
for NAME in "${NAMES[@]}"; do
  echo "  https://storage.googleapis.com/snow-tracker-cogs/pmtiles/${NAME}.pmtiles"
done
