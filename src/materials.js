import * as THREE from 'three';
import * as T from './textures.js';

export const U = { uNight: { value: 0 }, uTime: { value: 0 } };

const HASH = `
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
`;

/** Patch a material so it renders as a curtain wall of windows with mullions,
 *  per-window tint variation and random warm-lit interiors at night. */
export function windowize(mat, { cellW = 1.6, cellH = 3.2, lit = 0.42, mullion = 0.05, frame = '#2a2d31', seed = 0, warm = 1.0, offsetY = 0 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = U.uNight;
    sh.uniforms.uCell = { value: new THREE.Vector2(cellW, cellH) };
    sh.uniforms.uLit = { value: lit };
    sh.uniforms.uSeed = { value: seed };
    sh.uniforms.uWarm = { value: warm };
    sh.uniforms.uOffY = { value: offsetY };
    sh.uniforms.uFrame = { value: new THREE.Color(frame) };
    sh.uniforms.uMull = { value: mullion };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 _wp = vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          _wp = instanceMatrix * _wp;
        #endif
        _wp = modelMatrix * _wp; vWPos = _wp.xyz;
        vWN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWN;
        uniform float uNight; uniform vec2 uCell; uniform float uLit; uniform float uSeed; uniform float uWarm; uniform vec3 uFrame; uniform float uMull; uniform float uOffY;
        ${HASH}
        float gCellH; float gCellH2; float gMull; vec2 gF;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          float horiz = abs(vWN.x) > 0.5 ? vWPos.z : vWPos.x;
          if (abs(vWN.y) > 0.5) horiz = vWPos.x + vWPos.z;
          vec2 wc = vec2(horiz, vWPos.y - uOffY);
          vec2 cell = floor(wc / uCell);
          gF = fract(wc / uCell);
          float face = floor(dot(vWN, vec3(1.0, 0.0, 2.0)) + 3.0);
          gCellH = h21(cell + vec2(uSeed, face * 17.0));
          gCellH2 = h21(cell * 1.37 + vec2(3.1 + uSeed, face));
          float mx = step(gF.x, uMull) + step(1.0 - uMull, gF.x);
          float my = step(gF.y, 0.06) + step(0.965, gF.y);
          gMull = clamp(mx + my, 0.0, 1.0);
          diffuseColor.rgb *= 0.7 + 0.6 * gCellH2;
          // blinds / curtains in some windows (upper part lighter)
          if (gCellH2 > 0.72 && gF.y > 0.62) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55,0.52,0.48), 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, uFrame, gMull);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, gMull);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float on = step(1.0 - uLit, gCellH) * (1.0 - gMull);
          vec3 warmC = mix(vec3(1.0, 0.62, 0.32), vec3(1.0, 0.86, 0.66), gCellH2);
          vec3 coolC = vec3(0.65, 0.78, 1.0);
          vec3 c = mix(warmC, coolC, step(0.93, gCellH2) * (1.0 - uWarm * 0.0));
          float grad = 0.55 + 0.7 * smoothstep(0.1, 0.95, gF.y);
          float lvl = 1.2 + 2.6 * gCellH2;
          totalEmissiveRadiance += c * on * grad * lvl * uNight;
          // faint interior fill for unlit windows at night
          totalEmissiveRadiance += vec3(0.05,0.045,0.04) * uNight * (1.0 - gMull) * gCellH2;
        }`);
  };
  mat.customProgramCacheKey = () => 'win' + cellW + '_' + cellH + '_' + lit + '_' + seed + '_' + mullion;
  return mat;
}

/** procedural leaf breakup: world-space noise darkens/lightens foliage so blobs read as leafy clumps */
export function leafify(mat, scale = 5.0) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLP;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 _lp = vec4(transformed,1.0);
        #ifdef USE_INSTANCING
          _lp = instanceMatrix * _lp;
        #endif
        vLP = (modelMatrix * _lp).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vLP;
        float lh(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float ln(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(lh(i+vec3(0,0,0)),lh(i+vec3(1,0,0)),f.x), mix(lh(i+vec3(0,1,0)),lh(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(lh(i+vec3(0,0,1)),lh(i+vec3(1,0,1)),f.x), mix(lh(i+vec3(0,1,1)),lh(i+vec3(1,1,1)),f.x),f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float n1 = ln(vLP * ${scale.toFixed(2)}); float n2 = ln(vLP * ${(scale * 3.1).toFixed(2)});
          float k = 0.45 + 0.75 * n1 * (0.55 + 0.6 * n2);
          diffuseColor.rgb *= k; diffuseColor.rgb += vec3(0.02,0.03,0.0) * step(0.8, n2); }`);
  };
  mat.customProgramCacheKey = () => 'leaf' + scale;
  return mat;
}

