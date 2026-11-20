import * as THREE from 'three';
import { Batch, rng } from './batch.js';
import site from './data/site.json';
import { buildRoadNetwork } from './roads.js';

// Roads, boundary plinth, gate apron and masjid for the real compound.
// The front railing and lamp globes already live in podium.glb (the_wire, Helix);
// this module does not rebuild them.

const V3 = (x, z, y = 0) => new THREE.Vector3(x, y, z);

function ribbon(b, key, pts, width, y, { closed = false, vScale = 28 } = {}) {
  const n = pts.length;
  const pos = [], nor = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n], p = pts[i];
    const t = (closed ? c.clone().sub(a) : pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)])).setY(0);
    if (t.lengthSq() < 1e-8) t.set(1, 0, 0);
    t.normalize();
    const s = new THREE.Vector3(-t.z, 0, t.x);
    if (i > 0) acc += p.distanceTo(pts[i - 1]);
    pos.push(p.x + s.x * width / 2, y, p.z + s.z * width / 2, p.x - s.x * width / 2, y, p.z - s.z * width / 2);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, acc / vScale, 1, acc / vScale);
    if (i < n - 1 || closed) {
      const j = (i + 1) % n;
      idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1);
    }
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

function distToPolyline(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / l2;
    t = Math.max(0, Math.min(1, t));
    best = Math.min(best, (a.x + abx * t - x) ** 2 + (a.z + abz * t - z) ** 2);
  }
  return Math.sqrt(best);
}

function inside(x, z, poly) {
  let w = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) w = !w;
  }
  return w;
}

function arcAngles() {
  const { c, from, to } = site.boundary.arc;
  const a0 = Math.atan2(from[1] - c[1], from[0] - c[0]);
  const a1 = Math.atan2(to[1] - c[1], to[0] - c[0]);
  let sweep = a0 - a1;
  if (sweep < 0) sweep += Math.PI * 2;
  if (sweep > Math.PI) sweep -= Math.PI * 2;
  return { a0, sweep };
}

function sampleArc(extra, n = 36) {
  const { c, r } = site.boundary.arc;
  const { a0, sweep } = arcAngles();
  const R = r + extra;
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 - sweep * (i / n);
    pts.push([c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R]);
  }
  return pts;
}

const INTERIOR = [20, 10];
function faceOut(nx, nz, mx, mz) {
  if (nx * (INTERIOR[0] - mx) + nz * (INTERIOR[1] - mz) > 0) return [-nx, -nz];
  return [nx, nz];
}
function straightNormal() {
  const s = site.boundary.frontStraight;
  const dx = s[s.length - 1][0] - s[0][0], dz = s[s.length - 1][1] - s[0][1];
  const L = Math.hypot(dx, dz) || 1;
  const mx = (s[0][0] + s[s.length - 1][0]) / 2, mz = (s[0][1] + s[s.length - 1][1]) / 2;
  return faceOut(-dz / L, dx / L, mx, mz);
}

function offsetStraight(dist) {
  const [nx, nz] = straightNormal();
  return site.boundary.frontStraight.map(([x, z]) => [x + nx * dist, z + nz * dist]);
}

function extend(pts, before, after) {
  const out = pts.map((p) => p.slice());
  const a = out[0], b = out[1];
  const dx = a[0] - b[0], dz = a[1] - b[1], L = Math.hypot(dx, dz) || 1;
  out.unshift([a[0] + dx / L * before, a[1] + dz / L * before]);
  const c = out[out.length - 2], d = out[out.length - 1];
  const ex = d[0] - c[0], ez = d[1] - c[1], M = Math.hypot(ex, ez) || 1;
  out.push([d[0] + ex / M * after, d[1] + ez / M * after]);
  return out;
}

function frontLine(offset) {
  const straight = offsetStraight(offset);
  const arc = sampleArc(offset, 42);
  return extend([...straight, ...arc], 220, 80).map(([x, z]) => V3(x, z));
}

function edgeOffset(a, b, dist, extendBy) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
  const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  const [nx, nz] = faceOut(-dz / L, dx / L, mx, mz);
  const ux = dx / L, uz = dz / L;
  const p0 = [a[0] - ux * extendBy + nx * dist, a[1] - uz * extendBy + nz * dist];
  const p1 = [b[0] + ux * extendBy + nx * dist, b[1] + uz * extendBy + nz * dist];
  return [p0, p1].map(([x, z]) => V3(x, z));
}

