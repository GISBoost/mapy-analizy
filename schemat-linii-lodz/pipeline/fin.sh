#!/bin/bash
# fin.sh mode title fontsize labelmode  -- render from an existing octi layout
m=$1; B=/home/claude/loom/build; O=/home/claude/out; cd /home/claude
$B/transitmap --line-width ${LWID:-30} --line-spacing ${LSP:-7} --outline-width 0 < $O/$m.octi.json > $O/$m.tm.svg 2>/dev/null
$B/transitmap --line-width ${LWID:-30} --line-spacing ${LSP:-7} --outline-width 0 -l < $O/$m.octi.json > $O/$m.tl.svg 2>/dev/null
python3 render.py out/$m.tm.svg out/$m.octi.json data/meta/$m.json out/$m.svg "$2" "Rozkład ważny od 5.10.2026, dzień roboczy · dane: GTFS ZDiT Łódź · układ oktylinearny: LOOM" $3 $4 out/$m.tl.svg $m out/${GEOSRC:-$m}.loom.json && python3 shot.py $O/$m.svg $O/$m.png 2000
