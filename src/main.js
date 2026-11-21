import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createSky, applySky, SKY_PRESETS } from './sky.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Effect, EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { createMaterials, createRealMaterials, loadPlasterMaps, U } from './materials.js';
import { TOWERS, Y_TOP, Y_POD } from './layout.js';
import { buildTower } from './tower.js';
import { buildBridges, buildPeople } from './bridges.js';
import { buildRoofs } from './roof.js';
import { buildPodium } from './podium.js';
import { buildContext, Traffic } from './context.js';
import { Foliage } from './vegetation.js';

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const PROCEDURAL = params.get('procedural') === '1';
const Q = params.get('q') === 'low' ? 'low' : (params.get('q') === 'high' || SHOT) ? 'high' : 'med';
const $ = (s) => document.querySelector(s);
const setLoad = (p, msg) => { $('#bar-fill').style.width = (p * 100) + '%'; $('#load-msg').textContent = msg; };
const frame = () => new Promise(r => requestAnimationFrame(() => r()));

// ---------------- renderer ----------------
const renderer = new THREE.WebGLRenderer({ antialias: false, stencil: false, depth: true, powerPreference: 'high-performance', preserveDrawingBuffer: SHOT });
const W = () => window.innerWidth, H = () => window.innerHeight;
let dpr = SHOT ? 1 : Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(dpr);
renderer.setSize(W(), H());
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = ({ basic: THREE.BasicShadowMap, vsm: THREE.VSMShadowMap })[params.get('st')] ?? THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('#app').appendChild(renderer.domElement);
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(W(), H());
Object.assign(labelRenderer.domElement.style, { position: 'fixed', inset: '0', pointerEvents: 'none' });
$('#app').appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, W() / H(), 0.5, 6000);
camera.position.set(-260, 230, 360);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 55, 0);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.minDistance = 8; controls.maxDistance = PROCEDURAL ? 1400 : 2000;
controls.maxPolarAngle = Math.PI * 0.97;
controls.autoRotateSpeed = 0.35;

// ---------------- lights ----------------
const sun = new THREE.DirectionalLight('#fff4e5', 3.2);
sun.castShadow = true;
const SM = +(params.get('sm') || (Q === 'low' ? 1024 : Q === 'high' ? 4096 : 2048)); sun.shadow.mapSize.set(SM, SM);
const sc = sun.shadow.camera; sc.left = -135; sc.right = 135; sc.top = 135; sc.bottom = -135; sc.near = 10; sc.far = 900;
if (!PROCEDURAL) { sc.left = sc.bottom = -200; sc.right = sc.top = 200; }
sc.updateProjectionMatrix();
sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.06; sun.shadow.radius = 2.5;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#cfe2ff', '#a89a83', 0.35);
scene.add(hemi);

