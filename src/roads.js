import * as THREE from 'three';
import net from './data/road_network.json';
import site from './data/site.json';

// Data-driven roads. Centre lines, widths, lanes and deck heights come from
// road_network.json (web metres). backdrop "render" (site.json, or ?backdrop=map)
// places the left-side nala, far wall and Lyari Expressway where the CAM02
// render puts them. The map-true polylines stay in the file.

const MARK = new Set([
  'C1_collector', 'C2_shahrah_sb', 'C3_shahrah_nb', 'L0_sb_to_collector', 'L1_collector_to_sb',
  'R1_left_road', 'B1_back_road', 'osm_549109375',
]);
// Far-left Lyari / M-9 decks replaced by the render backdrop when that variant is on.
const FAR_LEFT = new Set([
  'osm_176085067', 'osm_671311865', 'osm_176085074', 'osm_176085051', 'osm_545406555',
  'osm_176085054', 'osm_176085068', 'osm_671311866',
]);

function vecs(cl) {
  return cl.map((p) => new THREE.Vector3(p[0], p[2] || 0, p[1]));
}

function ribbon3(b, key, pts, width, yLift = 0.06) {
  const n = pts.length;
  if (n < 2) return;
  const pos = [], nor = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)], p = pts[i];
    const t = next.clone().sub(prev); t.y = 0;
    if (t.lengthSq() < 1e-8) t.set(1, 0, 0);
    t.normalize();
    const s = new THREE.Vector3(-t.z, 0, t.x);
    if (i > 0) acc += p.distanceTo(pts[i - 1]);
    const y = p.y + yLift;
    pos.push(p.x + s.x * width / 2, y, p.z + s.z * width / 2, p.x - s.x * width / 2, y, p.z - s.z * width / 2);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, acc / 28, 1, acc / 28);
    if (i < n - 1) idx.push(i * 2, (i + 1) * 2, i * 2 + 1, i * 2 + 1, (i + 1) * 2, (i + 1) * 2 + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const p0 = new THREE.Vector3().fromArray(pos, 0), p1 = new THREE.Vector3().fromArray(pos, 3), p2 = new THREE.Vector3().fromArray(pos, 6);
  if (new THREE.Vector3().subVectors(p2, p0).cross(new THREE.Vector3().subVectors(p1, p0)).y < 0) {
    for (let k = 0; k < idx.length; k += 3) { const tmp = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tmp; }
    g.setIndex(idx);
  }
  b.geom(key, g, new THREE.Matrix4());
}

function side(a, c) {
  const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz) || 1;
  return { tx: dx / L, tz: dz / L, sx: -dz / L, sz: dx / L, L };
}

function edgeBeams(b, pts, lateral, key, w, h, yLift) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const s = side(a, c);
    const ax = a.x + s.sx * lateral, az = a.z + s.sz * lateral;
    const cx = c.x + s.sx * lateral, cz = c.z + s.sz * lateral;
    b.beam(key, new THREE.Vector3(ax, a.y + yLift, az), new THREE.Vector3(cx, c.y + yLift, cz), w, h);
  }
}

function walk(pts, step, fn) {
  let acc = 0, next = step * 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const L = a.distanceTo(c) || 1e-6;
    while (acc + L >= next) {
      const u = (next - acc) / L;
      fn(a.clone().lerp(c, u), side(a, c));
      next += step;
    }
    acc += L;
  }
}

function dashes(b, pts, lateral, key) {
  walk(pts, 12, (p, s) => {
    b.box(key, p.x + s.sx * lateral, p.y + 0.09, p.z + s.sz * lateral, 0.14, 0.02, 3.1, Math.atan2(s.tx, s.tz));
  });
}

function gore(b, pts) {
  const n = Math.min(pts.length - 1, 6);
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[i + 1], s = side(a, c);
    b.box('laneYellow', (a.x + c.x) / 2, a.y + 0.1, (a.z + c.z) / 2, 0.35, 0.02, s.L * 0.7, Math.atan2(s.tx, s.tz) + 0.55);
  }
}

const pierGeo = new THREE.CylinderGeometry(0.9, 0.95, 1, 10);
pierGeo.translate(0, 0.5, 0);

function piers(b, pts, width) {
  walk(pts, 30, (p, s) => {
    if (p.y < 2.2) return;
    const h = p.y - 1.3;
    const m = new THREE.Matrix4().makeScale(1, h, 1);
    m.setPosition(p.x, 0, p.z);
    b.geom('concrete', pierGeo, m);
    b.box('concrete', p.x, p.y - 1.15, p.z, width * 0.72, 0.45, 1.6, Math.atan2(s.tx, s.tz));
  });
}

