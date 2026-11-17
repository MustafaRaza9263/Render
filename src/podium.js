import * as THREE from 'three';
import { Batch, rng } from './batch.js';
import { POD_LEVELS, POD_FH, Y_POD, TOWERS } from './layout.js';

// Front path (right side -> angled wing -> sweeping curve -> left end). Interior is to the left of travel.
const BACK_Z = -54;
function frontPath() {
  const pts = [];
  const seg = (a, b, step = 3) => { const n = Math.max(1, Math.round(a.distanceTo(b) / step)); for (let i = 0; i < n; i++) pts.push(a.clone().lerp(b, i / n)); };
  const A = new THREE.Vector2(98, BACK_Z + 12), Bp = new THREE.Vector2(86, 38), C = new THREE.Vector2(28, 64);  // angled right wing (ref01)
  seg(A, Bp, 4); seg(Bp, C, 3);
  const q = new THREE.QuadraticBezierCurve(C, new THREE.Vector2(-80, 72), new THREE.Vector2(-94, -8));
  const qp = q.getSpacedPoints(46); qp.forEach(p => pts.push(p));
  const E = new THREE.Vector2(-90, BACK_Z);
  const last = qp[qp.length - 1];
  for (let i = 1; i <= 6; i++) pts.push(last.clone().lerp(E, i / 6));
  return pts;
}
export const FRONT = frontPath();
export const ENTRANCE = new THREE.Vector2(28, 64);