// ---------------- sky + environment ----------------
const pmrem = new THREE.PMREMGenerator(renderer);
const sky = createSky();
scene.add(sky);
const envScene = new THREE.Scene();
const envSky = createSky(); envScene.add(envSky);
// a few city-glow cards so night reflections are not black
const glowCards = new THREE.Group(); envScene.add(glowCards);
for (let i = 0; i < 24; i++) {
  const a = i / 24 * Math.PI * 2;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(400, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb070').multiplyScalar(0.25), side: THREE.DoubleSide }));
  m.position.set(Math.cos(a) * 2000, 20, Math.sin(a) * 2000); m.lookAt(0, 20, 0); glowCards.add(m);
}
let envRT = null;
let hdriEnv = null;
function setSky(name, sunDir) {
  applySky(sky, SKY_PRESETS[name], sunDir);
  applySky(envSky, { ...SKY_PRESETS[name], disc: Math.min(SKY_PRESETS[name].disc, 3) }, sunDir);
  glowCards.visible = name === 'night';
  if (name === 'day' && hdriEnv) {
    scene.environment = hdriEnv;
    scene.background = null;
    return;
  }
  if (envRT) envRT.dispose();
  envRT = pmrem.fromScene(envScene, 0, 1, 5000);
  scene.environment = envRT.texture;
  scene.background = null;
}

/** Afternoon sun at Karachi (24.94N, 67.09E), 14:00 PKT on 15 Nov.
 *  Elevation is about 40°, close to the 43° sun in the clear-sky HDRI.
 *  Azimuth is degrees clockwise from true north. Web north is (-0.565, 0.825). */
function karachiAfternoon() {
  const lat = 24.94 * Math.PI / 180, lon = 67.09, tz = 5, doy = 319, hour = 14;
  const g = 2 * Math.PI / 365 * (doy - 1);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const ha = ((hour * 60 + eq + 4 * lon - tz * 60) / 4 - 180) * Math.PI / 180;
  const cosphi = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const phi = Math.acos(Math.min(1, Math.max(-1, cosphi)));
  let az = Math.acos(Math.min(1, Math.max(-1, (Math.sin(lat) * cosphi - Math.sin(decl)) / (Math.cos(lat) * Math.sin(phi) + 1e-9))));
  if (ha > 0) az = 2 * Math.PI - az;
  const el = Math.PI / 2 - phi;
  const nx = -0.5651, nz = 0.825, ex = -nz, ez = nx;
  const c = Math.cos(el), s = Math.sin(el);
  const dir = new THREE.Vector3(nx * Math.cos(az) + ex * Math.sin(az), s, nz * Math.cos(az) + ez * Math.sin(az)).normalize();
  return { dir, elev: THREE.MathUtils.radToDeg(Math.asin(dir.y)), az: THREE.MathUtils.radToDeg(Math.atan2(dir.x, dir.z)) };
}
const DAY_SUN = karachiAfternoon();

function alignHdri(tex) {
  const img = tex.image;
  const { data, width, height } = img;
  if (!data || !width) return 0;
  let max = 0, u = 0.5, v = 0.5;
  const step = 4;
  for (let y = 0; y < height; y += step) for (let x = 0; x < width; x += step) {
    const i = (y * width + x) * 4;
    const lum = data[i] + data[i + 1] + data[i + 2];
    if (lum > max) { max = lum; u = x / width; v = y / height; }
  }
  // Equirectangular: u 0.5 looks down -Z in three.js, v 0 is +Y.
  const hdrAz = (u - 0.5) * Math.PI * 2;
  const want = Math.atan2(DAY_SUN.dir.x, DAY_SUN.dir.z);
  return want - hdrAz;
}

// ---------------- post ----------------
const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
composer.addPass(new RenderPass(scene, camera));
const n8 = new N8AOPostPass(scene, camera, W(), H());
Object.assign(n8.configuration, { aoRadius: 4.0, distanceFalloff: 1.2, intensity: Q === 'high' ? 1.6 : 1.25, gammaCorrection: false, halfRes: Q !== 'high', aoSamples: Q === 'high' ? 16 : 8, denoiseSamples: Q === 'high' ? 8 : 4, color: new THREE.Color('#000000') });
if (params.get('ao') !== '0' && Q !== 'low') composer.addPass(n8);
const bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, intensity: 0.5, radius: 0.72 });
const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX, whitePoint: 4.2 });
const vignette = new VignetteEffect({ darkness: 0.35, offset: 0.3 });
class ClampEffect extends Effect {
  constructor() { super('Clamp', `void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){ vec3 c = inputColor.rgb; if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0); outputColor = vec4(min(c, vec3(64.0)), inputColor.a); }`); }
}
composer.addPass(new EffectPass(camera, new ClampEffect()));
// photographic grade: warm gain, gentle contrast around mid-grey, slight desaturation (ref renders)
class GradeEffect extends Effect {
  constructor() {
    super('Grade', `uniform vec3 uGain; uniform float uSat; uniform float uCon;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
        vec3 c = max(inputColor.rgb, vec3(0.0));
        c = 0.18 * pow(c / 0.18, vec3(uCon));
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSat) * uGain;
        outputColor = vec4(c, inputColor.a);
      }`, { uniforms: new Map([['uGain', new THREE.Uniform(new THREE.Vector3(1, 1, 1))], ['uSat', new THREE.Uniform(1)], ['uCon', new THREE.Uniform(1)]]) });
  }
}
const grade = new GradeEffect();
const FX = params.get('fx') || (Q === 'low' ? 'vig' : 'bloom,vig,smaa');
const fxList = [];
if (FX.includes('bloom')) fxList.push(bloom);
fxList.push(tone, grade);
if (FX.includes('vig')) fxList.push(vignette);
composer.addPass(new EffectPass(camera, ...fxList));
if (FX.includes('smaa')) composer.addPass(new EffectPass(camera, new SMAAEffect()));