function deck(b, pts, width) {
  ribbon3(b, 'concrete', pts, width + 1.1, -0.7);
  ribbon3(b, 'asphalt', pts, width, 0.05);
  edgeBeams(b, pts, width / 2 + 0.15, 'fin', 0.32, 0.85, 0.35);
  edgeBeams(b, pts, -width / 2 - 0.15, 'fin', 0.32, 0.85, 0.35);
  piers(b, pts, width);
}

function grade(b, road) {
  const pts = vecs(road.centerline_xzy);
  const w = road.width || 7;
  ribbon3(b, 'curb', pts, w + 0.9, 0.02);
  ribbon3(b, road.oneway ? 'asphalt' : 'road', pts, w, 0.06);
  if (road.footpath) ribbon3(b, 'sidewalk', pts, w + 6, 0.03);
  if (!MARK.has(road.id)) return pts;
  const lanes = road.lanes || [1, 1];
  const fwd = lanes[0] || 0, back = lanes[1] || 0;
  const n = Math.max(1, fwd + back);
  const lw = w / n;
  if (back > 0 && fwd > 0) {
    edgeBeams(b, pts, 0.16, 'laneYellow', 0.12, 0.02, 0.1);
    edgeBeams(b, pts, -0.16, 'laneYellow', 0.12, 0.02, 0.1);
  }
  for (let i = 1; i < n; i++) {
    const lat = -w / 2 + i * lw;
    if (Math.abs(lat) < 0.4 && back > 0) continue;
    dashes(b, pts, lat, 'laneWhite');
  }
  if (road.oneway) edgeBeams(b, pts, -w / 2 + 0.35, 'laneYellow', 0.14, 0.02, 0.1);
  const marks = (road.markings || []).join(' ').toLowerCase();
  if (marks.includes('gore') || marks.includes('hatch')) gore(b, pts);
  return pts;
}

function extendXZ(pts, dist) {
  const out = pts.map((p) => p.slice());
  const a = out[0], b = out[1], c = out[out.length - 2], d = out[out.length - 1];
  const ux = a[0] - b[0], uz = a[1] - b[1], L1 = Math.hypot(ux, uz) || 1;
  const vx = d[0] - c[0], vz = d[1] - c[1], L2 = Math.hypot(vx, vz) || 1;
  out.unshift([a[0] + ux / L1 * dist, a[1] + uz / L1 * dist]);
  out.push([d[0] + vx / L2 * dist, d[1] + vz / L2 * dist]);
  return out;
}

function backdrop(b, foliage, r) {
  const v = net.features.render_backdrop_variant;
  const water = extendXZ(v.render_water_y_minus5, 420).map(([x, z]) => new THREE.Vector3(x, -5.5, z));
  const wall = extendXZ(v.render_far_wall_foot, 420).map(([x, z]) => new THREE.Vector3(x, 0, z));
  const exp = extendXZ(v.render_expressway_top_y8, 380).map(([x, z]) => new THREE.Vector3(x, 8, z));
  const fly = v.render_flyover_piers.map(([x, z], i, arr) => new THREE.Vector3(x, 7 + 8 * (1 - Math.abs(i / (arr.length - 1) - 0.5) * 2), z));
  ribbon3(b, 'canalBed', water, 46, 0.2);
  ribbon3(b, 'canalWater', water, 14, 0.55);
  // sloped banks: a wide concrete ribbon under the lip, plus the far retaining wall
  ribbon3(b, 'concrete', water, 70, 2.4);
  for (let i = 0; i < wall.length - 1; i++) {
    const a = wall[i], c = wall[i + 1], s = side(a, c);
    b.box('concrete', (a.x + c.x) / 2, 3.2, (a.z + c.z) / 2, 1.4, 6.4, s.L + 0.4, Math.atan2(s.tx, s.tz));
  }
  deck(b, exp, 22);
  deck(b, fly, 10);
  for (let i = 0; i < water.length; i += 3) foliage.tree(water[i].x + (r() - 0.5) * 18, -5.2, water[i].z, 6 + r() * 4, r(), 0.5);
  return [
    [water, 40], [wall, 8], [exp, 16], [fly, 10],
  ];
}

function mapNala(b, foliage, r) {
  const w = net.water[0];
  const near = w.near_bank.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const far = w.far_bank.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const mid = near.map((p, i) => {
    const q = far[Math.min(i, far.length - 1)];
    return new THREE.Vector3((p.x + q.x) / 2, -5.5, (p.z + q.z) / 2);
  });
  ribbon3(b, 'canalBed', mid, (w.water?.width_m || 12) + 28, 0.15);
  ribbon3(b, 'canalWater', mid, w.water?.width_m || 12, 0.5);
  ribbon3(b, 'concrete', near, 6, 0.05);
  ribbon3(b, 'concrete', far, 8, 0.2);
  return [[mid, 30], [near, 8], [far, 8]];
}

