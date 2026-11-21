import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Low-poly stand-ins for the V-Ray proxies. Photogrammetry CC0 trees are too
// heavy to instance thousands of times, so these meshes are original and
// released CC0 (see CREDITS.md). Positions come from vegetation_instances.json,
// which already sits in the web frame (every point falls inside its tower).

const BASE = import.meta.env.BASE_URL;

function palmGeo() {
  const g = new THREE.CylinderGeometry(0.08, 0.14, 1, 6);
  g.translate(0, 0.5, 0);
  const fr = new THREE.ConeGeometry(0.55, 0.18, 6);
  fr.rotateX(Math.PI / 2.4);
  fr.translate(0, 0.95, 0.2);
  const parts = [g];
  for (let i = 0; i < 6; i++) {
    const f = fr.clone();
    f.rotateY(i / 6 * Math.PI * 2);
    parts.push(f);
  }
  return merge(parts);
}

function shrubGeo() {
  const g = new THREE.IcosahedronGeometry(0.55, 0);
  g.translate(0, 0.45, 0);
  return g;
}

function groundGeo() {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.15, 0);
  return g;
}

function personGeo() {
  const body = new THREE.CapsuleGeometry(0.16, 0.55, 2, 6);
  body.translate(0, 0.85, 0);
  const head = new THREE.SphereGeometry(0.13, 6, 5);
  head.translate(0, 1.35, 0);
  return merge([body, head]);
}

function merge(geos) {
  return mergeGeometries(geos, false);
}

function instanced(geo, mat, items, colorFn) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    p.set(it.x, it.y, it.z);
    q.setFromAxisAngle(up, it.yaw || 0);
    s.set(it.sx, it.sy, it.sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (colorFn) mesh.setColorAt(i, colorFn(c, it, i));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (colorFn) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

export async function buildProps(scene, M) {
  const res = await fetch(BASE + 'models/seven/vegetation_instances.json');
  if (!res.ok) throw new Error('vegetation ' + res.status);
  const all = await res.json();
  const g = new THREE.Group();
  g.name = 'Props';
  const leaf = M.leaf || new THREE.MeshStandardMaterial({ color: '#5d7a3e', roughness: 0.85 });
  const palmMat = new THREE.MeshStandardMaterial({ color: '#6e8f45', roughness: 0.8 });
  const shrubMat = new THREE.MeshStandardMaterial({ color: '#4f6b38', roughness: 0.9 });
  const groundMat = new THREE.MeshStandardMaterial({ color: '#5a7548', roughness: 0.95 });
  const palms = [], shrubs = [], ground = [];
  for (const v of all) {
    const yaw = (v.x * 12.3 + v.z) % 6.28;
    if (v.kind === 'tree') palms.push({ x: v.x, y: v.y, z: v.z, sx: v.r, sy: v.h, sz: v.r, yaw });
    else if (v.kind === 'shrub') shrubs.push({ x: v.x, y: v.y, z: v.z, sx: v.r, sy: v.h, sz: v.r, yaw });
    else ground.push({ x: v.x, y: v.y, z: v.z, sx: v.r * 1.4, sy: 1, sz: v.r * 1.4, yaw });
  }
  const pm = instanced(palmGeo(), palmMat, palms);
  const sm = instanced(shrubGeo(), shrubMat, shrubs, (c, it, i) => c.setHSL(0.26, 0.35, 0.22 + (i % 5) * 0.03));
  const gm = instanced(groundGeo(), groundMat, ground);
  for (const m of [pm, sm, gm]) if (m) g.add(m);

  // a light sprinkle of people at the gate, on the podium deck and by the courts
  const people = [
    [-26, 0, 82], [-21, 0, 80], [-24, 0, 76], [-18, 0, 86],
    [-8, 30.5, 8], [6, 30.5, -6], [18, 30.5, -12], [-30, 30.5, -20],
    [12, 30.5, -28], [-16, 30.5, -36],
  ].map(([x, y, z], i) => ({ x, y, z, sx: 1, sy: 1, sz: 1, yaw: i }));
  const personMat = new THREE.MeshStandardMaterial({ color: '#d7d2c8', roughness: 0.8 });
  const peopleMesh = instanced(personGeo(), personMat, people, (c, it, i) => c.setHSL(0.08 + (i % 4) * 0.04, 0.25, 0.35 + (i % 3) * 0.08));
  if (peopleMesh) g.add(peopleMesh);

  // parked cars at the gate drop-off; moving cars stay on the traffic sim
  const parked = [[-28, 0.05, 90], [-20, 0.05, 92], [-16, 0.05, 86], [-30, 0.05, 84]];
  const body = new THREE.BoxGeometry(4.2, 0.7, 1.8).translate(0, 0.55, 0);
  const cabin = new THREE.BoxGeometry(2.2, 0.55, 1.6).translate(-0.2, 1.15, 0);
  const carGeo = merge([body, cabin]);
  const carMat = M.carBody.clone();
  carMat.vertexColors = false;
  const cars = instanced(carGeo, carMat, parked.map(([x, y, z], i) => ({ x, y, z, sx: 1, sy: 1, sz: 1, yaw: 0.15 + i })), (c, it, i) => c.set(['#f4f4f4', '#1d1f22', '#8a1b1b', '#2b4d7a'][i]));
  if (cars) { cars.castShadow = true; g.add(cars); }

  scene.add(g);
  return { palms: palms.length, shrubs: shrubs.length, ground: ground.length, people: people.length };
}