// ---------------- build scene ----------------
let M, traffic, labels = [], realApi = null;
function addLabel(name, x, y, z, side) {
  const el = document.createElement('div');
  el.className = 'tlabel ' + side;
  el.innerHTML = `<span class="dot"></span><span class="line"></span><span class="txt">${name}</span>`;
  const o = new CSS2DObject(el);
  o.center.set(side === 'left' ? 1 : 0, 0.5);
  o.position.set(x, y, z);
  scene.add(o); labels.push(o);
}
async function build() {
  setLoad(0.05, 'Creating materials');
  await frame();
  M = createMaterials(renderer.capabilities.getMaxAnisotropy());
  const foliage = new Foliage();
  if (PROCEDURAL) {
    const people = [];
    setLoad(0.15, 'Modelling seven towers · 35 floors');
    await frame();
    for (const t of TOWERS) { scene.add(buildTower(t, M, foliage)); }
    setLoad(0.4, 'Building The Connect skybridges (20F)');
    await frame();
    buildBridges(scene, M, foliage, people);
    setLoad(0.5, 'Rooftop decks, pools & pergolas');
    await frame();
    buildRoofs(scene, M, foliage);
    setLoad(0.6, 'Podium, terraces & entrance');
    await frame();
    buildPodium(scene, M, foliage);
    setLoad(0.72, 'Roads, flyover, canal & neighbourhood');
    await frame();
    buildContext(scene, M, foliage);
    traffic = new Traffic(scene, M);
    setLoad(0.85, 'Landscaping');
    await frame();
    foliage.build(scene, M);
    buildPeople(scene, M, people);
    const lab = { Imperial: [0.86, 'left'], Harmony: [0.93, 'right'], Cove: [0.8, 'right'], Oasis: [0.72, 'left'], Elite: [0.5, 'left'], Alpha: [0.38, 'right'], Nexus: [0.62, 'right'] };
    for (const t of TOWERS) {
      const [hf, side] = lab[t.name];
      const sx = side === 'left' ? -1 : 1;
      addLabel(t.name, t.x + sx * t.w * 0.25, Y_POD + (Y_TOP - Y_POD) * hf, t.z + t.d / 2 + 0.5, side);
    }
  } else {
    const plaster = await loadPlasterMaps().catch((err) => { console.warn('plaster maps', err); return null; });
    createRealMaterials(M, plaster);
    const { loadRealCompound } = await import('./real.js');
    realApi = loadRealCompound(scene, M, { onProgress: (t, msg) => setLoad(0.1 + t * 0.62, msg) });
    await realApi.firstPaint;
    setLoad(0.74, 'Roads, flyover, canal & neighbourhood');
    await frame();
    buildContext(scene, M, foliage, { site: true });
    traffic = new Traffic(scene, M);
    setLoad(0.86, 'Landscaping');
    await frame();
    foliage.build(scene, M);
    for (const t of realApi.towers) addLabel(t.id, t.x, 102, t.z, t.x < 15 ? 'left' : 'right');
    const sub = document.querySelector('#ui .title small');
    if (sub) sub.textContent = 'Real exterior · 7 towers · podium · sky-bridges';
  }
  setLoad(0.95, 'Lighting');
  await frame();
}

