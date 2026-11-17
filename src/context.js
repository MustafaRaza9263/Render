import * as THREE from 'three';
import { Batch, rng } from './batch.js';

const V = (x, z) => new THREE.Vector3(x, 0, z);
export const ROADS = {};

function ribbon(b, key, pts, width, yf, { closed = false, vScale = 24 } = {}) {
  const n = pts.length; const pos = [], nor = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], c = pts[(i + 1) % n];
    const p = pts[i];
    const t = (closed ? c.clone().sub(a) : pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)])).setY(0).normalize();
    const s = new THREE.Vector3(-t.z, 0, t.x);
    if (i > 0) acc += p.distanceTo(pts[i - 1]);
    const y = yf(i / (n - 1), p);
    pos.push(p.x + s.x * width / 2, y, p.z + s.z * width / 2, p.x - s.x * width / 2, y, p.z - s.z * width / 2);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, acc / vScale, 1, acc / vScale);
    if (i < n - 1 || closed) { const j = (i + 1) % n; idx.push(i * 2, j * 2, i * 2 + 1, i * 2 + 1, j * 2, j * 2 + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  // fix winding so it faces up
  const p0 = new THREE.Vector3().fromArray(pos, 0), p1 = new THREE.Vector3().fromArray(pos, 3), p2 = new THREE.Vector3().fromArray(pos, 6);
  const nn = new THREE.Vector3().subVectors(p2, p0).cross(new THREE.Vector3().subVectors(p1, p0));
  if (nn.y < 0) { for (let k = 0; k < idx.length; k += 3) { const tmp = idx[k + 1]; idx[k + 1] = idx[k + 2]; idx[k + 2] = tmp; } g.setIndex(idx); }
  b.geom(key, g, new THREE.Matrix4());
  return g;
}

function elevated(b, pts, width, yf, M, pillarEvery = 32, r) {
  ribbon(b, 'road', pts, width, (t, p) => yf(t) + 0.05);
  // deck box segments + parapets + pillars
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], c = pts[i + 1];
    const ya = yf(i / (pts.length - 1)), yc = yf((i + 1) / (pts.length - 1));
    const L = a.distanceTo(c); const mid = a.clone().add(c).multiplyScalar(0.5);
    const th = Math.atan2(-(c.z - a.z), c.x - a.x);
    const pitch = Math.atan2(yc - ya, L);
    const ym = (ya + yc) / 2;
    b.box('concrete', mid.x, ym - 0.8, mid.z, L + 0.3, 1.6, width - 1, th, 0, pitch);
    const s = new THREE.Vector3(-(c.z - a.z), 0, c.x - a.x).normalize();
    for (const sd of [-1, 1]) b.box('curb', mid.x + s.x * sd * (width / 2 - 0.2), ym + 0.5, mid.z + s.z * sd * (width / 2 - 0.2), L + 0.3, 1.0, 0.35, th, 0, pitch);
    acc += L;
    if (acc > pillarEvery && ym > 3) {
      acc = 0;
      b.box('concrete', mid.x, (ym - 1.6) / 2, mid.z, 2.2, ym - 1.6, 2.2, th);
      b.box('concrete', mid.x, ym - 2.0, mid.z, 2.6, 1.2, width * 0.75, th);
    }
  }
}

function distToPolyline(x, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z, l2 = abx * abx + abz * abz || 1;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / l2; t = Math.max(0, Math.min(1, t));
    const dx = a.x + abx * t - x, dz = a.z + abz * t - z;
    best = Math.min(best, dx * dx + dz * dz);
  }
  return Math.sqrt(best);
}