export function createMaterials(maxAniso = 8) {
  const sign = T.makeSignTexture();
  const ground = T.makeGroundTexture(); ground.repeat.set(0.04, 0.04);
  const grass = T.makeGrassTexture(); grass.repeat.set(1, 1);
  const paver = T.makePaverTexture(); paver.repeat.set(0.25, 0.25);
  const deck = T.makeDeckTexture(); deck.repeat.set(0.35, 0.35);
  const road = T.makeRoadTexture();
  const stripes = T.makeStripeTexture();
  const waterN = T.makeWaterNormal(); waterN.repeat.set(0.15, 0.15);
  const panel = T.makePanelTexture(); panel.repeat.set(0.5, 0.5);
  const solar = T.makeSolarTexture(); solar.repeat.set(0.5, 0.5);
  const [fac1, fac1e] = T.makeFacadeTexture(4); fac1.repeat.set(1 / 21, 1 / 24); fac1e.repeat.copy(fac1.repeat);
  for (const t of [sign, ground, grass, paver, deck, road, stripes, panel, solar, fac1, fac1e]) t.anisotropy = maxAniso;

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const M = {};
  // --- tower facade ---
  M.fin = std({ color: '#ebe6dd', roughness: 0.5, metalness: 0.0 });               // crisp white fins / frames
  M.slab = std({ color: '#6c665f', roughness: 0.82 });                                 // darker grey slab bands
  M.slabWhite = std({ color: '#d9d2c6', roughness: 0.62 });                            // slab fascia
  M.beige = std({ color: '#d4cabd', roughness: 0.78, map: panel });                   // warm beige panels
  M.greyPanel = std({ color: '#76706a', roughness: 0.72, map: panel });                // warm grey panels
  M.glass = windowize(new THREE.MeshPhysicalMaterial({ color: '#141b22', roughness: 0.04, metalness: 0.0, ior: 1.52, specularIntensity: 1.0, clearcoat: 0.6, clearcoatRoughness: 0.03, envMapIntensity: 1.9, emissive: '#000000' }), { cellW: 1.55, cellH: 3.2, lit: 0.3, seed: 1 });
  M.rail = new THREE.MeshPhysicalMaterial({ color: '#1d252c', roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.7, envMapIntensity: 1.5, depthWrite: false });
  M.rail.userData.noCast = true;
  M.louver = std({ color: '#cfc7ba', roughness: 0.6 });
  M.metalDark = std({ color: '#3a3d42', roughness: 0.4, metalness: 0.6 });
  M.uplight = std({ color: '#3a3631', emissive: '#ffbf72', emissiveIntensity: 0 });
  M.soffitLed = std({ color: '#d8d2c8', roughness: 0.6, emissive: '#ffcf8f', emissiveIntensity: 0 }); // bridge underside light panel     // night edge strips
  // --- greenery ---
  M.leaf = leafify(std({ color: '#ffffff', roughness: 0.85 }), 4.5);          // instanceColor drives hue
  M.leaf.userData.noCast = false;
  M.trunk = std({ color: '#6b5640', roughness: 0.9 });
  M.palm = leafify(std({ color: '#ffffff', roughness: 0.75, side: THREE.DoubleSide }), 9.0);
  M.soil = std({ color: '#4a3b2c', roughness: 1 });
  M.planter = std({ color: '#d9d3ca', roughness: 0.7 });
  // --- roof ---
  M.deck = std({ color: '#ffffff', map: deck, roughness: 0.7 });
  M.roofSlab = std({ color: '#d3cfc8', roughness: 0.85 });
  M.water = new THREE.MeshPhysicalMaterial({ color: '#1f8fc4', roughness: 0.09, metalness: 0.0, normalMap: waterN, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.2, emissive: '#2fb4ff', emissiveIntensity: 0.05 });
  M.poolTile = std({ color: '#7fd0ea', roughness: 0.4, emissive: '#1aa6ff', emissiveIntensity: 0 });
  M.solar = std({ color: '#ffffff', map: solar, roughness: 0.25, metalness: 0.5, envMapIntensity: 1.2 });
  M.mech = std({ color: '#a7a7a5', roughness: 0.7, metalness: 0.2 });
  M.fabric = std({ color: '#f5f1e8', roughness: 0.9 });
  M.cushion = std({ color: '#e7dccb', roughness: 0.9 });
  // --- bridge ---
  M.bridgeGlass = new THREE.MeshPhysicalMaterial({ color: '#cfe3ea', roughness: 0.08, metalness: 0.0, transparent: true, opacity: 0.3, envMapIntensity: 2.2, depthWrite: false, side: THREE.DoubleSide, specularIntensity: 1 });
  M.bridgeGlass.userData.noCast = true;
  M.steel = std({ color: '#f4f2ee', roughness: 0.4, metalness: 0.15 });
  M.floorStone = std({ color: '#ffffff', map: paver, roughness: 0.6 });
  M.led = std({ color: '#111', emissive: '#ffcf8a', emissiveIntensity: 0 });
  M.ledBlue = std({ color: '#111', emissive: '#9fd8ff', emissiveIntensity: 0 });
  M.person = std({ color: '#ffffff', roughness: 0.8 });
  // --- podium ---
  M.podGlass = windowize(new THREE.MeshPhysicalMaterial({ color: '#33404a', roughness: 0.05, metalness: 0.1, envMapIntensity: 1.3 }), { cellW: 2.4, cellH: 4.2, lit: 0.85, seed: 7, mullion: 0.035, frame: '#d9d5ce' });
  M.retailGlass = windowize(new THREE.MeshPhysicalMaterial({ color: '#4a5560', roughness: 0.05, metalness: 0.05, envMapIntensity: 1.2 }), { cellW: 3.0, cellH: 5.0, lit: 0.95, seed: 9, mullion: 0.025, frame: '#2b2b2b' });
  M.gold = std({ color: '#c9a35a', roughness: 0.3, metalness: 1.0 });
  M.sign = std({ color: '#f2efe9', map: sign, roughness: 0.45, metalness: 0.0, emissive: '#ffffff', emissiveMap: sign, emissiveIntensity: 0 });
  M.paver = std({ color: '#ffffff', map: paver, roughness: 0.75 });
  M.grass = std({ color: '#ffffff', map: grass, roughness: 0.95 });
  M.stone = std({ color: '#d8d2c7', roughness: 0.7 });
  M.canopy = std({ color: '#f0ede7', roughness: 0.4, metalness: 0.2 });
  // --- context ---
  M.ground = std({ color: '#ffffff', map: ground, roughness: 1 });
  M.sidewalk = std({ color: '#c4bdb1', map: paver, roughness: 0.85 });
  M.median = std({ color: '#ffffff', map: grass, roughness: 0.95 });
  M.road = std({ color: '#ffffff', map: road, roughness: 0.85 });
  M.asphalt = std({ color: '#55565a', roughness: 0.9 });
  M.concrete = std({ color: '#b9b3a8', roughness: 0.85 });
  M.curb = std({ color: '#d4d0c8', roughness: 0.8 });
  M.stripes = std({ color: '#ffffff', map: stripes, roughness: 0.95 });
  M.canalBed = std({ color: '#7d7559', roughness: 1 });
  M.canalWater = new THREE.MeshPhysicalMaterial({ color: '#2f3d36', roughness: 0.1, normalMap: waterN, normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 0.8 });
  M.ctxBuilding = std({ color: '#d9d3c9', map: fac1, emissive: '#ffffff', emissiveMap: fac1e, emissiveIntensity: 0, roughness: 0.8 });
  M.ctxBuilding2 = std({ color: '#cdbb9e', map: fac1, emissive: '#ffffff', emissiveMap: fac1e, emissiveIntensity: 0, roughness: 0.85 });
  M.ctxBuilding3 = std({ color: '#b5afa5', map: fac1, emissive: '#ffffff', emissiveMap: fac1e, emissiveIntensity: 0, roughness: 0.85 });
  M.ctxRoof = std({ color: '#c8c0b2', roughness: 0.9 });
  M.mosque = std({ color: '#f6f4ef', roughness: 0.6, emissive: '#fff1d6', emissiveIntensity: 0 });
  M.carBody = std({ color: '#ffffff', roughness: 0.25, metalness: 0.6 });
  M.carLights = new THREE.MeshBasicMaterial({ color: '#999999', vertexColors: true });
  M.lampHead = std({ color: '#f2f0ea', emissive: '#ffd59a', emissiveIntensity: 0 });
  M.pole = std({ color: '#6c6e72', roughness: 0.5, metalness: 0.6 });
  M.warehouseRoof = std({ color: '#ffffff', map: solar, roughness: 0.35, metalness: 0.4 });
  M.T = { road, ground, paver, grass, stripes, waterN, fac1 };
  return M;
}