// ---------------- presets ----------------
const MODES = {
  day: { elev: 40, az: 0, turb: 4, ray: 0.4, sun: '#fff6e8', sunI: 3.4, hemiI: 0.16, night: 0, fog: '#d8d9d4', fogD: 0.00028, grade: [1.04, 1.01, 0.96, 0.94, 1.12], env: 0.7, bgI: 2.0, skyK: 0.026, bloom: 0.15, thr: 1.55 },
  dusk: { elev: 5, az: 292, turb: 9, ray: 2.2, sun: '#ffb27a', sunI: 2.0, hemiI: 0.1, night: 0.65, fog: '#8f8590', fogD: 0.00065, grade: [1.06, 0.99, 0.92, 1.0, 1.05], env: 0.45, bgI: 2.2, skyK: 0.1, bloom: 0.6, thr: 1.0 },
  night: { elev: -10, az: 300, turb: 2, ray: 1, sun: '#8fa8ff', sunI: 0.12, hemiI: 0.04, night: 1, fog: '#141824', fogD: 0.0008, grade: [1.0, 0.98, 0.97, 1.0, 1.04], env: 0.35, bgI: 1.0, bloom: 1.05, thr: 0.85 },
};
MODES.day.elev = DAY_SUN.elev;
MODES.day.az = DAY_SUN.az;
let mode = 'day';
const focus = PROCEDURAL ? new THREE.Vector3(0, 40, 0) : new THREE.Vector3(16, 45, -6);
function applyMode(name) {
  mode = name; const m = MODES[name];
  const th = THREE.MathUtils.degToRad(m.az);
  const sdir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - m.elev), th);
  setSky(name, sdir);
  M.slab.emissive.set('#ffb070'); M.slab.emissiveIntensity = m.night * m.night * 0.1;
  const ldir = name === 'night' ? new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), th) : sdir.clone();
  if (name !== 'night' && m.elev < 12) ldir.y = Math.max(ldir.y, 0.12);
  sun.position.copy(ldir.normalize().multiplyScalar(450));
  sun.target.position.copy(focus);
  sun.color.set(m.sun); sun.intensity = m.sunI;
  hemi.intensity = m.hemiI;
  hemi.color.set(name === 'night' ? '#30406a' : '#cfe2ff');
  scene.fog = new THREE.FogExp2(m.fog, m.fogD);
  scene.environmentIntensity = m.env;
  U.uNight.value = m.night;
  bloom.intensity = m.bloom; bloom.luminanceMaterial.threshold = m.thr;
  grade.uniforms.get('uGain').value.set(m.grade[0], m.grade[1], m.grade[2]); grade.uniforms.get('uSat').value = m.grade[3]; grade.uniforms.get('uCon').value = m.grade[4];
  const n = m.night;
  M.uplight.emissiveIntensity = n * 2.4;
  M.soffitLed.emissiveIntensity = n * n * 1.6;
  M.led.emissiveIntensity = n * n * 7;
  M.floorStone.emissive.set('#ffcf96'); M.floorStone.emissiveIntensity = n * 0.9;
  M.bridgeGlass.emissive.set('#ffd6a0'); M.bridgeGlass.emissiveIntensity = n * n * 0.3;
  M.ledBlue.emissiveIntensity = n * 4;
  M.water.emissiveIntensity = 0.05 + n * 1.3;
  M.poolTile.emissiveIntensity = n * 1.8;
  M.sign.emissiveIntensity = n * 1.3;
  M.lampHead.emissiveIntensity = n * 14;
  M.ctxBuilding.emissiveIntensity = M.ctxBuilding2.emissiveIntensity = M.ctxBuilding3.emissiveIntensity = n * 0.45;
  M.mosque.emissiveIntensity = n * 0.1;
  if (M.lampPool) M.lampPool.opacity = n * 0.1;
  M.fin.emissive.set('#ffcf9a'); M.fin.emissiveIntensity = n * n * 0.08;
  M.slabWhite.emissive.set('#ffcf9a'); M.slabWhite.emissiveIntensity = n * n * 0.06;
  M.steel.emissive.set('#ffe2b8'); M.steel.emissiveIntensity = n * n * 0.3;
  if (M.real) {
    const R = M.real;
    R.glass.emissive.set('#ffd2a8'); R.glass.emissiveIntensity = n * n * 0.45;
    R.water_pool.emissive.set('#7fd4ff'); R.water_pool.emissiveIntensity = 0.05 + n * 1.15;
    R.facade_white.emissive.set('#ffcf9a'); R.facade_white.emissiveIntensity = n * n * 0.05;
    R.gold_logo.emissive.set('#c9a227'); R.gold_logo.emissiveIntensity = n * 0.15;
  }
  M.carLights.color.setScalar(0.6 + n * 6);
  document.querySelectorAll('#modes button').forEach(b => b.classList.toggle('on', b.dataset.mode === name));
}

