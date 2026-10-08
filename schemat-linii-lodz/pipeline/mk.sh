#!/bin/bash
# mk.sh mode mot title fontsize labelmode [octi args]
m=$1; mot=$2; title=$3; fs=$4; lm=$5; shift 5
cd /home/claude && ./run.sh $m $mot "$@" >/dev/null && python3 render.py out/$m.tm.svg out/$m.octi.json data/meta/$m.json out/$m.svg "$title" "Rozkład ważny od 5.10.2026, dzień roboczy · dane: GTFS ZDiT Łódź · układ oktylinearny: LOOM" $fs $lm out/$m.tl.svg $m && python3 shot.py /home/claude/out/$m.svg /home/claude/out/$m.png 2000