export function buildContext(scene, M, foliage) {
  const b = new Batch();
  const r = rng(1234);
  // --- road network ---
  const mainCurve = new THREE.CatmullRomCurve3([V(520, -20), V(330, 12), V(190, 46), V(110, 74), V(40, 94), V(-40, 98), V(-100, 66), V(-136, 6), V(-156, -60), V(-196, -98), V(-300, -128), V(-520, -150)]);
  const mainPts = mainCurve.getSpacedPoints(260);
  ribbon(b, 'road', mainPts, 20, () => 0.06);
  ribbon(b, 'curb', mainPts, 21.2, () => 0.05);
  ribbon(b, 'sidewalk', mainPts, 31, () => 0.04);
  // raised landscaped median with palms (ref02)
  ribbon(b, 'curb', mainPts, 2.8, () => 0.16);
  ribbon(b, 'median', mainPts, 2.3, () => 0.2);
  for (let i = 3; i < mainPts.length - 3; i += 3) { const p = mainPts[i]; if (Math.hypot(p.x, p.z) < 420 && Math.hypot(p.x + 20, p.z - 104) > 16 /* keep street-view sightline clear */) foliage.palm(p.x, 0.2, p.z, 6 + r() * 2, r()); }
  ROADS.main = { curve: mainCurve, width: 20, y: () => 0.25, lanes: [-7.5, -2.5, 2.5, 7.5] };

  // expressway on the near bank of the canal (elevated)
  const expCurve = new THREE.CatmullRomCurve3([V(-700, -132), V(-300, -118), V(0, -110), V(300, -104), V(700, -96)]);
  const expPts = expCurve.getSpacedPoints(220);
  elevated(b, expPts, 22, () => 9, M, 34, r);
  ROADS.exp = { curve: expCurve, width: 22, y: () => 9.3, lanes: [-8, -3, 3, 8] };

  // canal / riverbed behind the site
  const canalPts = new THREE.CatmullRomCurve3([V(-700, -168), V(-300, -156), V(0, -150), V(300, -144), V(700, -136)]).getSpacedPoints(200);
  ribbon(b, 'canalBed', canalPts, 34, () => -5.8);
  ribbon(b, 'canalWater', canalPts, 9, () => -5.6);
  for (const sd of [-1, 1]) {
    // sloped concrete banks: built from thin tilted ribbons
    const off = canalPts.map(p => p.clone());
    for (let i = 0; i < canalPts.length - 1; i++) {
      const a = canalPts[i], c = canalPts[i + 1];
      const L = a.distanceTo(c), mid = a.clone().add(c).multiplyScalar(0.5);
      const t = c.clone().sub(a).normalize(); const s = new THREE.Vector3(-t.z, 0, t.x);
      const th = Math.atan2(-t.z, t.x);
      const p = mid.clone().addScaledVector(s, sd * 20);
      b.box('concrete', p.x, -2.9, p.z, L + 0.2, 0.4, 8.4, th, -sd * Math.atan2(6, 6));
      const q = mid.clone().addScaledVector(s, sd * 25);
      b.box('curb', q.x, 0.4, q.z, L + 0.2, 0.8, 0.6, th);
    }
  }
  // the canal bed sits below ground: cut ground with a dark strip is not possible -> raise ground aside with banks
  // ground: two big sheets that stop at the canal banks
  for (const sd of [1, -1]) {
    const edge = [];
    for (let i = 0; i < canalPts.length - 1; i++) {
      const a = canalPts[i], c = canalPts[i + 1]; const t = c.clone().sub(a).normalize();
      edge.push(a.clone().add(new THREE.Vector3(-t.z, 0, t.x).multiplyScalar(sd * 23.5)));
    }
    const pts = [new THREE.Vector2(-2200, edge[0].z), ...edge.map(p => new THREE.Vector2(p.x, p.z)), new THREE.Vector2(2200, edge[edge.length - 1].z), new THREE.Vector2(2200, sd * 2200), new THREE.Vector2(-2200, sd * 2200)];
    const shape = new THREE.Shape(pts.map(p => new THREE.Vector2(p.x, -p.y)));
    const sg = new THREE.ShapeGeometry(shape); sg.rotateX(-Math.PI / 2);
    const gm = new THREE.Mesh(sg, M.ground); gm.receiveShadow = true; gm.name = 'ground'; scene.add(gm);
  }
  for (let i = 0; i < 160; i++) { const p = canalPts[(r() * canalPts.length) | 0]; foliage.blob(p.x + (r() - 0.5) * 6, -5.3, p.z + (r() - 0.5) * 26, 1.2, 0.6, 1.2, r() * 0.5 + 0.3); }
  // service road beyond canal
  const backPts = new THREE.CatmullRomCurve3([V(-700, -200), V(0, -184), V(700, -170)]).getSpacedPoints(120);
  ribbon(b, 'road', backPts, 12, () => 0.06);
  // right side road
  const sideCurve = new THREE.CatmullRomCurve3([V(126, 70), V(122, 0), V(120, -80), V(118, -104)]);
  const sidePts = sideCurve.getSpacedPoints(60);
  ribbon(b, 'road', sidePts, 14, () => 0.07);
  ribbon(b, 'sidewalk', sidePts, 20, () => 0.045);
  ROADS.side = { curve: sideCurve, width: 14, y: () => 0.25, lanes: [-3, 3] };

  // cloverleaf interchange (front-left) with an elevated flyover
  const CL = new THREE.Vector3(-150, 0, 230);
  const flyCurve = new THREE.CatmullRomCurve3([V(-520, 250), V(-300, 238), V(-150, 230), V(0, 222), V(80, 200), V(150, 140), V(190, 50)]);
  const flyPts = flyCurve.getSpacedPoints(160);
  const flyY = (t) => { const h = 9; if (t < 0.15) return THREE.MathUtils.smoothstep(t, 0, 0.15) * h; if (t > 0.78) return (1 - THREE.MathUtils.smoothstep(t, 0.78, 1)) * h; return h; };
  elevated(b, flyPts, 16, flyY, M, 30, r);
  ROADS.fly = { curve: flyCurve, width: 16, y: (t) => flyY(t) + 0.3, lanes: [-5, -1.7, 1.7, 5] };
  const nsCurve = new THREE.CatmullRomCurve3([V(-150, 98), V(-152, 230), V(-150, 420), V(-146, 700)]);
  const nsPts = nsCurve.getSpacedPoints(120);
  ribbon(b, 'road', nsPts, 16, () => 0.08);
  ribbon(b, 'sidewalk', nsPts, 24, () => 0.045);
  ROADS.ns = { curve: nsCurve, width: 16, y: () => 0.3, lanes: [-5, -2, 2, 5] };
  const loops = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const c = CL.clone().add(V(sx * 42, sz * 40));
    const ring = []; for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; ring.push(V(c.x + Math.cos(a) * 30, c.z + Math.sin(a) * 30)); }
    ribbon(b, 'road', ring, 9, () => 0.1, { closed: true });
    const disk = new THREE.CircleGeometry(25.2, 64); disk.rotateX(-Math.PI / 2);
    const uvd = disk.attributes.uv; // circle uv already 0..1
    b.geom('stripes', disk, new THREE.Matrix4().makeTranslation(c.x, 0.12, c.z));
    loops.push(c);
  }
  // central striped lawn in each quadrant around the junction
  for (const [sx, sz] of [[1, 1], [-1, -1]]) {
    const disk = new THREE.CircleGeometry(16, 48); disk.rotateX(-Math.PI / 2);
    b.geom('stripes', disk, new THREE.Matrix4().makeTranslation(CL.x + sx * 95, 0.1, CL.z + sz * 10));
  }

  // white-domed mosque at the left corner
  {
    const mx = -114, mz = -34;
    b.box('mosque', mx, 3.5, mz, 18, 7, 18);
    b.box('mosque', mx, 7.4, mz, 19, 0.8, 19);
    for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) { // arched niches as dark insets
      const along = -6 + i * 4;
      b.box('slab', mx + along, 2.8, mz + sd * 9.02, 2.2, 3.6, 0.1);
      b.box('slab', mx + sd * 9.02, 2.8, mz + along, 0.1, 3.6, 2.2);
    }
    b.geom('mosque', new THREE.CylinderGeometry(5.4, 5.4, 2.6, 24), new THREE.Matrix4().makeTranslation(mx, 9.1, mz));
    b.geom('mosque', new THREE.SphereGeometry(5.8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(mx, 10.4, mz));
    b.geom('gold', new THREE.ConeGeometry(0.35, 2.4, 8), new THREE.Matrix4().makeTranslation(mx, 17.3, mz));
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const px = mx + sx * 10.5, pz = mz + sz * 10.5;
      b.geom('mosque', new THREE.CylinderGeometry(1.0, 1.25, 24, 12), new THREE.Matrix4().makeTranslation(px, 12, pz));
      b.geom('mosque', new THREE.CylinderGeometry(1.7, 1.7, 0.8, 12), new THREE.Matrix4().makeTranslation(px, 19, pz));
      b.geom('mosque', new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(px, 24, pz));
      b.geom('gold', new THREE.ConeGeometry(0.15, 1.5, 6), new THREE.Matrix4().makeTranslation(px, 25.6, pz));
    }
    b.box('paver', mx, 0.1, mz, 30, 0.2, 30);
    for (let i = 0; i < 8; i++) foliage.palm(mx - 14 + r() * 28, 0.2, mz + (r() < 0.5 ? -1 : 1) * 13.5, 6 + r() * 3, r());
  }

  // --- surrounding blocks (rejection-sampled) ---
  const polylines = [mainPts, expPts, backPts, sidePts, nsPts, flyPts];
  const widths = [11, 13, 7, 8, 9, 9];
  const free = (x, z, rad) => {
    if (x > -125 && x < 100 && z > -70 && z < 92) return false;           // the site
    if (z < -96 && z > -190) return false;                                 // canal corridor
    if (Math.hypot(x - CL.x, z - CL.z) < 118) return false;                // interchange
    if (Math.hypot(x + 114, z + 34) < 24) return false;                    // mosque
    for (let i = 0; i < polylines.length; i++) if (distToPolyline(x, z, polylines[i]) < widths[i] + rad + 3) return false;
    return true;
  };
  const placed = [];
  const add = (x, z, w, d, h, rot) => {
    b.box(['ctxBuilding', 'ctxBuilding2', 'ctxBuilding3'][(r() * 3) | 0], x, h / 2, z, w, h, d, rot);
    b.box('ctxRoof', x, h + 0.15, z, w + 0.3, 0.3, d + 0.3, rot);
    if (r() < 0.5) b.box('ctxRoof', x + (r() - 0.5) * w * 0.4, h + 1.2, z + (r() - 0.5) * d * 0.4, w * 0.3, 2.2, d * 0.3, rot);
    placed.push([x, z]);
  };
  // dense low-rise neighbourhood (grid with jitter)
  for (let gx = -640; gx <= 640; gx += 22) for (let gz = -620; gz <= 560; gz += 22) {
    const x = gx + (r() - 0.5) * 6, z = gz + (r() - 0.5) * 6;
    const dist = Math.hypot(x, z);
    if (dist > 700) continue;
    if (r() < 0.34) continue;
    const w = 10 + r() * 8, d = 10 + r() * 8;
    if (!free(x, z, Math.max(w, d) / 2)) continue;
    const h = 6 + (r() * 3 | 0) * 3.2 + (r() < 0.08 ? 10 : 0);
    add(x, z, w, d, h, (r() < 0.8 ? 0 : 0.2) + 0.04);
    if (r() < 0.75 && free(x + 11, z + 11, 3)) foliage.tree(x + 11, 0, z + 11, 5 + r() * 4, r(), 0.3);
  }
  // mid-rise apartment blocks across the road (front-right) like the refs
  for (const [x, z, w, d, h] of [[150, 150, 30, 26, 34], [192, 120, 28, 28, 34], [232, 92, 28, 26, 34], [168, -30, 22, 40, 24], [205, -60, 22, 34, 28]]) {
    b.box('ctxBuilding', x, h / 2, z, w, h, d, 0.4);
    b.box('ctxRoof', x, h + 0.3, z, w + 0.6, 0.6, d + 0.6, 0.4);
    b.box('mech', x, h + 2, z, w * 0.3, 3, d * 0.25, 0.4);
  }
  // warehouse with solar roof (back-right)
  b.box('concrete', 210, 6, -40 - 20, 60, 12, 40, 0.06);
  b.box('warehouseRoof', 210, 12.2, -60, 60.5, 0.4, 40.5, 0.06);
  // scattered street trees
  // small neighbourhood parks / green plots
  for (let i = 0; i < 70; i++) {
    const x = (r() - 0.5) * 1100, z = (r() - 0.5) * 1000, w = 14 + r() * 26, d = 14 + r() * 22;
    if (!free(x, z, Math.max(w, d) / 2) || placed.some(([px, pz]) => Math.abs(px - x) < w / 2 + 9 && Math.abs(pz - z) < d / 2 + 9)) continue;
    b.box('median', x, 0.05, z, w, 0.1, d);
    for (let k = 0; k < w * d / 60; k++) foliage.tree(x + (r() - 0.5) * (w - 3), 0, z + (r() - 0.5) * (d - 3), 5 + r() * 5, r(), 0.15);
  }
  for (let i = 0; i < 1700; i++) {
    const x = (r() - 0.5) * 1200, z = (r() - 0.5) * 1100;
    if (!free(x, z, 3)) continue;
    foliage.tree(x, 0, z, 5 + r() * 5, r(), 0.4);
  }
  // trees along main road verge (outer side) and street lamps
  const lamps = [];
  for (let i = 0; i < mainPts.length - 1; i += 2) {
    const a = mainPts[i], c = mainPts[i + 1]; const t = c.clone().sub(a).normalize(); const s = new THREE.Vector3(-t.z, 0, t.x);
    for (const sd of [-1, 1]) {
      const p = a.clone().addScaledVector(s, sd * 12.5);
      if (i % 6 === 0) lamps.push([p.x, 0, p.z, Math.atan2(-t.z, t.x), sd]);
    }
    if (i % 4 === 0) { const p = a.clone().addScaledVector(s, 17); if (free(p.x, p.z, 1) || true) foliage.tree(p.x, 0, p.z, 6 + r() * 3, r(), 0.2); }
  }
  for (let i = 0; i < expPts.length; i += 4) { const p = expPts[i]; lamps.push([p.x, 9.2, p.z, 0, 0]); }
  for (const [x, y, z, th, sd] of lamps) {
    b.box('pole', x, y + 4.5, z, 0.22, 9, 0.22);
    b.box('lampHead', x, y + 9, z, 1.4, 0.25, 0.55, th);
  }
  // night light pools under street lamps (additive decals)
  {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,200,140,1)'); g.addColorStop(0.35, 'rgba(255,170,100,0.3)'); g.addColorStop(1, 'rgba(255,160,90,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    M.lampPool = new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: '#ffffff', fog: true });
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    const im = new THREE.InstancedMesh(pg, M.lampPool, lamps.length);
    const m = new THREE.Matrix4();
    lamps.forEach(([x0, y, z], i) => { m.makeScale(11, 1, 11).setPosition(x0, y + 0.3, z); im.setMatrixAt(i, m); });
    im.renderOrder = 2; im.name = 'lampPools';
    scene.add(im);
  }
  const gx = new THREE.Group(); gx.name = 'Context';
  b.build(gx, M, { cast: false });
  // allow building shells near the site to cast
  gx.children.forEach(m => { if (['ctxBuilding', 'ctxBuilding2', 'ctxBuilding3', 'concrete', 'mosque'].includes(m.name)) m.castShadow = true; });
  scene.add(gx);
  return { lamps };
}

