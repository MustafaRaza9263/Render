import * as THREE from 'three';
import { Batch, rng } from './batch.js';
import { T, BRIDGES, Y_BRIDGE } from './layout.js';

const W = 7.6, H = 4.9, RISE = 2.5, BAY = 3.0;

export function buildBridges(scene, M, foliage, people) {
  const b = new Batch();
  const r = rng(99);
  const spans = [];
  for (const [na, nb] of BRIDGES) {
    const A = T[na], Bt = T[nb];
    const ax0 = A.x - A.w / 2, ax1 = A.x + A.w / 2, az0 = A.z - A.d / 2, az1 = A.z + A.d / 2;
    const bx0 = Bt.x - Bt.w / 2, bx1 = Bt.x + Bt.w / 2, bz0 = Bt.z - Bt.d / 2, bz1 = Bt.z + Bt.d / 2;
    let p0, p1;
    const xgap = bx0 >= ax1 || ax0 >= bx1;
    if (xgap) {
      const zc = (Math.max(az0, bz0) + Math.min(az1, bz1)) / 2;
      if (bx0 >= ax1) { p0 = new THREE.Vector2(ax1 - 1.7, zc); p1 = new THREE.Vector2(bx0 + 1.7, zc); }
      else { p0 = new THREE.Vector2(ax0 + 1.7, zc); p1 = new THREE.Vector2(bx1 - 1.7, zc); }
    } else {
      const xc = (Math.max(ax0, bx0) + Math.min(ax1, bx1)) / 2;
      if (bz0 >= az1) { p0 = new THREE.Vector2(xc, az1 - 1.7); p1 = new THREE.Vector2(xc, bz0 + 1.7); }
      else { p0 = new THREE.Vector2(xc, az0 + 1.7); p1 = new THREE.Vector2(xc, bz1 - 1.7); }
    }
    spans.push({ p0, p1, name: na + '–' + nb });
  }
  for (const s of spans) {
    const dx = s.p1.x - s.p0.x, dz = s.p1.y - s.p0.y;
    const L = Math.hypot(dx, dz);
    const th = Math.atan2(-dz, dx);  // rotY so that local +x -> direction
    const cx = (s.p0.x + s.p1.x) / 2, cz = (s.p0.y + s.p1.y) / 2;
    const c = Math.cos(th), sn = Math.sin(th);
    const toW = (l, w) => [cx + c * l + sn * w, cz - sn * l + c * w];
    const lb = (key, l, y, w, sl, sy, sw, rx = 0) => { const [x, z] = toW(l, w); b.box(key, x, y, z, sl, sy, sw, th, rx); };
    const v3 = (l, y, w) => { const [x, z] = toW(l, w); return new THREE.Vector3(x, y, z); };
    const y0 = Y_BRIDGE + 0.42;
    // underside: heavy white slab + recessed soffit, LED edges
    lb('steel', 0, y0 - 0.6, 0, L, 1.2, W + 0.3);
    lb('soffitLed', 0, y0 - 1.25, 0, L - 0.4, 0.12, W - 1.4);
    // underside light coves (ref03: glowing bridge bellies)
    for (const sw of [-1, 1]) lb('led', 0, y0 - 1.24, sw * (W / 2 - 0.9), L - 0.6, 0.08, 0.16);
    lb('led', 0, y0 - 1.21, W / 2 + 0.16, L, 0.1, 0.06);
    lb('led', 0, y0 - 1.21, -W / 2 - 0.16, L, 0.1, 0.06);
    lb('led', 0, y0 - 1.3, 0, L - 1, 0.05, 0.3);
    lb('floorStone', 0, y0 + 0.05, 0, L, 0.1, W - 0.5);
    // truss chords
    for (const sw of [-1, 1]) {
      lb('steel', 0, y0 + 0.3, sw * (W / 2 - 0.2), L, 0.6, 0.45);
      lb('steel', 0, y0 + H, sw * (W / 2 - 0.2), L, 0.5, 0.45);
      lb('led', 0, y0 + H - 0.28, sw * (W / 2 - 0.45), L, 0.05, 0.05);
    }
    // verticals, diagonals, roof ribs
    const n = Math.max(2, Math.round(L / BAY));
    const bay = L / n;
    for (let i = 0; i <= n; i++) {
      const l = -L / 2 + i * bay;
      for (const sw of [-1, 1]) {
        lb('steel', l, y0 + H / 2, sw * (W / 2 - 0.2), 0.32, H, 0.42);
        if (i < n) {
          const a = v3(l + (i % 2 ? 0 : bay), y0 + 0.55, sw * (W / 2 - 0.2));
          const bb = v3(l + (i % 2 ? bay : 0), y0 + H - 0.2, sw * (W / 2 - 0.2));
          b.beam('steel', a, bb, 0.16, 0.24);
          // horizontal glazing transom
          lb('steel', l + bay / 2, y0 + 1.15, sw * (W / 2 - 0.15), bay, 0.08, 0.1);
        }
      }
      // pitched roof ribs
      const ridge = v3(l, y0 + H + RISE, 0);
      b.beam('steel', v3(l, y0 + H + 0.1, W / 2 - 0.2), ridge, 0.26, 0.3);
      b.beam('steel', v3(l, y0 + H + 0.1, -W / 2 + 0.2), ridge, 0.26, 0.3);
    }
    lb('steel', 0, y0 + H + RISE, 0, L, 0.35, 0.35);
    // purlins
    for (const sw of [-1, 1]) lb('steel', 0, y0 + H + RISE / 2 + 0.05, sw * (W / 4 - 0.1), L, 0.12, 0.12);
    // glass: sides + two roof slopes
    const ang = Math.atan2(RISE, W / 2 - 0.2), slen = Math.hypot(RISE, W / 2 - 0.2);
    for (const sw of [-1, 1]) {
      lb('bridgeGlass', 0, y0 + H / 2 + 0.3, sw * (W / 2 - 0.12), L, H - 0.6, 0.04);
      lb('bridgeGlass', 0, y0 + H + RISE / 2 + 0.1, sw * (W / 4 - 0.1), L, 0.04, slen, sw * ang);
    }
    // portals at both ends
    for (const se of [-1, 1]) {
      const l = se * (L / 2 - 0.3);
      lb('steel', l, y0 + H + 0.4, 0, 0.7, 0.8, W + 0.2);
      for (const sw of [-1, 1]) lb('steel', l, y0 + H / 2, sw * (W / 2 - 0.1), 0.7, H, 0.7);
    }
    // interior garden walkway: planters each side, palms, shrubs, benches
    for (const sw of [-1, 1]) {
      lb('planter', 0, y0 + 0.45, sw * (W / 2 - 1.05), L - 3, 0.7, 1.2);
      lb('soil', 0, y0 + 0.82, sw * (W / 2 - 1.05), L - 3.1, 0.05, 1.1);
      for (let l = -L / 2 + 2; l < L / 2 - 1.5; l += 1.1) {
        const p = v3(l + r() * 0.4, y0 + 1.05, sw * (W / 2 - 1.05 + (r() - 0.5) * 0.4));
        foliage.shrub(p.x, p.y, p.z, 0.35 + r() * 0.25, r());
      }
      for (let l = -L / 2 + 3; l < L / 2 - 2; l += 6.5) {
        const p = v3(l + r(), y0 + 0.85, sw * (W / 2 - 1.05));
        foliage.palm(p.x, p.y, p.z, 2.6 + r() * 0.8, r());
      }
    }
    // bench row and a curved accent seat
    for (let l = -L / 2 + 4; l < L / 2 - 3; l += 7) lb('deck', l, y0 + 0.35, 0.0, 2.2, 0.45, 0.6);
    // people
    const np = Math.max(2, Math.round(L / 6));
    for (let k = 0; k < np; k++) {
      const p = v3(-L / 2 + 2 + r() * (L - 4), y0 + 0.1, (r() - 0.5) * 2.2);
      people.push([p.x, p.y, p.z, r()]);
    }
    s.L = L; s.th = th; s.center = new THREE.Vector3(cx, y0, cz);
  }
  const g = new THREE.Group(); g.name = 'TheConnect';
  b.build(g, M);
  scene.add(g);
  return spans;
}

export function buildPeople(scene, M, list) {
  if (!list.length) return;
  const body = new THREE.CapsuleGeometry(0.21, 1.0, 3, 6).translate(0, 0.75, 0);
  const head = new THREE.SphereGeometry(0.13, 8, 6).translate(0, 1.6, 0);
  const { mergeGeometries } = THREE_BGU;
  const merged = mergeGeometries([body.toNonIndexed(), head.toNonIndexed()]);
  const im = new THREE.InstancedMesh(merged, M.person, list.length);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  const cols = ['#2c3e50', '#ecf0f1', '#c0392b', '#34495e', '#d4b483', '#7f8c8d', '#1d3557', '#e9c46a'];
  list.forEach(([x, y, z, v], i) => {
    const s = 0.9 + v * 0.2;
    m.makeScale(s, s, s).setPosition(x, y, z);
    im.setMatrixAt(i, m);
    im.setColorAt(i, c.set(cols[(v * cols.length) | 0]));
  });
  im.castShadow = true; im.name = 'people';
  scene.add(im);
}
import * as THREE_BGU from 'three/examples/jsm/utils/BufferGeometryUtils.js';
