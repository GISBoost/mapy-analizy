# build_page.py <work> <page_tpl.html> <out.html>
# Reads <work>/out/tram.svg + tram.lines.json (render.py output) and <work>/geo.json (geo_export.py); writes <out dir>/mapy/tram.svg, mapy/tram_geo.json and the page.
import colorsys, hashlib, json, os, re, sys
W, TPL, OUT = sys.argv[1:4]
rgb = lambda h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
lum = lambda h: 0.299 * rgb(h)[0] + 0.587 * rgb(h)[1] + 0.114 * rgb(h)[2]
def darkv(h):
    r, g, b = [v / 255 for v in rgb(h)]; H, L, S = colorsys.rgb_to_hls(r, g, b)
    if S < 0.15: L = max(L, 0.80)
    elif L < 0.58: L = 0.62; S = min(S, 0.85)
    r, g, b = colorsys.hls_to_rgb(H, L, S); return '%02X%02X%02X' % (int(r * 255), int(g * 255), int(b * 255))
tc = lambda h: '#111' if lum(h) > 165 else '#fff'
def merge(s):  # all polylines of a group -> one path (same look, far fewer DOM nodes)
    def g(m): return m.group(1) + '<path d="' + ''.join('M' + p.replace(' ', 'L') for p in re.findall(r'<polyline points="([^"]+)"/>', m.group(2))) + '"/>\n' + m.group(3)
    return re.sub(r'(<g [^>]*>\n)((?:<polyline points="[^"]+"/>\n)+)(</g>)', g, s)
from pdf import NEUT  # light -> dark colours; the orientation layer's ones also theme the page
BASE = {'#fff', '#ffffff', '#16181d', '#5b6270', '#f3f4f6', '#d5d9e0', '#c8102e', '#111'}  # these the page themes by class
def lmcss():  # dark theme of the orientation layer: its colours are attributes, so they are matched by value
    r = [f':is(svg.map,.legend svg) [{a}="{k}" i]{{{a}:{v}}}' for k, v in NEUT.items() if k not in BASE for a in ('fill', 'stroke')] + [f'svg.map .lb.rl text{{fill:{NEUT["#7a818d"]}}}']
    return '@media (prefers-color-scheme: dark){' + ''.join(':root:not([data-theme="light"]) ' + x for x in r) + '}' + chr(10) + ''.join(':root[data-theme="dark"] ' + x for x in r)
meta = json.load(open(f'{W}/out/tram.lines.json', encoding='utf-8'))
cols = {m['n']: m['c'] for m in meta}
for m in meta: m['d'] = darkv(m['c']); m['td'] = tc(m['d'])
s = open(f'{W}/out/tram.svg', encoding='utf-8').read()
s = re.sub(r'(<svg[^>]*?) width="[^"]*" height="[^"]*"', r'\1', s, count=1)
s = s.replace('<svg ', '<svg id="svg-tram" class="map" preserveAspectRatio="xMidYMid meet" ', 1)
s = re.sub(r'<style>.*?</style>', '', s, count=1, flags=re.S)
v = lambda n: f'--c:#{cols[n]};--cd:#{darkv(cols[n])};--t:{tc(cols[n])};--td:{tc(darkv(cols[n]))}'
s = re.sub(r'<g class="(ln|chip)" data-l="([^"]+)"', lambda m: f'<g class="{m.group(1)}" data-l="{m.group(2)}" style="{v(m.group(2))}"', s)
s = re.sub(r'<tspan class="lln" data-l="([^"]+)"([^>]*?) fill="(#[0-9a-f]+)"', lambda m: f'<tspan class="lln" data-l="{m.group(1)}"{m.group(2)} style="--c:{m.group(3)};--cd:#{darkv(cols[m.group(1)])}"', s)
s = merge(s)
os.makedirs(os.path.join(os.path.dirname(OUT), 'mapy'), exist_ok=True)
open(os.path.join(os.path.dirname(OUT), 'mapy', 'tram.svg'), 'w', encoding='utf-8', newline='\n').write(s)
url = f'mapy/tram.svg?v={hashlib.sha1(s.encode()).hexdigest()[:8]}'  # new URL when the map changes
gj = open(f'{W}/geo.json', encoding='utf-8').read(); D_ = os.path.dirname(OUT)
open(os.path.join(D_, 'mapy', 'tram_geo.json'), 'w', encoding='utf-8').write(gj)
gurl = f'mapy/tram_geo.json?v={hashlib.sha1(gj.encode()).hexdigest()[:8]}'
gv = hashlib.sha1(open(os.path.join(D_, 'geo.js'), 'rb').read()).hexdigest()[:8]
html = open(TPL, encoding='utf-8').read().replace('/*META*/', json.dumps(meta, ensure_ascii=False)).replace('/*SVGS*/', json.dumps(url)).replace('/*LMCSS*/', lmcss()).replace('/*GEOJSON*/', json.dumps(gurl)).replace('/*GEOV*/', gv)
open(OUT, 'w', encoding='utf-8', newline='\n').write(html); print(OUT, len(html) // 1024, 'KB')