function medianPalms(foliage, r, aPts, bPts, every) {
  let acc = 0;
  for (let i = 0; i < aPts.length; i += 2) {
    const p = aPts[i];
    let best = 1e9, q = null;
    for (let k = 0; k < bPts.length; k += 2) {
      const dx = bPts[k].x - p.x, dz = bPts[k].z - p.z, d = dx * dx + dz * dz;
      if (d < best) { best = d; q = bPts[k]; }
    }
    const dist = Math.sqrt(best);
    if (!q || dist < 10 || dist > 28) continue;
    acc += 8;
    if (acc < every) continue;
    acc = 0;
    const x = (p.x + q.x) / 2, z = (p.z + q.z) / 2, y = Math.max(p.y, q.y);
    foliage.palm(x, y + 0.3, z, 6.2 + r() * 2, r());
  }
}

function curveOf(pts) {
  const step = Math.max(1, Math.floor(pts.length / 48));
  const slim = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  return new THREE.CatmullRomCurve3(slim.map((p) => new THREE.Vector3(p.x, 0, p.z)), false, 'centripetal');
}

function yOf(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = acc[acc.length - 1] || 1;
  return (t) => {
    const d = Math.max(0, Math.min(1, t)) * total;
    let i = 1;
    while (i < acc.length - 1 && acc[i] < d) i++;
    const u = (d - acc[i - 1]) / ((acc[i] - acc[i - 1]) || 1);
    return pts[i - 1].y + (pts[i].y - pts[i - 1].y) * u + 0.3;
  };
}

export function buildRoadNetwork(b, foliage, r) {
  const params = new URLSearchParams(location.search);
  const backdropMode = params.get('backdrop') || site.backdrop || 'render';
  const corridors = [];
  const byId = {};
  for (const road of net.roads) {
    if (!road.centerline_xzy || road.centerline_xzy.length < 2) continue;
    if (backdropMode === 'render' && FAR_LEFT.has(road.id)) continue;
    const pts = vecs(road.centerline_xzy);
    if (road.bridge || road.max_y > 2.2) deck(b, pts, road.width || 10);
    else grade(b, road);
    byId[road.id] = pts;
    corridors.push([pts, (road.width || 8) / 2 + ((road.bridge || road.max_y > 2.2) ? 6 : 3)]);
  }
  if (byId.C1_collector && byId.C2_shahrah_sb) medianPalms(foliage, r, byId.C1_collector, byId.C2_shahrah_sb, 13);
  if (byId.C2_shahrah_sb && byId.C3_shahrah_nb) medianPalms(foliage, r, byId.C2_shahrah_sb, byId.C3_shahrah_nb, 14);
  // raised median kerb between the parallel carriageways, sampled where they run together
  for (const [a, c, width] of [[byId.C1_collector, byId.C2_shahrah_sb, 5.2], [byId.C2_shahrah_sb, byId.C3_shahrah_nb, 6]]) {
    if (!a || !c) continue;
    const mid = [];
    for (let i = 0; i < a.length; i += 2) {
      let best = 1e9, q = null;
      for (let k = 0; k < c.length; k += 2) {
        const d = (c[k].x - a[i].x) ** 2 + (c[k].z - a[i].z) ** 2;
        if (d < best) { best = d; q = c[k]; }
      }
      const dist = Math.sqrt(best);
      if (q && dist > 12 && dist < 26) mid.push(new THREE.Vector3((a[i].x + q.x) / 2, Math.max(a[i].y, q.y), (a[i].z + q.z) / 2));
    }
    if (mid.length > 3) {
      ribbon3(b, 'curb', mid, width + 0.6, 0.14);
      ribbon3(b, 'median', mid, width, 0.22);
    }
  }
  const extra = backdropMode === 'render' ? backdrop(b, foliage, r) : mapNala(b, foliage, r);
  corridors.push(...extra);
  const pack = (id, lanes, oneWay) => {
    const pts = byId[id];
    if (!pts) return null;
    return { curve: curveOf(pts), width: 14, y: yOf(pts), lanes, oneWay };
  };
  return {
    corridors,
    byId,
    traffic: {
      service: pack('C1_collector', [-5.25, -1.75, 1.75, 5.25], 1),
      main: pack('C2_shahrah_sb', [-5.25, -1.75, 1.75, 5.25], 1),
      nb: pack('C3_shahrah_nb', [-5.25, -1.75, 1.75, 5.25], 1),
      left: pack('R1_left_road', [-5.2, -1.7, 1.7, 5.2]),
      back: pack('B1_back_road', [-5.2, -1.7, 1.7, 5.2]),
      fly: pack('osm_176084978', [-4, -1.3, 1.3, 4], 1),
    },
  };
}
