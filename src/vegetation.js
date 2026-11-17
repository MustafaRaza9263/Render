import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './batch.js';

function lumpy(detail, seed, amt = 0.22) {
  let g = new THREE.IcosahedronGeometry(1, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const r = rng(seed), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (r() - 0.5) * 2 * amt;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function palmCrown() {
  const pos = [], idx = [];
  const fronds = 13, segs = 7;
  for (let f = 0; f < fronds; f++) {
    const a = (f / fronds) * Math.PI * 2 + (f % 2) * 0.2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const base = pos.length / 3;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const L = (0.9 + (f % 2) * 0.2) * t;
      const y = 0.22 * Math.sin(t * Math.PI * 0.9) - (0.45 + (f % 3) * 0.15) * t * t;   // arch then droop
      const w = Math.max(0.02, 0.13 * Math.sin(Math.PI * Math.min(0.97, t * 1.15 + 0.05)));
      // centre line x along a, width perpendicular, slight V fold
      const cx = ca * L, cz = sa * L;
      const px = -sa * w, pz = ca * w;
      pos.push(cx + px, y - w * 0.25, cz + pz, cx - px, y - w * 0.25, cz - pz, cx, y + 0.02, cz);
      if (s > 0) {
        const i0 = base + (s - 1) * 3, i1 = base + s * 3;
        idx.push(i0, i1, i0 + 2, i1, i1 + 2, i0 + 2, i0 + 1, i0 + 2, i1 + 1, i1 + 1, i0 + 2, i1 + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** Collects instanced vegetation; build() creates InstancedMeshes */
export class Foliage {
  constructor() { this.L = { blob: [], canopy: [], trunk: [], palm: [], ptrunk: [] }; this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); }
  _push(list, x, y, z, sx, sy, sz, rot, col) { list.push([x, y, z, sx, sy, sz, rot, col]); }
  leafColor(v, dry = 0) {
    const c = new THREE.Color().setHSL(0.24 + v * 0.08 - dry * 0.06, 0.45 + v * 0.2 - dry * 0.15, 0.2 + v * 0.12 + dry * 0.08);
    return c;
  }
  blob(x, y, z, sx, sy, sz, v) { this._push(this.L.blob, x, y, z, sx, sy, sz, v * 6.28, this.leafColor(v)); }
  drape(x, y, z, sx, len, sz, v) {
    // trailing plants: a few thin strands of slightly different length
    const n = 2 + ((v * 7) | 0) % 2;
    for (let i = 0; i < n; i++) {
      const o = (i - (n - 1) / 2) * sx * 0.9, l = len * (0.6 + ((v * 13 + i * 0.37) % 1) * 0.5);
      this._push(this.L.blob, x + o * 0.7, y + (len - l) * 0.5, z + o * 0.7, sx * 0.45, l * 0.5, sz * 0.6, v * 6.28 + i, this.leafColor((v * 3.3 + i * 0.21) % 1 * 0.6 + 0.1));
    }
  }
  /** smoother, rounder shrub (higher-res geometry) for close-up planters */
  shrub(x, y, z, s, v) { this._push(this.L.canopy, x, y, z, s, s * (0.7 + v * 0.4), s, v * 6.28, this.leafColor(v).offsetHSL(0, 0, (v - 0.5) * 0.06)); }
  tree(x, y, z, h, v, dry = 0) {
    const tr = h * 0.42;
    this._push(this.L.trunk, x, y, z, 0.18 * h / 6, tr, 0.18 * h / 6, 0, null);
    const c = this.leafColor(v, dry);
    const cr = h * 0.33;
    const L = dry > 0 ? this.L.blob : this.L.canopy;   // cheaper LOD for neighbourhood trees
    this._push(L, x, y + tr + cr * 0.6, z, cr * 0.9, cr * 0.75, cr * 0.9, v * 9, c);
    for (let i = 0; i < (dry > 0 ? 2 : 4); i++) {
      const a = v * 20 + i * 1.7, rr = cr * 0.55;
      this._push(L, x + Math.cos(a) * rr, y + tr + cr * (0.25 + 0.25 * ((i * 0.37 + v) % 1)), z + Math.sin(a) * rr, cr * 0.6, cr * 0.5, cr * 0.6, v * 5 + i, c.clone().offsetHSL(0.01 * (i - 2), 0, 0.03 * (i % 2 ? 1 : -1)));
    }
  }
  palm(x, y, z, h, v) {
    const lean = (v - 0.5) * 0.15;
    this._push(this.L.ptrunk, x, y, z, 0.16, h, 0.16, lean, null);
    const s = h * 0.55 + 0.8;
    this._push(this.L.palm, x + lean * h * 0.5, y + h, z, s, s, s, v * 6.28, this.leafColor(v * 0.6 + 0.3).offsetHSL(0, -0.05, 0.03));
  }
  build(scene, M) {
    const geos = {
      blob: lumpy(0, 3, 0.25),
      canopy: lumpy(1, 5, 0.18),
      trunk: new THREE.CylinderGeometry(0.7, 1, 1, 6, 1).translate(0, 0.5, 0),
      ptrunk: new THREE.CylinderGeometry(0.7, 1, 1, 7, 4).translate(0, 0.5, 0),
      palm: palmCrown(),
    };
    const mats = { blob: M.leaf, canopy: M.leaf, trunk: M.trunk, ptrunk: M.trunk, palm: M.palm };
    const out = [];
    for (const k in this.L) {
      const list = this.L[k]; if (!list.length) continue;
      const im = new THREE.InstancedMesh(geos[k], mats[k], list.length);
      list.forEach(([x, y, z, sx, sy, sz, rot, col], i) => {
        if (k === 'ptrunk') this._e.set(rot, 0, rot * 0.7); else this._e.set(0, rot, 0);
        this._q.setFromEuler(this._e);
        this._m.compose(new THREE.Vector3(x, y, z), this._q, new THREE.Vector3(sx, sy, sz));
        im.setMatrixAt(i, this._m);
        if (col) im.setColorAt(i, col);
      });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      im.computeBoundingSphere();
      im.name = 'veg_' + k;
      scene.add(im); out.push(im);
    }
    return out;
  }
}
