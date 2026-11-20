import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Exterior shells exported from the architect model, already baked into the
// web/site frame (metres, Y-up). See public/models/seven/manifest.json.
// Normals are authored (smooth on curves, split on hard edges). Do not call
// computeVertexNormals — that would throw the split away.

const BASE = `${import.meta.env.BASE_URL}models/seven/`;

// User labels. T1 is the cut-corner tower (GLB tower 2); T2 is the rectangular
// tower by the main road (GLB tower 1). Centres from manifest v2.
export const REAL_TOWERS = [
  { id: 'T1', x: 8.32, z: 46.57, angle: 0 },
  { id: 'T2', x: -50.53, z: 39.25, angle: 0 },
  { id: 'T3', x: -35.83, z: -15.92, angle: 31.26 },
  { id: 'T4', x: 30.91, z: 24.6, angle: 31.26 },
  { id: 'T5', x: -39.14, z: -58.46, angle: 31.26 },
  { id: 'T6', x: 15.83, z: -24.94, angle: 31.26 },
  { id: 'T7', x: 71.22, z: 8.53, angle: 31.26 },
];

// Axis-aligned bounds of podium + towers, with a small pad so context
// buildings and trees are not planted through the facades.
export const REAL_FOOTPRINT = { minX: -74, maxX: 116, minZ: -97, maxZ: 120 };

export const COMPOUND_CENTER = new THREE.Vector3(20.2, 48, -7.2);

const LOD_Y = 64;
// Aerial is ~340–430 m from the towers and CAM02 ~290–380 m, so both sit on
// lod1. Rear (~160–250 m), street and courtyard stay on lod0. site_far
// replaces the compound once the camera leaves the neighbourhood.
const LOD1_DISTANCE = 270;
const FAR_DISTANCE = 2400;

const NO_CAST = new Set(['glass', 'balcony_glass_rail', 'water_pool', 'planter_green', 'solar']);

function nextFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

function dress(root, lib) {
  const doomed = new Set();
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const swap = (mat) => {
      if (!mat) return mat;
      const repl = lib[mat.name];
      if (!repl) {
        console.warn('unmapped glb material', mat.name);
        return mat;
      }
      doomed.add(mat);
      return repl;
    };
    obj.material = Array.isArray(obj.material) ? obj.material.map(swap) : swap(obj.material);
    const matName = (Array.isArray(obj.material) ? obj.material[0] : obj.material)?.name || '';
    const proxy = (obj.name || '').startsWith('inst|') || (obj.name || '').startsWith('vegetation');
    obj.castShadow = !proxy && !NO_CAST.has(matName);
    obj.receiveShadow = matName !== 'balcony_glass_rail';
  });
  for (const mat of doomed) mat.dispose();
}

/**
 * Load the real exterior. Resolves `firstPaint` once the far shell is in the
 * scene (so the frame is not blocked on lod0) and `complete` once every tower
 * has lod0 attached. `update(camera)` swaps in site_far at long range.
 * Vegetation proxies shipped inside the GLBs are kept; vegetation_instances.json
 * is the raw list for a later, custom tree pass and is not instanced here
 * (doing both would draw the greenery twice).
 */
export function loadRealCompound(scene, M, { onProgress = () => {} } = {}) {
  const lib = M.real;
  const api = {
    towers: REAL_TOWERS,
    footprint: REAL_FOOTPRINT,
    center: COMPOUND_CENTER,
    update() {},
    firstPaint: null,
    complete: null,
  };
  let resolveFirst = () => {};
  api.firstPaint = new Promise((r) => { resolveFirst = r; });

  const root = new THREE.Group();
  root.name = 'RealCompound';
  scene.add(root);

  let detail = null;
  let farRoot = null;
  const lods = {};

  api.update = (camera) => {
    if (!detail || !farRoot) return;
    const far = camera.position.distanceTo(COMPOUND_CENTER) > FAR_DISTANCE;
    detail.visible = !far;
    farRoot.visible = far;
  };

  api.complete = (async () => {
    if (!MeshoptDecoder.supported) throw new Error('Meshopt decoder is not supported in this browser');
    await MeshoptDecoder.ready;
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    const parse = (buffer, path) => new Promise((resolve, reject) => {
      loader.parse(buffer, path, resolve, reject);
    });
    const fetchBuf = async (rel) => {
      const res = await fetch(BASE + rel);
      if (!res.ok) throw new Error(`Failed to fetch ${rel} (${res.status})`);
      return res.arrayBuffer();
    };

    const rels = [
      'site_far.glb', 'podium.glb', 'bridges.glb',
      ...REAL_TOWERS.flatMap((t) => [`towers/${t.id}_lod0.glb`, `towers/${t.id}_lod1.glb`]),
    ];
    const pending = Object.fromEntries(rels.map((rel) => [rel, fetchBuf(rel)]));

    onProgress(0.08, 'Loading far shell');
    const farGltf = await parse(await pending['site_far.glb'], BASE);
    dress(farGltf.scene, lib);
    farGltf.scene.name = 'site_far';
    farRoot = farGltf.scene;
    root.add(farRoot);
    onProgress(0.2, 'Far shell ready');
    resolveFirst();
    // Let the caller paint the shell before the heavy parses stall the frame.
    await nextFrame();
    await nextFrame();

    onProgress(0.35, 'Loading podium, bridges and mid towers');
    const midRels = ['podium.glb', 'bridges.glb', ...REAL_TOWERS.map((t) => `towers/${t.id}_lod1.glb`)];
    const mid = {};
    await Promise.all(midRels.map(async (rel) => { mid[rel] = await parse(await pending[rel], BASE + rel.replace(/[^/]+$/, '')); }));

    detail = new THREE.Group();
    detail.name = 'RealDetail';
    const podium = mid['podium.glb'].scene;
    dress(podium, lib);
    podium.name = 'podium';
    const bridges = mid['bridges.glb'].scene;
    dress(bridges, lib);
    bridges.name = 'bridges';
    detail.add(podium, bridges);

    for (const t of REAL_TOWERS) {
      const lod = new THREE.LOD();
      lod.name = t.id;
      lod.position.set(t.x, LOD_Y, t.z);
      const midScene = mid[`towers/${t.id}_lod1.glb`].scene;
      dress(midScene, lib);
      midScene.position.set(-t.x, -LOD_Y, -t.z);
      midScene.name = `${t.id}_lod1`;
      lod.addLevel(midScene, LOD1_DISTANCE);
      detail.add(lod);
      lods[t.id] = lod;
    }
    root.add(detail);
    // Mid quality replaces the far shell up close. site_far stays for the long shot.
    detail.visible = true;
    farRoot.visible = false;
    onProgress(0.62, 'Near tower detail');
    await nextFrame();

    for (let i = 0; i < REAL_TOWERS.length; i++) {
      const t = REAL_TOWERS[i];
      const gltf = await parse(await pending[`towers/${t.id}_lod0.glb`], `${BASE}towers/`);
      const near = gltf.scene;
      dress(near, lib);
      near.position.set(-t.x, -LOD_Y, -t.z);
      near.name = `${t.id}_lod0`;
      // Distance 0 keeps lod0 in front of lod1. Authored normals are left as-is.
      lods[t.id].addLevel(near, 0);
      onProgress(0.62 + ((i + 1) / REAL_TOWERS.length) * 0.38, `Tower ${t.id}`);
      await nextFrame();
    }
    api.loaded = true;
  })();

  return api;
}