function curveOf(pts) {
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
}

function edgeLine(b, pts, lateral, key, w = 0.16) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz) || 1;
    const sx = -dz / L, sz = dx / L;
    b.beam(key, V3(a.x + sx * lateral, a.z + sz * lateral, 0.1), V3(c.x + sx * lateral, c.z + sz * lateral, 0.1), w, 0.025);
  }
}

function dashes(b, pts, lateral, gap, len, width, key) {
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz) || 1;
    const tx = dx / L, tz = dz / L, sx = -tz, sz = tx;
    const steps = Math.max(1, Math.round(L / (gap + len)));
    for (let k = 0; k < steps; k++) {
      const u = (k + 0.35) / steps;
      const x = a.x + dx * u + sx * lateral, z = a.z + dz * u + sz * lateral;
      b.box(key, x, 0.09, z, width, 0.02, len * 0.55, Math.atan2(tx, tz));
    }
  }
}

function zebra(b, x, z, tx, tz, across, count) {
  const sx = -tz, sz = tx;
  for (let i = -count; i <= count; i++) {
    const o = i * 0.85;
    b.box('laneWhite', x + sx * o, 0.11, z + sz * o, 0.55, 0.025, across, Math.atan2(tx, tz));
  }
}

function lampsAlong(b, pts, lateral, every, y = 0) {
  const lamps = [];
  for (let i = 2; i < pts.length - 2; i += every) {
    const a = pts[i], c = pts[Math.min(pts.length - 1, i + 1)];
    const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz) || 1;
    const sx = -dz / L, sz = dx / L;
    const x = a.x + sx * lateral, z = a.z + sz * lateral;
    const th = Math.atan2(dx, dz);
    b.box('pole', x, y + 4.5, z, 0.18, 9, 0.18);
    b.box('lampHead', x, y + 9.1, z, 1.3, 0.22, 0.5, th);
    lamps.push([x, y, z]);
  }
  return lamps;
}

function plotPolygon() {
  const edgeL = [site.boundary.apex, site.boundary.frontLeft];
  const straight = site.boundary.frontStraight;
  const arc = sampleArc(0, 28);
  return [edgeL[0], ...straight, ...arc.slice(1), site.boundary.backRight];
}

