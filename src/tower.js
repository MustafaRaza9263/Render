import * as THREE from 'three';
import { Batch, rng } from './batch.js';
import { FH, TOWER_FLOORS, Y_POD, Y_TOP, BRIDGE_I, GREEN_I } from './layout.js';

const B = 1.75;        // balcony depth (glass line inset from slab edge)
const SLAB = 0.42;     // slab band height
const FIN_OUT = 0.5;   // fin projection beyond slab edge
const FIN_W = 0.28;

// faces: theta, normal = (sin, 0, cos), tangent = (cos, 0, -sin)
function faces(t) {
  const hx = t.w / 2, hz = t.d / 2;
  return [
    { th: 0, half: hx, e: hz },
    { th: Math.PI / 2, half: hz, e: hx },
    { th: Math.PI, half: hx, e: hz },
    { th: -Math.PI / 2, half: hz, e: hx },
  ];
}
function P(f, u, d) { // local face coords -> tower-local xz
  const s = Math.sin(f.th), c = Math.cos(f.th);
  return [c * u + s * (f.e + d), -s * u + c * (f.e + d)];
}
function fbox(b, key, f, u, y, d, su, sy, sd) {
  const [x, z] = P(f, u, d);
  b.box(key, x, y, z, su, sy, sd, f.th);
}

/** bay pattern per face, symmetric */
function pattern(n, r) {
  const half = Math.ceil(n / 2), arr = [];
  const types = ['B', 'B', 'S', 'B', 'L', 'S', 'B'];
  for (let i = 0; i < half; i++) arr.push(types[(r() * types.length) | 0]);
  arr[0] = 'S';                        // solid bay next to corners frames the wrap-around balcony
  if (n % 2 === 1) arr[half - 1] = 'C'; // dark central spine
  else { arr[half - 1] = 'C'; }
  const out = arr.slice();
  for (let i = (n % 2 ? half - 2 : half - 1); i >= 0; i--) out.push(arr[i]);
  return out.slice(0, n);
}

function finsOnly(b, t, h, y0, r, key = 'fin') {
  for (const f of faces(t)) {
    const n = Math.max(3, Math.round((2 * f.half - 6) / 3.4));
    const bw = (2 * f.half - 6) / n;
    for (let k = 0; k <= n; k++) {
      const u = -f.half + 3 + k * bw;
      fbox(b, key, f, u, y0 + h / 2, (-B + FIN_OUT) / 2, FIN_W, h, B + FIN_OUT);
    }
  }
}

/** one floor module in tower-local coordinates (y=0 at floor base) */
function floorModule(b, t, variant) {
  const r = rng(t.seed * 31);
  const hx = t.w / 2, hz = t.d / 2;
  // slab band (grey) + white fascia line
  b.box('slab', 0, SLAB / 2, 0, t.w, SLAB, t.d);
  b.box('slabWhite', 0, SLAB - 0.06, 0, t.w + 0.08, 0.12, t.d + 0.08);
  // glazing core
  const gh = FH - SLAB;
  b.box('glass', 0, SLAB + gh / 2, 0, t.w - 2 * B, gh, t.d - 2 * B);
  // ceiling soffit of balcony (underside reads as white band from below)
  for (const f of faces(t)) {
    const fl = 2 * f.half; // face length
    const n = Math.max(3, Math.round((fl - 6) / 3.4));
    const bw = (fl - 6) / n;
    const pat = pattern(n, rng(t.seed * 7 + f.th * 3 + 5));
    // balustrade glass along whole face + white handrail
    fbox(b, 'rail', f, 0, SLAB + 0.55, -0.12, fl - 0.4, 1.05, 0.04);
    fbox(b, 'slabWhite', f, 0, SLAB + 1.1, -0.12, fl - 0.4, 0.06, 0.08);
    for (let k = 0; k <= n; k++) {
      const u = -f.half + 3 + k * bw;
      fbox(b, 'fin', f, u, FH / 2, (-B + FIN_OUT) / 2, FIN_W, FH, B + FIN_OUT);
    }
    for (let k = 0; k < n; k++) {
      const u0 = -f.half + 3 + k * bw, uc = u0 + bw / 2, ty = pat[k];
      const iw = bw - FIN_W;
      if (ty === 'S') {
        const pw = iw * 0.64;
        const side = (k < n / 2) ? -1 : 1;
        fbox(b, 'beige', f, uc + side * (iw - pw) / 2, SLAB + gh / 2, -0.45, pw, gh, 0.3);
        // small window ledge inside the slot
        fbox(b, 'slabWhite', f, uc - side * pw / 2, SLAB + 0.9, -B + 0.15, iw - pw, 0.08, 0.3);
      } else if (ty === 'C') {
        fbox(b, 'greyPanel', f, uc, SLAB + gh / 2, -0.9, iw, gh, 0.25);
        fbox(b, 'fin', f, uc, FH / 2, 0.15, 0.22, FH, 0.3);
      } else if (ty === 'L') {
        const ns = 7;
        for (let s = 0; s < ns; s++) fbox(b, 'louver', f, u0 + FIN_W / 2 + (s + 0.5) * iw / ns, SLAB + gh / 2, -0.25, 0.07, gh, 0.32);
      }
    }
    // corner zones (3 m from each end): wrap-around corner balcony
    // handled per corner below
  }
  // corners: cascading cantilevered wrap-around balconies
  const ext = variant ? 0.95 : 0.55;
  const cs = 3.0;
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const cx = sx * (hx - cs / 2 + ext / 2), cz = sz * (hz - cs / 2 + ext / 2);
    b.box('slab', cx, SLAB / 2, cz, cs + ext, SLAB, cs + ext);
    b.box('slabWhite', cx, SLAB - 0.06, cz, cs + ext + 0.08, 0.12, cs + ext + 0.08);
    // rails around corner
    const ox = sx * (hx + ext - 0.1), oz = sz * (hz + ext - 0.1);
    b.box('rail', ox, SLAB + 0.55, cz, 0.04, 1.05, cs + ext - 0.2);
    b.box('rail', cx, SLAB + 0.55, oz, cs + ext - 0.2, 1.05, 0.04);
    b.box('slabWhite', ox, SLAB + 1.1, cz, 0.08, 0.06, cs + ext - 0.2);
    b.box('slabWhite', cx, SLAB + 1.1, oz, cs + ext - 0.2, 0.06, 0.08);
    // slender corner post on the inner edge (keeps corner open = wrap-around)
    b.box('fin', sx * (hx - B + 0.2), FH / 2, sz * (hz - B + 0.2), 0.45, FH, 0.45);
  }
}

