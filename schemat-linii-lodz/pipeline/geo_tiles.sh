#!/bin/bash
# geo_tiles.sh <m>.geo.json <out dir>: loom's transitmap renders the map view as vector tiles (MVT), one run per zoom, the line width
# in pixels set per zoom as on loom's tiles; geo_tiles.py then merges them into mapy/<m>_geo.json. Run in WSL (B: loom's build dir).
set -e
B=${B:-$HOME/loom/build}
rm -rf "$2"; mkdir -p "$2"
# zoom:line width (tenths of a pixel; transitmap scales by 0.1 for MVT). Outline 1 px, spacing -1 px: neighbours' outlines overlap
for zw in 11:15 12:20 13:30 14:35 15:40 16:45 17:50; do
  z=${zw%:*}; w=${zw#*:}
  "$B/transitmap" --render-engine mvt -z "$z" --line-width "$w" --line-spacing -10 --outline-width 10 --mvt-path "$2" < "$1" 2> /dev/null
  echo "z$z: $(find "$2/$z" -type f | wc -l) tiles"
done
