import * as THREE from 'three';

// Unit box (non-indexed, 36 verts) used by the fast box writer
const UB = (() => {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  return { p: g.attributes.position.array, n: g.attributes.normal.array };
})();

const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * Accumulates static geometry per material key and merges it into
 * a few large BufferGeometries (one draw call per material).
 */
export class Batch {
  constructor() { this.buckets = new Map(); }
  bucket(key) {
    let b = this.buckets.get(key);
    if (!b) { b = { p: [], n: [], uv: [] }; this.buckets.set(key, b); }
    return b;
  }
  /** axis-aligned (optionally Y-rotated) box: center, size */
  box(key, cx, cy, cz, sx, sy, sz, rotY = 0, rotX = 0, rotZ = 0) {
    _e.set(rotX, rotY, rotZ, 'YXZ');
    _q.setFromEuler(_e);
    _m.compose(_v.set(cx, cy, cz), _q, _s.set(sx, sy, sz));
    this.boxM(key, _m, sx, sy, sz);
  }
  /** box with full matrix (matrix includes scale = size) */
  boxM(key, m, sx, sy, sz) {
    const b = this.bucket(key);
    const e = m.elements;
    _nm.getNormalMatrix(m);
    const ne = _nm.elements;
    const p = UB.p, n = UB.n;
    for (let i = 0; i < 36; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      b.p.push(
        e[0] * x + e[4] * y + e[8] * z + e[12],
        e[1] * x + e[5] * y + e[9] * z + e[13],
        e[2] * x + e[6] * y + e[10] * z + e[14]);
      const nx = n[i * 3], ny = n[i * 3 + 1], nz = n[i * 3 + 2];
      let ox = ne[0] * nx + ne[3] * ny + ne[6] * nz;
      let oy = ne[1] * nx + ne[4] * ny + ne[7] * nz;
      let oz = ne[2] * nx + ne[5] * ny + ne[8] * nz;
      const l = Math.hypot(ox, oy, oz) || 1;
      b.n.push(ox / l, oy / l, oz / l);
      // planar uv in metres based on face orientation
      let u, v;
      if (Math.abs(ny) > 0.5) { u = x * sx; v = z * sz; }
      else if (Math.abs(nx) > 0.5) { u = z * sz; v = y * sy; }
      else { u = x * sx; v = y * sy; }
      b.uv.push(u, v);
    }
  }
  /** box spanning two points (beam) with given thickness */
  beam(key, a, bpt, w, h, up = new THREE.Vector3(0, 1, 0)) {
    const dir = new THREE.Vector3().subVectors(bpt, a);
    const len = dir.length();
    dir.normalize();
    const mid = new THREE.Vector3().addVectors(a, bpt).multiplyScalar(0.5);
    let side = new THREE.Vector3().crossVectors(up, dir);
    if (side.lengthSq() < 1e-6) side = new THREE.Vector3(1, 0, 0).cross(dir);
    side.normalize();
    const nup = new THREE.Vector3().crossVectors(dir, side).normalize();
    const m = new THREE.Matrix4().makeBasis(side.multiplyScalar(w), nup.multiplyScalar(h), dir.multiplyScalar(len));
    m.setPosition(mid);
    this.boxM(key, m, w, h, len);
  }
  /** arbitrary geometry with matrix */
  geom(key, g, m) {
    const b = this.bucket(key);
    let gg = g.index ? g.toNonIndexed() : g;
    const pos = gg.attributes.position, nor = gg.attributes.normal, uv = gg.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      b.p.push(v.x, v.y, v.z);
      if (nor) { nn.fromBufferAttribute(nor, i).applyMatrix3(nm); if (nn.lengthSq() < 1e-12) nn.set(0, 1, 0); nn.normalize(); b.n.push(nn.x, nn.y, nn.z); }
      else b.n.push(0, 1, 0);
      if (uv) b.uv.push(uv.getX(i), uv.getY(i)); else b.uv.push(v.x, v.z);
    }
    if (gg !== g) gg.dispose();
  }
  toGeometries() {
    const out = {};
    for (const [k, b] of this.buckets) {
      if (!b.p.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.computeBoundingSphere(); g.computeBoundingBox();
      out[k] = g;
    }
    return out;
  }
  /** build meshes into group */
  build(group, mats, { cast = true, receive = true } = {}) {
    const geos = this.toGeometries();
    for (const k in geos) {
      const mat = mats[k];
      if (!mat) { console.warn('missing material', k); continue; }
      const mesh = new THREE.Mesh(geos[k], mat);
      mesh.castShadow = cast && !mat.transparent && !mat.userData.noCast;
      mesh.receiveShadow = receive;
      mesh.name = k;
      group.add(mesh);
    }
    this.buckets.clear();
    return group;
  }
  /** build InstancedMeshes, one per material, for the given matrices */
  buildInstanced(group, mats, matrices, { cast = true, receive = true } = {}) {
    const geos = this.toGeometries();
    for (const k in geos) {
      const mat = mats[k];
      if (!mat) { console.warn('missing material', k); continue; }
      const im = new THREE.InstancedMesh(geos[k], mat, matrices.length);
      matrices.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = cast && !mat.transparent && !mat.userData.noCast;
      im.receiveShadow = receive;
      im.name = k;
      group.add(im);
    }
    this.buckets.clear();
    return group;
  }
}

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
