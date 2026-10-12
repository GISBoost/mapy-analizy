# landmarks.py <out.json> -- orientation layer for render.py (env LANDMARKS) from OpenStreetMap (Overpass API):
# passenger railways and stations, parks and forests, city names, hospitals and shopping centres shown as pictograms by their stops.
# Adapted from the Łódź pipeline (schemat-linii-lodz/pipeline/landmarks.py); GZM has no single city boundary, so none is fetched.
import json, sys, math, urllib.request, urllib.parse
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union
BB = '50.12,18.60,50.46,19.32'  # s,w,n,e around the tram network
Q = f"""[out:json][timeout:240];
(way[railway=rail][usage~"main|branch"][service!~"."]({BB}); way[railway=rail][!usage][service!~"."]({BB}); rel[route=train]({BB}); way(r)[railway=rail]({BB}););
out geom tags;
(node[railway~"^(station|halt)$"]({BB}); node[public_transport=station][train=yes]({BB}););
out body;
(nwr[amenity=hospital][name]({BB}); nwr[shop=mall][name]({BB}););
out center tags;
(wr[leisure~"^(park|nature_reserve)$"][name]({BB}); wr[landuse=forest][name]({BB}); wr[natural=wood][name]({BB}); wr[tourism=zoo]({BB}); wr[leisure=garden]["garden:type"="botanical"]({BB}););
out geom;
rel[route=train]({BB}); way(r)[railway=rail];
out ids;"""

# cities are not shown as boundaries: an anchor near the middle of each, the label goes to free room nearby
DISTRICTS = [dict(name=n, ll=[x, y]) for n, x, y in [
    ('Gliwice', 18.672, 50.296), ('Zabrze', 18.780, 50.315), ('Bytom', 18.920, 50.350), ('Ruda Śląska', 18.870, 50.262),
    ('Świętochłowice', 18.920, 50.292), ('Chorzów', 18.955, 50.298), ('Katowice', 19.040, 50.250), ('Siemianowice Śl.', 19.030, 50.325),
    ('Czeladź', 19.080, 50.312), ('Będzin', 19.130, 50.330), ('Sosnowiec', 19.150, 50.285), ('Mysłowice', 19.140, 50.235),
    ('Dąbrowa Górnicza', 19.230, 50.325)]]
# pictograms by the nearest stop: hospitals with an emergency department and the big shopping centres (OSM name prefix -> short name)
MALLS = {'Silesia City Center': 'Silesia City Center', 'Galeria Katowicka': 'Galeria Katowicka'}
GREEN_HA = 120  # parks and forests of at least this many hectares; the named ones below also when smaller
GREEN_NAMES = {'Park Śląski': 'Park Śląski', 'Wojewódzki Park Kultury i Wypoczynku': 'Park Śląski', 'Park Kościuszki': 'Park Kościuszki',
               'Śląski Ogród Zoologiczny': 'Zoo', 'Dolina Trzech Stawów': 'Dolina Trzech Stawów', 'Las Murckowski': 'Las Murckowski'}
NOT_PLACES = ('Otulina', 'Zespół', 'Użytek', 'Rezerwat', 'Park Krajobrazowy', 'Obszar')

def fetch():
    for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
        req = urllib.request.Request(url, urllib.parse.urlencode({'data': Q}).encode(), headers={'User-Agent': 'gisboost-schemat-linii-gzm'})
        try: return json.load(urllib.request.urlopen(req, timeout=300))['elements']
        except OSError as e: print(url, e, file=sys.stderr)
    sys.exit('no Overpass server answered')

def ll(el):
    if 'lon' in el: return [el['lon'], el['lat']]
    if 'center' in el: return [el['center']['lon'], el['center']['lat']]

def area(el):  # a closed way or a multipolygon relation (its outer members) as one shapely geometry in lon/lat
    if el['type'] == 'way':
        c = [(p['lon'], p['lat']) for p in el.get('geometry', [])]
        return Polygon(c) if len(c) > 3 and c[0] == c[-1] else None
    ls = [LineString([(p['lon'], p['lat']) for p in m['geometry']]) for m in el.get('members', []) if m.get('role') in ('outer', '') and len(m.get('geometry', [])) > 1]
    g = unary_union(list(polygonize(unary_union(ls)))) if ls else None
    return g if g is not None and not g.is_empty else None

ha = lambda g: g.area * 111320 * math.cos(math.radians(50.27)) * 110570 / 1e4
rings = lambda g: [list(p.exterior.coords) for p in getattr(g, 'geoms', [g])]
GREEN_KEYS = ('leisure', 'landuse', 'natural', 'tourism')

def main(out):
    rail, stations, poi, green = [], [], [], []
    raw = out + '.osm.json'  # the Overpass answer, kept so that a re-run (new filters) does not query again
    try: els = json.load(open(raw, encoding='utf-8'))
    except OSError: els = fetch(); json.dump(els, open(raw, 'w', encoding='utf-8'))
    passenger = {e['id'] for e in els if e['type'] == 'way' and 'tags' not in e}  # ways of route=train relations
    for e in els:
        t = e.get('tags', {})
        if e['type'] == 'way' and t.get('railway') == 'rail':
            rail.append(dict(id=e['id'], passenger=e['id'] in passenger, tunnel=t.get('tunnel') == 'yes' or t.get('layer', '0').startswith('-'),
                             usage=t.get('usage', ''), xy=[[p['lon'], p['lat']] for p in e['geometry']]))
        elif t.get('railway') in ('station', 'halt') or (t.get('public_transport') == 'station' and t.get('train') == 'yes'):
            if t.get('name') and t.get('station') not in ('subway', 'light_rail', 'monorail') and t.get('railway') != 'tram_stop':
                stations.append(dict(name=t['name'], ll=ll(e)))
        elif any(k in t for k in GREEN_KEYS) and ('geometry' in e or 'members' in e):
            g = area(e); nm = t.get('name', '')
            if t.get('boundary') == 'protected_area' or nm.startswith(NOT_PLACES): continue
            if g is not None and (ha(g) >= GREEN_HA or nm in GREEN_NAMES and ha(g) >= 3): green.append(dict(name=GREEN_NAMES.get(nm, nm if ha(g) >= 500 else ''), osm=nm, ha=round(ha(g)), rings=rings(g)))
        elif ll(e):
            nm = t.get('name', '')
            mall = next((v for k, v in MALLS.items() if nm.startswith(k)), None)
            if mall: poi.append(dict(kind='mall', name=mall, ll=ll(e)))
            elif t.get('amenity') == 'hospital' and t.get('emergency') == 'yes': poi.append(dict(kind='hospital', name=nm, ll=ll(e)))
    json.dump(dict(rail=rail, stations=stations, districts=DISTRICTS, piotrkowska=None, poi=poi, green=green, city=None),
              open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print('rail ways', len(rail), 'passenger', sum(r['passenger'] for r in rail), 'stations', len(stations), 'poi', sorted((p['kind'], p['name']) for p in poi),
          'green', len(green), sorted((g['ha'], g['osm']) for g in green)[-25:])

if __name__ == '__main__': main(sys.argv[1])