/** offset path inward by d (positive = inward). returns {pts, nrm(outward)} */
export function offsetFront(d) {
  const P = FRONT, n = P.length, out = [], nrm = [];
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(n - 1, i + 1)];
    const t = b.clone().sub(a).normalize();
    const no = new THREE.Vector2(t.y, -t.x); // outward (right of travel)
    nrm.push(no);
    out.push(P[i].clone().addScaledVector(no, -d));
  }
  return { pts: out, nrm };
}
function polygon(d) {
  const { pts } = offsetFront(d);
  const poly = pts.slice();
  poly.push(new THREE.Vector2(98 - d, BACK_Z));
  return poly;
}
function extrudePoly(b, key, poly, y0, h) {
  const shape = new THREE.Shape(poly.map(p => new THREE.Vector2(p.x, -p.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 1 });
  const m = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  m.premultiply(new THREE.Matrix4().makeTranslation(0, y0, 0));
  // scale UVs to ~metres for tiling textures
  b.geom(key, g, m); g.dispose();
}
export const insetOf = (k) => (k <= 1 ? 0 : (k - 1) * 2.1);

export function buildPodium(scene, M, foliage) {
  const b = new Batch();
  const r = rng(77);
  for (let k = 0; k < POD_LEVELS; k++) {
    const d = insetOf(k), y0 = k * POD_FH;
    const slabH = 0.75;
    // facade glass band (recessed 1.1 m)
    extrudePoly(b, k === 0 ? 'retailGlass' : 'podGlass', polygon(d + (k === 0 ? 1.6 : 1.1)), y0, POD_FH - slabH);
    // white slab band
    extrudePoly(b, 'slabWhite', polygon(d), y0 + POD_FH - slabH, slabH);
    // fins / mullions along the curved front + parapet rails & planters
    const { pts, nrm } = offsetFront(d);
    let acc = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], c = pts[i + 1];
      const L = a.distanceTo(c); if (L < 0.01) continue;
      const mid = a.clone().add(c).multiplyScalar(0.5);
      const t = c.clone().sub(a).normalize();
      const th = Math.atan2(-t.y, t.x);
      const no = nrm[i].clone().add(nrm[i + 1]).normalize();
      acc += L;
      // vertical white fins every ~4.6 m (podium frame language of ref10)
      if (acc > 4.6) {
        acc = 0;
        const fp = a.clone().addScaledVector(no, -0.5);
        b.box('fin', fp.x, y0 + (POD_FH - slabH) / 2, fp.y, 0.45, POD_FH - slabH, 1.2, th);
      }
      // terrace edge: planter trough + glass balustrade on top of each slab (levels 1..4)
      if (k >= 0) {
        const pp = mid.clone().addScaledVector(no, -0.75);
        b.box('planter', pp.x, y0 + POD_FH + 0.35, pp.y, L + 0.05, 0.7, 0.9, th);
        const rp = mid.clone().addScaledVector(no, -1.45);
        b.box('rail', rp.x, y0 + POD_FH + 0.6, rp.y, L + 0.05, 1.1, 0.04, th);
        // lush planting and hanging greenery
        for (let s = 0; s < L; s += 0.9) {
          const q = a.clone().lerp(c, s / L).addScaledVector(no, -0.7);
          foliage.blob(q.x, y0 + POD_FH + 0.85, q.y, 0.55 + r() * 0.35, 0.45 + r() * 0.3, 0.5, r());
          if (r() < (k === POD_LEVELS - 1 ? 0.5 : 0.75)) {
            const hq = a.clone().lerp(c, s / L).addScaledVector(no, -0.1);
            const len = 1.0 + r() * 2.2;
            foliage.drape(hq.x, y0 + POD_FH - len * 0.45, hq.y, 0.3 + r() * 0.2, len, 0.25, r());
          }
        }
      }
      // ground floor canopy
      if (k === 0) {
        const cp = mid.clone().addScaledVector(no, 0.4);
        b.box('canopy', cp.x, 4.0, cp.y, L + 0.05, 0.25, 3.0, th);
      }
    }
  }
  // podium roof slab cap (landscaped deck)
  const topPoly = polygon(insetOf(POD_LEVELS - 1) + 1.6);
  extrudePoly(b, 'paver', topPoly, Y_POD, 0.25);
  extrudePoly(b, 'grass', polygon(insetOf(POD_LEVELS - 1) + 5.5), Y_POD + 0.25, 0.08);
  // paved promenades across the deck
  for (const [x, z, w, dd, rot] of [[0, 15, 60, 4, 0.0], [3, -6, 4, 50, 0], [-38, 4, 4, 40, 0.3], [36, 5, 4, 30, -0.2], [-20, -42, 90, 4, 0], [66, 0, 4, 60, 0]]) b.box('paver', x, Y_POD + 0.36, z, w, 0.06, dd, rot);
  // lawn / landscape islands between towers
  const lawns = [[-8, 5, 10, 10], [28, 6, 10, 10], [-44, -16, 14, 14], [-2, -9, 10, 7], [76, -26, 14, 20], [-70, -38, 20, 16], [34, -44, 20, 8], [74, 14, 8, 12]];
  for (const [x, z, w, dd] of lawns) {
    b.box('grass', x, Y_POD + 0.35, z, w, 0.22, dd);
    b.box('stone', x, Y_POD + 0.3, z, w + 0.8, 0.3, dd + 0.8);
    for (let i = 0; i < Math.round(w * dd / 40); i++) {
      const px = x + (r() - 0.5) * (w - 2), pz = z + (r() - 0.5) * (dd - 2);
      if (r() < 0.45) foliage.palm(px, Y_POD + 0.4, pz, 4 + r() * 3, r());
      else foliage.tree(px, Y_POD + 0.4, pz, 4 + r() * 3, r());
    }
    for (let i = 0; i < w; i++) foliage.blob(x + (r() - 0.5) * w, Y_POD + 0.7, z + (r() < 0.5 ? -1 : 1) * dd / 2, 0.7, 0.5, 0.7, r());
  }
  // courtyard water feature
  b.box('stone', 12, Y_POD + 0.35, 5, 12, 0.5, 5);
  b.box('water', 12, Y_POD + 0.58, 5, 11, 0.06, 4);
  // tower lobbies on the podium deck (double-height glazing + canopy)
  for (const t of TOWERS) {
    b.box('slabWhite', t.x, Y_POD + 0.1, t.z, t.w + 2, 0.2, t.d + 2);
  }
  // main entrance: portal + sign + plaza steps
  const E = ENTRANCE;
  const { pts, nrm } = offsetFront(0);
  let ei = 0, best = 1e9; pts.forEach((p, i) => { const dd = p.distanceTo(E); if (dd < best) { best = dd; ei = i; } });
  const en = nrm[ei].clone();
  const eth = Math.atan2(en.x, en.y); // rotY so local +z faces outward
  const ep = E.clone().addScaledVector(en, 0.8);
  const sign = { x: ep.x, z: ep.y, th: eth };
  // portal frame
  b.box('fin', ep.x, 13.3, ep.y, 17, 15.6, 1.0, eth);
  const sp = E.clone().addScaledVector(en, 1.35);
  b.box('gold', sp.x, 11.9, sp.y, 13.6, 13.6, 0.12, eth);
  b.geom('sign', new THREE.PlaneGeometry(13, 13), new THREE.Matrix4().makeRotationY(eth).premultiply(new THREE.Matrix4().makeTranslation(sp.x + en.x * 0.08, 11.9, sp.y + en.y * 0.08)));
  // entrance lobby glazing + canopy
  const lp = E.clone().addScaledVector(en, 1.2);
  b.box('retailGlass', lp.x, 2.4, lp.y, 12, 4.8, 0.3, eth);
  const cp = E.clone().addScaledVector(en, 4.5);
  b.box('canopy', cp.x, 5.2, cp.y, 16, 0.4, 7, eth);
  b.box('led', cp.x, 4.98, cp.y, 15, 0.05, 6.6, eth);
  for (const s of [-1, 1]) {
    const pp = cp.clone().add(new THREE.Vector2(Math.cos(eth) * s * 7, -Math.sin(eth) * s * 7)).addScaledVector(en, 2.5);
    b.box('fin', pp.x, 2.6, pp.y, 0.5, 5.2, 0.5, eth);
  }
  // plaza: paving band from facade to road
  const plaza = [];
  const outer = offsetFront(-15).pts, inner = offsetFront(0).pts;
  for (let i = 0; i < outer.length; i++) plaza.push(outer[i]);
  for (let i = inner.length - 1; i >= 0; i--) plaza.push(inner[i]);
  extrudePoly(b, 'paver', plaza, 0, 0.18);
  // kerb
  const kerb = offsetFront(-15);
  for (let i = 0; i < kerb.pts.length - 1; i++) {
    const a = kerb.pts[i], c = kerb.pts[i + 1], L = a.distanceTo(c); if (L < 0.01) continue;
    const t = c.clone().sub(a).normalize(), mid = a.clone().add(c).multiplyScalar(0.5);
    b.box('curb', mid.x, 0.2, mid.y, L + 0.05, 0.4, 0.5, Math.atan2(-t.y, t.x));
  }
  // entrance steps
  for (let s = 0; s < 4; s++) { const p = E.clone().addScaledVector(en, 8.5 + s * 0.6); b.box('stone', p.x, 0.18 + s * 0.0, p.y, 18 - s, 0.36 - s * 0.08, 0.6, eth); }
  // row of trees + planters along curved edge, bollards
  const tr = offsetFront(-10.5);
  let acc = 0;
  for (let i = 0; i < tr.pts.length - 1; i++) {
    const a = tr.pts[i], c = tr.pts[i + 1], L = a.distanceTo(c);
    acc += L;
    if (acc > 7 && a.distanceTo(E.clone().addScaledVector(en, 10.5)) > 11) {
      acc = 0;
      b.box('stone', a.x, 0.35, a.y, 2.2, 0.5, 2.2);
      foliage.tree(a.x, 0.45, a.y, 6.5 + r() * 2.5, r());
    }
  }
  const gx = new THREE.Group(); gx.name = 'Podium';
  b.build(gx, M);
  scene.add(gx);
  return { sign };
}