// Framed on the real compound (bbox centre near x 20, z -7). The same presets
// are used for the procedural fallback so before/after shots share a camera.
const VIEWS = {
  aerial: { pos: [-150, 250, 310], tgt: [16, 40, -6], fov: 34 },
  cam02: { pos: [78, 268, 236], tgt: [8, 32, 0], fov: 32 },
  rear: { pos: [28, 95, -200], tgt: [14, 40, -12], fov: 36 },
  top: { pos: [30, 1580, 42], tgt: [30, 0, 40], fov: 34 },
  interchange: { pos: [210, 2.6, 18], tgt: [150, 9, 110], fov: 52 },
  iso: { pos: [160, 360, 420], tgt: [16, 48, -8], fov: 26 },
  street: { pos: [16, 2.4, 158], tgt: [8, 26, 36], fov: 50 },
  courtyard: { pos: [-2, 32.2, 8], tgt: [6, 120, -20], fov: 72 },
  bridge: { pos: [-8, 78.5, 58], tgt: [-22, 76, 40], fov: 50 },
};
let tween = null;
function goView(name, instant = false) {
  const v = VIEWS[name]; if (!v) return;
  const to = { pos: new THREE.Vector3(...v.pos), tgt: new THREE.Vector3(...v.tgt), fov: v.fov };
  if (instant) { camera.position.copy(to.pos); controls.target.copy(to.tgt); camera.fov = to.fov; camera.updateProjectionMatrix(); controls.update(); }
  else tween = { t: 0, from: { pos: camera.position.clone(), tgt: controls.target.clone(), fov: camera.fov }, to };
  document.querySelectorAll('#views button').forEach(b => b.classList.toggle('on', b.dataset.view === name));
}

// ---------------- UI ----------------
document.querySelectorAll('#views button').forEach(b => b.onclick = () => goView(b.dataset.view));
document.querySelectorAll('#modes button').forEach(b => b.onclick = () => applyMode(b.dataset.mode));
let labelsOn = params.get('labels') === '1';
const setLabels = (on) => { labelsOn = on; document.body.classList.toggle('labels-off', !on); $('#btn-labels').classList.toggle('on', on); };
$('#btn-labels').onclick = () => setLabels(!labelsOn);
$('#btn-orbit').onclick = () => { controls.autoRotate = !controls.autoRotate; $('#btn-orbit').classList.toggle('on', controls.autoRotate); };

window.addEventListener('resize', () => {
  camera.aspect = W() / H(); camera.updateProjectionMatrix();
  renderer.setSize(W(), H()); composer.setSize(W(), H()); labelRenderer.setSize(W(), H());
});

