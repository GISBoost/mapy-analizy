# landmarks.py <out.json> -- orientation layer for render.py (env LANDMARKS) from OpenStreetMap (Overpass API):
# passenger railways and stations, the city boundary (= the edge of fare zone 1), parks and forests, the five districts,
# ul. Piotrkowska and the POIs shown as pictograms by their stops (hospitals, Manufaktura, the airport)
import json, sys, math, urllib.request, urllib.parse
from shapely.geometry import LineString, Polygon
from shapely.ops import polygonize, unary_union
BB = '51.65,19.30,51.88,19.66'  # s,w,n,e around Łódź
Q = f"""[out:json][timeout:180];
(way[railway=rail][usage~"main|branch"][service!~"."]({BB}); way[railway=rail][!usage][service!~"."]({BB}); rel[route=train]({BB}); way(r)[railway=rail]({BB}););
out geom tags;
(node[railway~"^(station|halt)$"]({BB}); node[public_transport=station][train=yes]({BB}););
out body;
(nwr[amenity=hospital][name]({BB}); nwr[aeroway=aerodrome][iata]({BB}););
out center tags;
rel[boundary=administrative][admin_level=6][name="Łódź"];
out geom;
(wr[leisure~"^(park|nature_reserve)$"][name]({BB}); wr[landuse=forest][name]({BB}); wr[natural=wood][name]({BB}); wr[tourism=zoo]({BB}); wr[leisure=garden]["garden:type"="botanical"]({BB}););
out geom;
rel[route=train]({BB}); way(r)[railway=rail];
out ids;"""

# the five districts are not mapped as boundaries in OSM: an anchor near the middle of each, the label goes to free room nearby
DISTRICTS = [dict(name='Bałuty', ll=[19.445, 51.808]), dict(name='Widzew', ll=[19.535, 51.760]), dict(name='Polesie', ll=[19.405, 51.760]),
             dict(name='Górna', ll=[19.475, 51.722]), dict(name='Śródmieście', ll=[19.465, 51.772])]
# POIs shown as pictograms by their nearest stop (OSM name prefix -> short name); hospitals: the large emergency ones only
KEEP = {'Centralny Szpital Kliniczny': 'CSK', 'Instytut Centrum Zdrowia Matki Polki': 'ICZMP', 'Wojewódzki Szpital Specjalistyczny im. M. Kopernika': 'Kopernik',
        'Uniwersytecki Szpital Kliniczny im. WAM': 'WAM', 'Uniwersytecki Szpital Kliniczny nr 1 im. N. Barlickiego': 'Barlicki',
        'Wojewódzki Specjalistyczny Szpital im. dr. Władysława Biegańskiego': 'Biegański', 'III Szpital Miejski im. dr. Karola Jonschera': 'Jonscher',
        'Wojewódzki Specjalistyczny Szpital imienia Mikołaja Pirogowa': 'Pirogow',
        'Port Lotniczy Łódź': 'Lotnisko'}
MANUFAKTURA = dict(kind='mall', name='Manufaktura', ll=[19.4469, 51.7795])  # its pictogram goes to the nearest stop
# ul. Piotrkowska: a straight line up from this stop (where a map has no such stop: from its place) to the height of pl. Wolności
PIOTRKOWSKA = dict(stop='Piotrkowska Centrum', south=[19.4569, 51.7593], north=[19.4567, 51.7768], square='pl. Wolności')
# green areas: parks and forests of at least GREEN_HA hectares (protected-area boundaries left out: they are not places);
# the ones listed here also when smaller, with a label (short name)
GREEN_HA = 20
GREEN_NAMES = {'Las Łagiewnicki': 'Las Łagiewnicki', 'Park na Zdrowiu': 'Park na Zdrowiu', 'Park im. księcia Józefa Poniatowskiego': 'Park Poniatowskiego',
               'Park Źródliska I': 'Źródliska', 'Park Źródliska II': 'Źródliska', 'Park im. 3 Maja': 'Park 3 Maja', 'Ogród Botaniczny': 'Ogród Botaniczny',
               'Ogród Zoologiczny': 'Zoo', 'Park Julianowski': 'Park Julianowski', 'Las Lublinek': 'Las Lublinek'}
NOT_PLACES = ('Zespół', 'Użytek', 'Rezerwat', 'Park Krajobrazowy', 'Obszar')

def fetch():
    for url in ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'):
        req = urllib.request.Request(url, urllib.parse.urlencode({'data': Q}).encode(), headers={'User-Agent': 'gisboost-schemat-linii-lodz'})
        try: return json.load(urllib.request.urlopen(req, timeout=240))['elements']
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

ha = lambda g: g.area * 111320 * math.cos(math.radians(51.77)) * 110570 / 1e4
rings = lambda g: [list(p.exterior.coords) for p in getattr(g, 'geoms', [g])]
GREEN_KEYS = ('leisure', 'landuse', 'natural', 'tourism')

def main(out):
    rail, stations, poi, green, city = [], [], [MANUFAKTURA], [], None
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
        elif t.get('boundary') == 'administrative':
            g = area(e)
            if g is not None: city = max(getattr(g, 'geoms', [g]), key=lambda p: p.area)
        elif any(k in t for k in GREEN_KEYS) and ('geometry' in e or 'members' in e):
            g = area(e); nm = t.get('name', '')
            if t.get('boundary') == 'protected_area' or nm.startswith(NOT_PLACES): continue
            if g is not None and (ha(g) >= GREEN_HA or nm in GREEN_NAMES and ha(g) >= 3): green.append(dict(name=GREEN_NAMES.get(nm, ''), osm=nm, ha=round(ha(g)), rings=rings(g)))
        elif ll(e):
            kind = 'airport' if 'aeroway' in t else 'hospital'
            short = next((v for k, v in KEEP.items() if t.get('name', '').startswith(k)), None)
            if short: poi.append(dict(kind=kind, name=short, ll=ll(e)))
    json.dump(dict(rail=rail, stations=stations, districts=DISTRICTS, piotrkowska=PIOTRKOWSKA, poi=poi, green=green,
                   city=list(city.exterior.coords) if city is not None else None), open(out, 'w', encoding='utf-8'), ensure_ascii=False)
    print('rail ways', len(rail), 'passenger', sum(r['passenger'] for r in rail), 'stations', len(stations), 'poi', len(poi),
          'city', city is not None, 'green', len(green), sorted((g['ha'], g['osm']) for g in green)[-25:])

if __name__ == '__main__': main(sys.argv[1])
