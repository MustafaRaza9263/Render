import * as THREE from 'three';

/** Lightweight analytic sky dome (gradient + sun glow + procedural clouds + stars). HDR output, used both as
 *  visible background and as source for the PMREM environment. */
export function createSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, ground: { value: new THREE.Color() },
      sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunCol: { value: new THREE.Color() },
      glow: { value: 1 }, disc: { value: 10 }, clouds: { value: 0.4 }, cloudCol: { value: new THREE.Color() },
      stars: { value: 0 }, k: { value: 1 }, haze: { value: 0.35 },
    },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      varying vec3 vD;
      uniform vec3 zenith, horizon, ground, sunCol, cloudCol; uniform vec3 sunDir;
      uniform float glow, disc, clouds, stars, k, haze;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vD);
        float y = d.y;
        vec3 col = mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.45));
        // horizon haze band
        col = mix(col, horizon * 1.08, exp(-abs(y) * 14.0) * haze);
        if (y < 0.0) col = mix(horizon, ground, clamp(-y * 6.0, 0.0, 1.0));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        col += sunCol * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.6) * glow;
        col += sunCol * smoothstep(0.9993, 0.9997, sd) * disc;
        // clouds on a virtual plane
        if (y > 0.0 && clouds > 0.0) {
          vec2 uv = d.xz / (y + 0.12) * 1.6;
          float c = fbm(uv + vec2(3.1, 1.7));
          c = smoothstep(0.55 - clouds * 0.25, 0.95, c) * smoothstep(0.0, 0.25, y);
          vec3 cc = cloudCol * (0.75 + 0.5 * fbm(uv * 2.0 + 7.0)) + sunCol * pow(sd, 4.0) * 0.4 * glow;
          col = mix(col, cc, c * 0.85);
        }
        if (stars > 0.0 && y > 0.0) {
          vec2 sp = floor(d.xz / (y + 0.3) * 300.0);
          float st = step(0.9975, hash(sp)) * smoothstep(0.05, 0.4, y);
          col += vec3(st) * stars;
        }
        gl_FragColor = vec4(col * k, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3000, 48, 24), mat);
  mesh.frustumCulled = false; mesh.renderOrder = -10;
  return mesh;
}

export const SKY_PRESETS = {
  day: { zenith: '#3f78c4', horizon: '#c9d8e6', ground: '#a9a59a', sun: '#fff2dc', glow: 1.0, disc: 12, clouds: 0.45, cloud: '#f4f4f2', stars: 0, k: 1.0, haze: 0.5 },
  dusk: { zenith: '#2c5579', horizon: '#e7a985', ground: '#4a3d3a', sun: '#ffb070', glow: 2.2, disc: 14, clouds: 0.5, cloud: '#b88a86', stars: 0, k: 0.85, haze: 0.8 },
  night: { zenith: '#07142e', horizon: '#3b3442', ground: '#0d0d10', sun: '#9fb4ff', glow: 0.0, disc: 0.0, clouds: 0.3, cloud: '#232a3c', stars: 0.9, k: 0.55, haze: 0.7 },
};
export function applySky(mesh, p, sunDir) {
  const u = mesh.material.uniforms;
  u.zenith.value.set(p.zenith); u.horizon.value.set(p.horizon); u.ground.value.set(p.ground);
  u.sunCol.value.set(p.sun); u.glow.value = p.glow; u.disc.value = p.disc; u.clouds.value = p.clouds;
  u.cloudCol.value.set(p.cloud); u.stars.value = p.stars; u.k.value = p.k; u.haze.value = p.haze;
  u.sunDir.value.copy(sunDir);
}
