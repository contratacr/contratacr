#!/usr/bin/env python3
# LOCAL PRO ONLY (directory seed). Offline converter: reads ONE local OpenStreetMap .osm.pbf extract (e.g. Geofabrik
# costa-rica-latest.osm.pbf, ODbL) with pyosmium and writes the two local inputs of stage-import.mjs:
#  (a) <out-dir>/osm-pois.json       Overpass-style JSON {elements:[{type,id,lat,lon|center,timestamp,tags}]} of the
#      elements that carry a directory key (amenity, shop, tourism, leisure, healthcare, office, craft; since 2026-11-26 also
#      natural=waterfall/hot_spring/beach/volcano/cave_entrance and boundary=national_park/protected_area, aeroway=aerodrome) and a name
#      (or an ATM with an operator). Nodes keep lat/lon; ways and multipolygon relations get a `center` (mean of the
#      outer-ring vertices). Refs are the real OSM ids (way/<id>, relation/<id>). All tags of a selected element are
#      kept because classifyTags/stage-osm-extras read many of them; stage-import.mjs never copies raw tags.
#  (b) <out-dir>/osm-admin-areas.json Overpass `out geom`-style JSON of administrative relations for --admin-areas:
#      admin_level 4 only when ISO3166-2 starts with CR- (provinces), admin_level 6 (cantons; foreign ones are
#      harmless because stage-import --inside-only drops points outside every CR province). Multipolygons are
#      assembled by pyosmium's area handler; each ring is written as one pseudo member way with its geometry.
# Usage: python -I scripts/directory/osm-pbf-to-json.py <file.osm.pbf> <out-dir>
# No network access.
import json
import os
import sys

import osmium

KEYS = ('amenity', 'shop', 'tourism', 'leisure', 'healthcare', 'office', 'craft')
# 2026-11-26 (/atracciones): named natural sights and protected areas that carry none of the keys above.
NATURAL = ('waterfall', 'hot_spring', 'beach', 'volcano', 'cave_entrance')
BOUNDARY = ('national_park', 'protected_area')
# (/transporte) named airports and aerodromes.
AEROWAY = ('aerodrome',)


def selected(tags):
    if not any(k in tags for k in KEYS) and tags.get('natural') not in NATURAL and tags.get('boundary') not in BOUNDARY \
            and tags.get('aeroway') not in AEROWAY:
        return False
    if tags.get('name') or tags.get('name:es'):
        return True
    return tags.get('amenity') == 'atm' and bool(tags.get('operator'))


def ts(obj):
    try:
        return obj.timestamp.strftime('%Y-%m-%dT%H:%M:%SZ')
    except Exception:
        return None


def ring_points(ring):
    return [(n.lon, n.lat) for n in ring if n.location.valid()]


class Handler(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.pois = []
        self.admin = []

    def node(self, n):
        tags = dict(n.tags)
        if selected(tags) and n.location.valid():
            self.pois.append({'type': 'node', 'id': n.id, 'lat': round(n.location.lat, 7), 'lon': round(n.location.lon, 7),
                              'timestamp': ts(n), 'tags': tags})

    def way(self, w):
        tags = dict(w.tags)
        if not selected(tags):
            return
        pts = [(n.lon, n.lat) for n in w.nodes if n.location.valid()]
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        if not pts:
            return
        self.pois.append({'type': 'way', 'id': w.id, 'center': {'lat': round(sum(p[1] for p in pts) / len(pts), 7),
                          'lon': round(sum(p[0] for p in pts) / len(pts), 7)}, 'timestamp': ts(w), 'tags': tags})

    def area(self, a):
        if a.from_way():
            return  # closed ways are handled once, in way()
        tags = dict(a.tags)
        level = tags.get('admin_level')
        if tags.get('boundary') == 'administrative' and level in ('4', '6'):
            if level == '4' and not str(tags.get('ISO3166-2', '')).startswith('CR-'):
                return
            members = []
            for outer in a.outer_rings():
                members.append({'type': 'way', 'role': 'outer', 'geometry': [{'lat': p[1], 'lon': p[0]} for p in ring_points(outer)]})
                for inner in a.inner_rings(outer):
                    members.append({'type': 'way', 'role': 'inner', 'geometry': [{'lat': p[1], 'lon': p[0]} for p in ring_points(inner)]})
            if members:
                keep = {k: tags[k] for k in ('name', 'name:es', 'admin_level', 'boundary', 'ISO3166-2') if k in tags}
                self.admin.append({'type': 'relation', 'id': a.orig_id(), 'tags': keep, 'members': members})
            return
        if not selected(tags):
            return
        pts = []
        for outer in a.outer_rings():
            pts.extend(ring_points(outer))
        if not pts:
            return
        self.pois.append({'type': 'relation', 'id': a.orig_id(), 'center': {'lat': round(sum(p[1] for p in pts) / len(pts), 7),
                          'lon': round(sum(p[0] for p in pts) / len(pts), 7)}, 'timestamp': ts(a), 'tags': tags})


def main():
    if len(sys.argv) != 3 or '://' in sys.argv[1]:
        print('Uso / usage: python -I osm-pbf-to-json.py <file.osm.pbf> <out-dir>', file=sys.stderr)
        sys.exit(2)
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    h = Handler()
    h.apply_file(src, locations=True, idx='flex_mem')
    with open(os.path.join(out, 'osm-pois.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 0.6, 'generator': 'osm-pbf-to-json.py', 'elements': h.pois}, f, ensure_ascii=False)
    with open(os.path.join(out, 'osm-admin-areas.json'), 'w', encoding='utf-8') as f:
        json.dump({'version': 0.6, 'generator': 'osm-pbf-to-json.py', 'elements': h.admin}, f, ensure_ascii=False)
    print(f'POIs: {len(h.pois)} · admin areas: {len(h.admin)} '
          f'(level 4: {sum(1 for a in h.admin if a["tags"].get("admin_level") == "4")})', file=sys.stderr)


if __name__ == '__main__':
    main()