// ---------------- loop ----------------
const clock = new THREE.Timer();
let acc = 0, frames = 0, fpsT = 0, slowFrames = 0;
function stats() {
  const info = renderer.info;
  window.__stats = { tris: info.render.triangles, calls: info.render.calls, fps: 1000 / Math.max(1, acc) };
  $('#stats').textContent = `${window.__stats.fps.toFixed(0)} fps · ${(info.render.triangles / 1e6).toFixed(2)}M tris · ${info.render.calls} calls · dpr ${dpr.toFixed(2)}`;
}
function loop() {
  clock.update(); const dt = Math.min(clock.getDelta(), 0.1);
  U.uTime.value += dt;
  if (M) { M.water.normalMap.offset.x += dt * 0.01; M.water.normalMap.offset.y += dt * 0.006; }
  if (tween) {
    tween.t = Math.min(1, tween.t + dt / 1.6);
    const e = tween.t < 0.5 ? 4 * tween.t ** 3 : 1 - (-2 * tween.t + 2) ** 3 / 2;
    camera.position.lerpVectors(tween.from.pos, tween.to.pos, e);
    controls.target.lerpVectors(tween.from.tgt, tween.to.tgt, e);
    camera.fov = THREE.MathUtils.lerp(tween.from.fov, tween.to.fov, e); camera.updateProjectionMatrix();
    if (tween.t >= 1) tween = null;
  }
  controls.update(dt);
  if (camera.position.y < 1.2) camera.position.y = 1.2;
  if (scene.fog && scene.fog.isFogExp2) {
    const far = camera.position.distanceTo(focus);
    scene.fog.density = MODES[mode].fogD * (far > 900 ? 0.22 : 1);
  }
  if (realApi) realApi.update(camera);
  if (traffic && !SHOT) traffic.update(dt);
  renderer.info.reset();
  renderer.info.autoReset = false;
  if (params.get('post') === '0') { renderer.toneMapping = THREE.AgXToneMapping; renderer.render(scene, camera); } else composer.render(dt);
  labelRenderer.render(scene, camera);
  // adaptive pixel ratio
  if (!SHOT) {
    acc = acc * 0.9 + dt * 1000 * 0.1; frames++;
      if (frames % 30 === 0) {
      stats();
      if (acc > 45 && dpr > 0.6) { dpr = Math.max(0.6, dpr - 0.15); renderer.setPixelRatio(dpr); composer.setSize(W(), H()); }
      else if (acc < 22 && dpr < Math.min(window.devicePixelRatio, 1.75)) { dpr = Math.min(Math.min(window.devicePixelRatio, 1.75), dpr + 0.1); renderer.setPixelRatio(dpr); composer.setSize(W(), H()); }
    }
  }
  requestAnimationFrame(loop);
}

(async () => {
  await build();
  if (Q !== 'low') {
    try {
      const tex = await new HDRLoader().setDataType(THREE.FloatType).loadAsync(`${import.meta.env.BASE_URL}textures/kloofendal_43d_clear_puresky_1k.hdr`);
      scene.environmentRotation.y = alignHdri(tex);
      const rt = pmrem.fromEquirectangular(tex);
      tex.dispose();
      hdriEnv = rt.texture;
    } catch (err) { console.warn('hdri', err); }
  }
  applyMode(params.get('mode') || 'day');
  goView(params.get('view') || 'aerial', true);
  setLabels(labelsOn);
  if (params.get('orbit') === '1') { controls.autoRotate = true; $('#btn-orbit').classList.add('on'); }
  setLoad(1, PROCEDURAL ? 'Ready' : 'Refining detail');
  $('#loader').classList.add('done');
  if (!SHOT || params.get('ui') === '1') $('#ui').classList.remove('hidden');
  requestAnimationFrame(loop);
  if (realApi) {
    try { await realApi.complete; }
    catch (err) {
      console.error(err);
      setLoad(1, 'Model failed to load');
      $('#loader').classList.remove('done');
      return;
    }
  }
  // signal readiness after a few frames (for automated screenshots)
  let n = 0; const chk = () => { if (++n > 3) { document.body.dataset.ready = '1'; window.__stats = { tris: renderer.info.render.triangles, calls: renderer.info.render.calls }; } else requestAnimationFrame(chk); };
  requestAnimationFrame(chk);
  window.__app = { scene, camera, controls, renderer, goView, applyMode, VIEWS, procedural: PROCEDURAL };
})();