function buildMasjid(b, foliage, r) {
  const { x: mx, z: mz, size } = site.masjid;
  const s = size;
  b.box('paver', mx, 0.08, mz, s + 8, 0.16, s + 8);
  b.box('mosque', mx, 3.2, mz, s * 0.86, 6.4, s * 0.86);
  b.box('slabWhite', mx, 6.6, mz, s * 0.96, 0.7, s * 0.96);
  b.box('gold', mx, 7.15, mz, s * 0.55, 0.28, s * 0.55);
  b.geom('mosque', new THREE.CylinderGeometry(s * 0.28, s * 0.28, 1.6, 28), new THREE.Matrix4().makeTranslation(mx, 8.1, mz));
  b.geom('mosque', new THREE.SphereGeometry(s * 0.30, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(mx, 8.9, mz));
  b.geom('gold', new THREE.ConeGeometry(0.28, 2.2, 8), new THREE.Matrix4().makeTranslation(mx, 15.2, mz));
  // porch toward the road (left, -X) and arched niches
  b.box('mosque', mx - s * 0.46, 2.2, mz, 1.4, 4.2, s * 0.42);
  for (let i = 0; i < 3; i++) {
    const o = (i - 1) * s * 0.22;
    b.box('slab', mx - s * 0.5, 2.4, mz + o, 0.15, 3.2, 1.6);
    b.box('slab', mx + o, 2.4, mz + s * 0.46, 1.6, 3.2, 0.15);
  }
  // two minarets on a diagonal, matching the corner crop
  for (const [sx, sz] of [[-1, -1], [1, 1]]) {
    const px = mx + sx * s * 0.42, pz = mz + sz * s * 0.42;
    b.geom('mosque', new THREE.CylinderGeometry(0.85, 1.05, 22, 12), new THREE.Matrix4().makeTranslation(px, 11, pz));
    b.geom('mosque', new THREE.CylinderGeometry(1.45, 1.45, 0.7, 12), new THREE.Matrix4().makeTranslation(px, 18.2, pz));
    b.geom('mosque', new THREE.SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(px, 22.4, pz));
    b.geom('gold', new THREE.ConeGeometry(0.16, 1.8, 6), new THREE.Matrix4().makeTranslation(px, 24.2, pz));
  }
  for (let i = 0; i < 6; i++) foliage.palm(mx + (r() - 0.5) * (s + 4), 0.2, mz + (r() < 0.5 ? -1 : 1) * (s * 0.55), 7 + r() * 2, r());
}

function buildGate(b) {
  const g = site.gate;
  const roadZ = g.z + site.roads.serviceOffset;
  // apron from the slip road back to the canopy, which is already in the GLB
  const len = roadZ - (g.z - 6);
  const cz = (roadZ + g.z - 6) / 2;
  b.box('paver', g.x, 0.07, cz, g.apronW, 0.12, len);
  b.box('curb', g.x - g.apronW / 2, 0.16, cz, 0.35, 0.22, len);
  b.box('curb', g.x + g.apronW / 2, 0.16, cz, 0.35, 0.22, len);
  // yellow hatch on the drop-off, just inside the slip road
  for (let i = -5; i <= 5; i++) {
    b.box('laneYellow', g.x + i * 1.15, 0.1, roadZ - 3.2, 0.28, 0.02, 7.5, 0.7);
  }
  // in / out boom barriers
  for (const sd of [-1, 1]) {
    const x = g.x + sd * 3.2;
    b.box('laneWhite', x, 0.95, g.z + 1.2, 3.4, 0.12, 0.18, 0.15);
    b.box('barrierRed', x, 0.95, g.z + 1.2, 0.7, 0.14, 0.2, 0.15);
    b.box('concrete', x + sd * 1.8, 0.55, g.z + 1.2, 0.35, 1.1, 0.35);
  }
  zebra(b, g.x, roadZ + 1.5, 1, 0, g.apronW * 0.7, 6);
}

function buildExit(b, backA, backB) {
  const t = site.exit.along;
  const x = backA[0] + (backB[0] - backA[0]) * t;
  const z = backA[1] + (backB[1] - backA[1]) * t;
  const ang = Math.atan2(backB[1] - backA[1], backB[0] - backA[0]);
  const nx = Math.sin(ang), nz = -Math.cos(ang);
  // inward is toward the arc centre
  const c = site.boundary.arc.c;
  const sign = (c[0] - x) * nx + (c[1] - z) * nz > 0 ? 1 : -1;
  const ix = nx * sign, iz = nz * sign;
  const w = site.exit.apronW;
  const tx = Math.cos(ang), tz = Math.sin(ang);
  b.box('asphalt', x + ix * 7, 0.08, z + iz * 7, w, 0.1, 14, Math.atan2(ix, iz));
  for (let i = -3; i <= 3; i++) b.box('laneYellow', x + ix * 5 + tx * i * 1.3, 0.11, z + iz * 5 + tz * i * 1.3, 0.22, 0.02, 4.5, ang + 0.6);
  zebra(b, x, z, tx, tz, w * 0.8, 5);
}

function leftWall(b) {
  const a = site.boundary.apex, p = site.boundary.frontLeft;
  const dx = p[0] - a[0], dz = p[1] - a[1], L = Math.hypot(dx, dz);
  const n = Math.round(L / site.wall.postPitch);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a[0] + dx * t, z = a[1] + dz * t;
    b.box('slabWhite', x, site.wall.plinthH / 2, z, 0.38, site.wall.plinthH, 0.38);
    b.box('fin', x, site.wall.plinthH + site.wall.postH / 2, z, 0.22, site.wall.postH, 0.22);
    if (i < n) {
      const t2 = (i + 0.5) / n;
      b.box('slabWhite', a[0] + dx * t2, site.wall.plinthH + 0.7, a[1] + dz * t2, 0.08, 1.15, site.wall.postPitch * 0.82, Math.atan2(dx, dz));
    }
  }
}

function frontPlinth(b, line) {
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], c = line[i + 1];
    const dx = c.x - a.x, dz = c.z - a.z, L = Math.hypot(dx, dz);
    if (L < 0.2) continue;
    b.box('slabWhite', (a.x + c.x) / 2, site.wall.plinthH / 2, (a.z + c.z) / 2, site.wall.plinthW, site.wall.plinthH, L, Math.atan2(dx, dz));
  }
}