// ---------------- traffic ----------------
export class Traffic {
  constructor(scene, M) {
    const body = new THREE.BoxGeometry(4.4, 0.75, 1.85).translate(0, 0.65, 0).toNonIndexed();
    const cabin = new THREE.BoxGeometry(2.3, 0.62, 1.6).translate(-0.25, 1.3, 0).toNonIndexed();
    const geo = mergeG([body, cabin]);
    const lf = new THREE.BoxGeometry(0.08, 0.18, 0.5);
    const parts = [], cols = [];
    for (const [x, z, col] of [[2.22, 0.6, [1, 0.95, 0.85]], [2.22, -0.6, [1, 0.95, 0.85]], [-2.22, 0.6, [1, 0.1, 0.05]], [-2.22, -0.6, [1, 0.1, 0.05]]]) {
      const g = lf.clone().translate(x, 0.8, z).toNonIndexed(); parts.push(g);
      for (let i = 0; i < g.attributes.position.count; i++) cols.push(...col);
    }
    const lg = mergeG(parts); lg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.cars = [];
    const r = rng(55);
    const palette = ['#f4f4f4', '#d0d3d6', '#1d1f22', '#8a1b1b', '#2b4d7a', '#a8a9ad', '#ffffff', '#c9b18a', '#d9d9d9', '#3a3a3a'];
    for (const k of ['main', 'exp', 'fly', 'side', 'ns']) {
      const R = ROADS[k]; if (!R) continue;
      const n = { main: 70, exp: 70, fly: 34, side: 12, ns: 20 }[k];
      for (let i = 0; i < n; i++) {
        const lane = R.lanes[(r() * R.lanes.length) | 0];
        this.cars.push({ R, lane, u: r(), v: (lane > 0 ? 1 : -1) * (0.00012 + r() * 0.00008) * (900 / R.curve.getLength()), color: palette[(r() * palette.length) | 0], big: r() < 0.08 });
      }
    }
    this.body = new THREE.InstancedMesh(geo, M.carBody, this.cars.length);
    this.lights = new THREE.InstancedMesh(lg, M.carLights, this.cars.length);
    this.body.castShadow = true;
    const c = new THREE.Color();
    this.cars.forEach((car, i) => this.body.setColorAt(i, c.set(car.color)));
    this.body.frustumCulled = false; this.lights.frustumCulled = false;
    scene.add(this.body, this.lights);
    this._m = new THREE.Matrix4(); this._p = new THREE.Vector3(); this._t = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1);
    this.update(0);
  }
  update(dt) {
    const up = new THREE.Vector3(0, 1, 0);
    this.cars.forEach((car, i) => {
      car.u = (car.u + car.v * dt * 60 + 1) % 1;
      const R = car.R;
      R.curve.getPointAt(car.u, this._p); R.curve.getTangentAt(car.u, this._t);
      const s = new THREE.Vector3(-this._t.z, 0, this._t.x).normalize();
      this._p.addScaledVector(s, car.lane); this._p.y = R.y(car.u);
      const ang = Math.atan2(-this._t.z, this._t.x) + (car.v < 0 ? Math.PI : 0);
      this._q.setFromAxisAngle(up, ang);
      this._s.set(car.big ? 2.2 : 1, car.big ? 1.9 : 1, car.big ? 1.3 : 1);
      this._m.compose(this._p, this._q, this._s);
      this.body.setMatrixAt(i, this._m); this.lights.setMatrixAt(i, this._m);
    });
    this.body.instanceMatrix.needsUpdate = true; this.lights.instanceMatrix.needsUpdate = true;
  }
}
import { mergeGeometries as mergeG } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
