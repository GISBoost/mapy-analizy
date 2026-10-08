#!/bin/bash
# mk.sh mode mot title fontsize labelmode [octi args]
# env: LOOM_BUILD, WORK, SUF as in run.sh; SUB = subtitle; PY = python
m=$1; mot=$2; title=$3; fs=$4; lm=$5; shift 5; W=${WORK:-/home/claude}; O=$W/out$SUF; D=data$SUF
SUB=${SUB:-"Rozkład ważny od 5.10.2026, dzień roboczy · dane: GTFS ZDiT Łódź · układ oktylinearny: LOOM"}
cd $W && ./run.sh $m $mot "$@" >/dev/null && ${PY:-python3} render.py $O/$m.tm.svg $O/$m.octi.json $D/meta/$m.json $O/$m.svg "$title" "$SUB" $fs $lm $O/$m.tl.svg $m && ${PY:-python3} shot.py $O/$m.svg $O/$m.png 2000
