#!/bin/bash
# build.sh  -- GZM trams: filter -> prep -> LOOM chain (run in WSL). Render/page/print run on Windows (README.md).
# env: WORK (default /mnt/c/Users/Michal/Desktop/easy/schemat-gzm-dane), DAY (20260916), TOPO_D (75), FISHEYE, OCTI (extra octi args)
set -e
W=${WORK:-/mnt/c/Users/Michal/Desktop/easy/schemat-gzm-dane}
S=${SKILL:-/mnt/c/Users/Michal/.claude/skills/schemat-linii-loom/scripts}
P=$(cd "$(dirname "$0")" && pwd)
cd "$W"
python3 $S/filtruj_gtfs.py gtfs_static data/tram --date ${DAY:-20260916} --mode tram --depot-regex '(?!)' --skip-stop-regex '\[tech\]|^granica ' \
  ${HUBS:+--hubs "$HUBS"} | tee data/tram.filter.txt
python3 $P/prep.py data/tram
TOPO_D=${TOPO_D:-75} LWID=30 LSP=7 FISHEYE="${FISHEYE-1.5 1700 19.0200 50.2560}" bash $S/run_loom.sh data/tram out/${OUT:-tram} tram $OCTI
