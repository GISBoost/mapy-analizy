#!/bin/bash
# usage: run.sh mode gtfs2graph-mot octi-args...
# env: LOOM_BUILD (loom/build dir), WORK (work dir), SUF (version suffix, e.g. _przed; empty = current)
m=$1; mot=$2; shift 2; B=${LOOM_BUILD:-/home/claude/loom/build}; W=${WORK:-/home/claude}; O=$W/out$SUF
mkdir -p $O
$B/gtfs2graph -m $mot $W/data$SUF/$m > $O/$m.raw.json 2> $O/$m.log1 || { cat $O/$m.log1; exit 1; }
$B/topo -d ${TOPO_D:-50} < $O/$m.raw.json > $O/$m.topo.json 2> $O/$m.log2 || { tail -3 $O/$m.log2; exit 1; }
python3 $(dirname $0)/fixends.py $O/$m.topo.json $W/data$SUF/meta/$m.json 2> $O/$m.logfix || { cat $O/$m.logfix; exit 1; }
$B/loom < $O/$m.topo.json > $O/$m.loom.json 2> $O/$m.log3 || { tail -3 $O/$m.log3; exit 1; }
$B/octi "$@" < $O/$m.loom.json > $O/$m.octi.json 2> $O/$m.log4 || { tail -3 $O/$m.log4; exit 1; }
$B/transitmap --line-width ${LWID:-30} --line-spacing ${LSP:-7} --outline-width 0 < $O/$m.octi.json > $O/$m.tm.svg 2> $O/$m.log5 || { tail -3 $O/$m.log5; exit 1; }
$B/transitmap --line-width ${LWID:-30} --line-spacing ${LSP:-7} --outline-width 0 -l < $O/$m.octi.json > $O/$m.tl.svg 2>/dev/null
ls -la $O/$m.tm.svg
