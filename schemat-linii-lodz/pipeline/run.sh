#!/bin/bash
# usage: run.sh mode gtfs2graph-mot octi-args...
# env: LOOM_BUILD (loom/build dir), WORK (work dir), SUF (version suffix, e.g. _przed; empty = current)
# OCTI=ls: lay the graph out with octls.py (own solver, see OCTLS.md) instead of LOOM's octi; octi-args are then ignored.
#   env: OCTLS_ARGS (solver options; default = tram preset), GOALS (goals json, default goals/<m>.json), HUB_MERGE ('keep|drop' station labels), PY_LS (python with numpy)
m=$1; mot=$2; shift 2; B=${LOOM_BUILD:-/home/claude/loom/build}; W=${WORK:-/home/claude}; O=$W/out$SUF
mkdir -p $O
$B/gtfs2graph -m $mot $W/data$SUF/$m > $O/$m.raw.json 2> $O/$m.log1 || { cat $O/$m.log1; exit 1; }
$B/topo -d ${TOPO_D:-50} < $O/$m.raw.json > $O/$m.topo.json 2> $O/$m.log2 || { tail -3 $O/$m.log2; exit 1; }
python3 $(dirname $0)/fixends.py $O/$m.topo.json $W/data$SUF/meta/$m.json 2> $O/$m.logfix || { cat $O/$m.logfix; exit 1; }
python3 $(dirname $0)/hubsnap.py $O/$m.topo.json ${HUB_R:-300} 2>> $O/$m.logfix || { cat $O/$m.logfix; exit 1; }
$B/loom < $O/$m.topo.json > $O/$m.loom.json 2> $O/$m.log3 || { tail -3 $O/$m.log3; exit 1; }
if [ "$OCTI" = ls ]; then
  D=$(dirname $0); OIN=$O/$m.loom.json; SL=$OIN
  [ "$m" = tram ] && HUB_MERGE=${HUB_MERGE-Pabianicka-Rondo Lotników Lwowskich|Paderewskiego-Rondo Lotników Lwowskich}
  if [ -n "${HUB_MERGE-}" ]; then python3 $D/merge_nodes.py $OIN $O/$m.merged.json "${HUB_MERGE%%|*}" "${HUB_MERGE##*|}" 2>> $O/$m.logfix || exit 1; OIN=$O/$m.merged.json; SL=$OIN; fi
  G=${GOALS-$D/goals/$m.json}; [ -f "$G" ] && GA="--goals $G"
  ${PY_LS:-python3} $D/octls.py $OIN $O/$m.octi.json ${OCTLS_ARGS---theta 8 --anchor 0.4 --lenw 1.0 --escale 5e5 --bend45 3 --bend90 6 --bend135 20 --minlen 150 --win 0 --xpen 100 --passes 4} ${GA-} 2> $O/$m.log4 || { tail -3 $O/$m.log4; exit 1; }
else
  OIN=$O/$m.loom.json; FISHEYE=${FISHEYE-2.5 650 19.4687 51.7703, 1.5 2500}; if [ -n "$FISHEYE" ]; then python3 $(dirname $0)/fisheye.py $OIN $O/$m.fish.json "$FISHEYE" || exit 1; OIN=$O/$m.fish.json; fi
  $B/octi "$@" < $OIN > $O/$m.octi.json 2> $O/$m.log4 || { tail -3 $O/$m.log4; exit 1; }
fi
python3 $(dirname $0)/serving.py $O/$m.octi.json ${SL:-$O/$m.loom.json} $W/data$SUF/$m 2>> $O/$m.logfix || { tail -3 $O/$m.logfix; exit 1; }
$B/transitmap --line-width ${LWID:-30} --line-spacing ${LSP:-7} --outline-width 0 < $O/$m.octi.json > $O/$m.tm.svg 2> $O/$m.log5 || { tail -3 $O/$m.log5; exit 1; }
$B/transitmap --line-width ${LWID:-30} --line-spacing ${LSP:-7} --outline-width 0 -l < $O/$m.octi.json > $O/$m.tl.svg 2>/dev/null
ls -la $O/$m.tm.svg
