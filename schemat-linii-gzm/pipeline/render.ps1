# render.ps1 [OUT_DIR=out\tram_b]  -- run from the WORK dir (schemat-gzm-dane); needs py with shapely, numpy, PIL
param([string]$O = 'out\tram_b')
$env:FONT_DIR = '\\wsl.localhost\Ubuntu\usr\share\fonts\opentype\inter'
$env:SRC = 'ZTM GZM'; $env:URL = 'gisboost.github.io/mapy-analizy/schemat-linii-gzm'
$env:POSTER_RATIO = "0.52"; $env:LEGEND_AT = 'band'; $env:ZOOM_H = "1.1"; $env:KEY_AT = 'tl'; $env:POSTER_TEXT = "2.2"
$env:ZOOM = '{"stations":["Katowice Rynek","Katowice Plac Wolności","Katowice Dworzec PKP","Katowice Św. Jana","Katowice Sokolska"],"k":3,"title":"Centrum Katowic"}'
$env:LANDMARKS = "landmarks.json"; $env:RAIL_STYLE = "double"; $env:LM_LAT = "50.27"; $env:DISTRICT_FS = "4"
$R = Join-Path $PSScriptRoot 'render.py'
py -3 -X utf8 $R "$O\map.svg" "$O\4_octi.json" data\tram\lines.json "$O\tram.svg" 'Tramwaje GZM — schemat linii' 'Dzień roboczy, środa 16.09.2026 · GTFS ZTM GZM · układ oktylinearny: LOOM' 9 all "$O\map_labels.svg" tram "$O\3_loom.json" colors.json