function filler(b, foliage, r, free) {
  const placed = [];
  const add = (x, z, w, d, h, rot) => {
    b.box(['ctxBuilding', 'ctxBuilding2', 'ctxBuilding3'][(r() * 3) | 0], x, h / 2, z, w, h, d, rot);
    b.box('ctxRoof', x, h + 0.15, z, w + 0.3, 0.3, d + 0.3, rot);
    placed.push([x, z]);
  };
  for (let gx = -640; gx <= 640; gx += 22) for (let gz = -620; gz <= 560; gz += 22) {
    const x = gx + (r() - 0.5) * 6, z = gz + (r() - 0.5) * 6;
    if (Math.hypot(x, z) > 700 || r() < 0.34) continue;
    const w = 10 + r() * 8, d = 10 + r() * 8;
    if (!free(x, z, Math.max(w, d) / 2)) continue;
    const h = 6 + (r() * 3 | 0) * 3.2 + (r() < 0.08 ? 10 : 0);
    add(x, z, w, d, h, (r() < 0.8 ? 0 : 0.08));
    if (r() < 0.7 && free(x + 11, z + 11, 3)) foliage.tree(x + 11, 0, z + 11, 5 + r() * 4, r(), 0.35);
  }
  for (const [x, z, w, d, h] of [[150, 160, 28, 24, 32], [196, 130, 26, 26, 30], [168, -40, 22, 36, 22], [230, 40, 40, 24, 14]]) {
    if (!free(x, z, Math.max(w, d) / 2)) continue;
    b.box('ctxBuilding', x, h / 2, z, w, h, d, 0.15);
    b.box('ctxRoof', x, h + 0.3, z, w + 0.4, 0.5, d + 0.4, 0.15);
  }
  for (let i = 0; i < 900; i++) {
    const x = (r() - 0.5) * 1200, z = (r() - 0.5) * 1100;
    if (!free(x, z, 3)) continue;
    foliage.tree(x, 0, z, 5 + r() * 5, r(), 0.45);
  }
}

/** Build the render-matched site. Returns road records for the traffic sim. */
export function buildRealContext(scene, M, foliage) {
  const b = new Batch();
  const r = rng(7);
  const R = site.roads;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2600, 2400).rotateX(-Math.PI / 2), M.ground);
  ground.receiveShadow = true;
  ground.name = 'ground';
  scene.add(ground);

  const net = buildRoadNetwork(b, foliage, r);
  const boundary = frontLine(0);
  frontPlinth(b, boundary);
  leftWall(b);
  buildMasjid(b, foliage, r);
  buildGate(b);
  const b1 = net.byId.B1_back_road;
  if (b1) buildExit(b, [b1[0].x, b1[0].z], [b1[b1.length - 1].x, b1[b1.length - 1].z]);
  if (net.byId.C1_collector) zebra(b, site.gate.x, site.gate.z + 8, 1, 0, 12, 6);
  if (net.byId.R1_left_road) zebra(b, site.masjid.x - 16, site.masjid.z, 0, 1, 12, 6);

  const poly = plotPolygon();
  const free = (x, z, rad) => {
    if (inside(x, z, poly)) return false;
    if (Math.hypot(x - site.masjid.x, z - site.masjid.z) < site.masjid.size * 0.75 + rad) return false;
    for (const [pts, w] of net.corridors) if (distToPolyline(x, z, pts) < w + rad) return false;
    return true;
  };
  filler(b, foliage, r, free);
  const lampPts = [];
  if (net.byId.C1_collector) lampPts.push(...lampsAlong(b, net.byId.C1_collector, 9, 4));
  if (net.byId.B1_back_road) lampsAlong(b, net.byId.B1_back_road, 9, 3);
  if (net.byId.R1_left_road) lampsAlong(b, net.byId.R1_left_road, 9, 4);
  if (lampPts.length && !M.lampPool) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,200,140,1)'); g.addColorStop(1, 'rgba(255,160,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    M.lampPool = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: '#ffffff', fog: true });
  }

  const group = new THREE.Group();
  group.name = 'Site';
  b.build(group, M, { cast: false, receive: true });
  scene.add(group);

  const traffic = {};
  for (const [k, v] of Object.entries(net.traffic)) if (v) traffic[k] = v;
  return traffic;
}
