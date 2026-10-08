#!/bin/bash
# fin.sh mode title fontsize labelmode  -- render from an existing octi layout
# env: LOOM_BUILD, WORK, SUF as in run.sh; SUB = subtitle; PY = python
m=$1; B=${LOOM_BUILD:-/home/claude/loom/build}; W=${WORK:-/home/claude}; O=$W/out$SUF; D=data$SUF; cd $W
SUB=${SUB:-"Rozkład ważny od 5.10.2026, dzień roboczy · dane: GTFS ZDiT Łódź · układ oktylinearny: LOOM"}
$B/transitmap --line-width ${LWID:-30} --line-spacing ${LSP:-7} --outline-width 0 < $O/$m.octi.json > $O/$m.tm.svg 2>/dev/null
$B/transitmap --line-width ${LWID:-30} --line-spacing ${LSP:-7} --outline-width 0 -l < $O/$m.octi.json > $O/$m.tl.svg 2>/dev/null
${PY:-python3} render.py $O/$m.tm.svg $O/$m.octi.json $D/meta/$m.json $O/$m.svg "$2" "$SUB" $3 $4 $O/$m.tl.svg $m $O/${GEOSRC:-$m}.loom.json $COLORS && ${PY:-python3} shot.py $O/$m.svg $O/$m.png 2000