/** Builds a tower group (instanced floors + crown). Returns { group, greenery spots } */
export function buildTower(t, M, foliage) {
  const g = new THREE.Group();
  g.name = 'Tower_' + t.name;
  g.position.set(t.x, 0, t.z);
  const r = rng(t.seed);
  const mats = M;
  // instanced floor modules in two alternating variants (cascading corners)
  for (const v of [0, 1]) {
    const b = new Batch();
    floorModule(b, t, v);
    const list = [];
    for (let i = 0; i < TOWER_FLOORS; i++) if (i % 2 === v) list.push(new THREE.Matrix4().makeTranslation(0, Y_POD + i * FH, 0));
    b.buildInstanced(g, mats, list);
  }
  // --- static extras for this tower ---
  const b = new Batch();
  // base plinth / lobby double height glass at podium roof
  // roof slab
  b.box('roofSlab', 0, Y_TOP + 0.25, 0, t.w + 0.1, 0.5, t.d + 0.1);
  b.box('slab', 0, Y_TOP + SLAB / 2 - 0.05, 0, t.w + 0.2, SLAB, t.d + 0.2);
  // crown: fins continue 3.4 m above roof + white top ring
  finsOnly(b, t, 3.4, Y_TOP + 0.5, r);
  const ring = (y, h, dd) => {
    b.box('fin', 0, y, t.d / 2 + dd, t.w + 2 * dd + 0.4, h, 0.5);
    b.box('fin', 0, y, -t.d / 2 - dd, t.w + 2 * dd + 0.4, h, 0.5);
    b.box('fin', t.w / 2 + dd, y, 0, 0.5, h, t.d + 2 * dd);
    b.box('fin', -t.w / 2 - dd, y, 0, 0.5, h, t.d + 2 * dd);
  };
  ring(Y_TOP + 1.1, 1.2, -0.2);          // parapet
  ring(Y_TOP + 3.9 - 0.25, 0.5, FIN_OUT - 0.3); // crown beam
  // corner columns of the crown
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]])
    b.box('fin', sx * (t.w / 2 - 0.3), Y_TOP + 2.2, sz * (t.d / 2 - 0.3), 0.7, 3.6, 0.7);
  // night uplight strips: warm vertical lines on the outer face of the fins next to each corner (ref03)
  for (const f of faces(t)) {
    const n = Math.max(3, Math.round((2 * f.half - 6) / 3.4));
    const bw = (2 * f.half - 6) / n;
    for (const u of [-f.half + 3, f.half - 3]) {
      fbox(b, 'uplight', f, u, Y_POD + (Y_TOP - Y_POD) / 2 + 2, FIN_OUT + 0.03, 0.14, Y_TOP - Y_POD + 4, 0.05);
    }
  }
  const yb = Y_POD + BRIDGE_I * FH;
  for (const [yy, o] of [[yb + 0.02, 1.62], [yb + 0.5, 1.62], [Y_TOP + 3.95, FIN_OUT], [Y_POD + 0.05, 0.25]]) {
    b.box('uplight', 0, yy, t.d / 2 + o, t.w + 2 * o, 0.1, 0.06);
    b.box('uplight', 0, yy, -t.d / 2 - o, t.w + 2 * o, 0.1, 0.06);
    b.box('uplight', t.w / 2 + o, yy, 0, 0.06, 0.1, t.d + 2 * o);
    b.box('uplight', -t.w / 2 - o, yy, 0, 0.06, 0.1, t.d + 2 * o);
  }
  // garden terrace slab at bridge level (wrap-around landscaped deck)
  b.box('slabWhite', 0, yb + 0.25, 0, t.w + 3.2, 0.5, t.d + 3.2);
  b.box('soil', 0, yb + 0.55, 0, t.w + 3.0, 0.15, t.d + 3.0);
  // planter troughs on green-band floors
  for (const gi of GREEN_I) {
    const y = Y_POD + gi * FH + SLAB;
    const ext = gi === BRIDGE_I ? 1.6 : 0.2;
    const hw = t.w / 2 + ext - 0.35, hd = t.d / 2 + ext - 0.35;
    b.box('planter', 0, y + 0.3, hd, 2 * hw, 0.6, 0.6);
    b.box('planter', 0, y + 0.3, -hd, 2 * hw, 0.6, 0.6);
    b.box('planter', hw, y + 0.3, 0, 0.6, 0.6, 2 * hd);
    b.box('planter', -hw, y + 0.3, 0, 0.6, 0.6, 2 * hd);
    // foliage along the troughs
    const dens = gi === BRIDGE_I ? 0.9 : 0.85;
    const perim = [[-hw, hd, hw, hd], [hw, hd, hw, -hd], [hw, -hd, -hw, -hd], [-hw, -hd, -hw, hd]];
    for (const [ax, az, bx, bz] of perim) {
      const L = Math.hypot(bx - ax, bz - az);
      const nx = (bz - az) / L, nz = -(bx - ax) / L; // outward? computed below
      for (let s = 0; s < L; s += dens) {
        const k = s / L;
        const px = ax + (bx - ax) * k, pz = az + (bz - az) * k;
        const wx = t.x + px, wz = t.z + pz;
        const sc = (gi === BRIDGE_I ? 0.75 : 0.5) + r() * 0.35;
        if (gi === BRIDGE_I) {
          const q = r();
          if (q < 0.12) foliage.palm(wx, y + 0.5, wz, 1.6 + r() * 1.4, r());
          else if (q < 0.7) foliage.shrub(wx + (r() - 0.5) * 0.5, y + 0.5 + r() * 0.3, wz + (r() - 0.5) * 0.5, 0.3 + r() * 0.5, r());
          else if (q < 0.85) foliage.shrub(wx, y + 0.9, wz, 0.25 + r() * 0.2, r() * 0.3 + 0.7);
        }
        else foliage.blob(wx, y + 0.7 + r() * 0.2, wz, sc * 1.1, sc * 0.8, sc * 1.1, r());
        if (r() < 0.55) { // trailing plants hanging over the slab edge
          const ox = Math.sign(px) * (Math.abs(px) > Math.abs(hw) - 0.01 ? 0.45 : 0), oz = Math.sign(pz) * (Math.abs(pz) > Math.abs(hd) - 0.01 ? 0.45 : 0);
          const len = (gi === BRIDGE_I ? 1.6 : 1.1) + r() * 1.4;
          foliage.drape(wx + ox, y + 0.4 - len * 0.5, wz + oz, 0.28 + r() * 0.15, len, 0.22, r());
        }
      }
    }
    if (gi === BRIDGE_I) { // palms and shrubs on the wrap-around terrace corners
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        foliage.palm(t.x + sx * (t.w / 2 + 0.9), yb + 0.6, t.z + sz * (t.d / 2 + 0.9), 3.2 + r() * 1.2, r());
        for (let q = 0; q < 6; q++) foliage.shrub(t.x + sx * (t.w / 2 + 0.6 - r() * 2.5), yb + 0.9, t.z + sz * (t.d / 2 + 0.6 - r() * 2.5), 0.5 + r() * 0.35, r());
      }
    }
  }
  // random balcony planters with trailing greenery
  const fcs = faces(t);
  for (let q = 0; q < 70; q++) {
    const i = 1 + ((r() * (TOWER_FLOORS - 2)) | 0);
    if (GREEN_I.includes(i)) continue;
    const f = fcs[(r() * 4) | 0];
    const u = (r() * 2 - 1) * (f.half - 2);
    const y = Y_POD + i * FH + SLAB;
    const [px, pz] = P(f, u, -0.45);
    foliage.blob(t.x + px, y + 0.55, t.z + pz, 0.55, 0.45, 0.45, r());
    if (r() < 0.6) { const [qx, qz] = P(f, u, 0.15); foliage.drape(t.x + qx, y - 0.5, t.z + qz, 0.25, 1.4 + r(), 0.2, r()); }
  }
  b.build(g, mats);
  // move static batch meshes into tower-local space (they were built in tower-local coords except foliage)
  return g;
}
