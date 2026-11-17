import * as THREE from 'three';
import { rng } from './batch.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
function noiseFill(ctx, w, h, base, vari, n, size, r) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const a = (r() - 0.5) * vari;
    ctx.fillStyle = a > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${-a})`;
    const s = size * (0.3 + r());
    ctx.fillRect(r() * w, r() * h, s, s);
  }
}

export function makeSignTexture() {
  const [c, x] = canvas(1024, 1024);
  // warm ivory stone panel with subtle veining
  const g = x.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, '#e9e3d8'); g.addColorStop(0.5, '#f4f0e8'); g.addColorStop(1, '#e2dacc');
  x.fillStyle = g; x.fillRect(0, 0, 1024, 1024);
  const r = rng(7);
  x.strokeStyle = 'rgba(140,125,105,0.10)'; x.lineWidth = 2;
  for (let i = 0; i < 30; i++) { x.beginPath(); let px = r() * 1024, py = r() * 1024; x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (r() - 0.3) * 160; py += (r() - 0.5) * 120; x.lineTo(px, py); } x.stroke(); }
  const gold = x.createLinearGradient(0, 120, 1024, 900);
  gold.addColorStop(0, '#7d5a22'); gold.addColorStop(0.3, '#d4ad5c'); gold.addColorStop(0.5, '#8f6a2c'); gold.addColorStop(0.75, '#e1c071'); gold.addColorStop(1, '#7a5620');
  // frame
  x.strokeStyle = gold; x.lineWidth = 30; x.strokeRect(36, 36, 952, 952);
  x.lineWidth = 6; x.strokeRect(84, 84, 856, 856);
  // bold 7
  x.save(); x.shadowColor = 'rgba(60,40,10,0.45)'; x.shadowBlur = 14; x.shadowOffsetY = 6;
  x.fillStyle = gold;
  x.beginPath(); x.moveTo(255, 190); x.lineTo(780, 190); x.lineTo(785, 262); x.lineTo(520, 850); x.lineTo(420, 850); x.lineTo(662, 292); x.lineTo(255, 292); x.closePath(); x.fill();
  x.restore();
  // SEVEN wordmark on a band crossing the 7
  x.fillStyle = 'rgba(244,240,232,0.94)'; x.fillRect(120, 520, 784, 150);
  x.fillStyle = gold; x.fillRect(120, 516, 784, 5); x.fillRect(120, 669, 784, 5);
  x.font = '600 132px "Times New Roman", Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#3d2f1c'; x.fillText('S E V E N', 512, 600);
  x.font = '600 40px Georgia, serif'; x.fillStyle = '#6b4f22';
  x.fillText('R E S I D E N C E S', 512, 925);
  return tex(c, { repeat: false });
}
export function makeGroundTexture() {
  const [c, x] = canvas(1024, 1024); const r = rng(11);
  noiseFill(x, 1024, 1024, '#827c6e', 0.1, 9000, 6, r);
  for (let i = 0; i < 700; i++) { // scrub patches
    x.fillStyle = `rgba(${90 + r() * 40},${100 + r() * 40},${60 + r() * 20},${0.15 + r() * 0.25})`;
    x.beginPath(); x.arc(r() * 1024, r() * 1024, 4 + r() * 22, 0, Math.PI * 2); x.fill();
  }
  return tex(c);
}
export function makeGrassTexture() {
  const [c, x] = canvas(512, 512); const r = rng(5);
  noiseFill(x, 512, 512, '#5f7a3a', 0.18, 12000, 3, r);
  return tex(c);
}
export function makePaverTexture() {
  const [c, x] = canvas(512, 512); const r = rng(3);
  x.fillStyle = '#cfc6b8'; x.fillRect(0, 0, 512, 512);
  const s = 64;
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
    const l = 190 + r() * 30; x.fillStyle = `rgb(${l},${l - 8},${l - 20})`;
    x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
  }
  x.strokeStyle = 'rgba(140,120,100,0.6)'; x.lineWidth = 6;
  x.strokeRect(0, 0, 512, 512);
  return tex(c);
}
export function makeDeckTexture() {
  const [c, x] = canvas(256, 256); const r = rng(9);
  for (let i = 0; i < 16; i++) {
    const l = 0.85 + r() * 0.3;
    x.fillStyle = `rgb(${150 * l | 0},${105 * l | 0},${70 * l | 0})`; x.fillRect(0, i * 16, 256, 15);
    x.fillStyle = 'rgba(60,40,25,0.6)'; x.fillRect(0, i * 16 + 15, 256, 1);
  }
  return tex(c);
}
export function makeRoadTexture() {
  // u across width (0..1), v along length (repeat). dual carriageway feel
  const [c, x] = canvas(512, 512); const r = rng(13);
  noiseFill(x, 512, 512, '#4a4a4c', 0.08, 5000, 3, r);
  x.fillStyle = '#e8e4d8';
  x.fillRect(14, 0, 6, 512); x.fillRect(512 - 20, 0, 6, 512);
  x.fillStyle = '#d8b54a'; x.fillRect(252, 0, 4, 512); x.fillRect(260, 0, 4, 512);
  x.fillStyle = '#e8e4d8';
  for (const u of [0.13, 0.31, 0.69, 0.87]) for (let v = 0; v < 512; v += 128) x.fillRect(u * 512 - 2, v, 4, 64);
  return tex(c);
}
export function makeStripeTexture() {
  const [c, x] = canvas(1024, 1024);
  x.fillStyle = '#a5b56c'; x.fillRect(0, 0, 1024, 1024);
  for (let rr = 500; rr > 0; rr -= 26) {
    x.beginPath(); x.arc(512, 512, rr, 0, Math.PI * 2);
    x.fillStyle = (rr / 26 | 0) % 2 ? '#56732f' : '#9fb36a'; x.fill();
  }
  return tex(c, { repeat: false });
}
export function makeFacadeTexture(seed = 1) {
  // generic context building facade: rows of windows; alpha channel unused, emissive variant returned
  const [c, x] = canvas(256, 256); const [ce, xe] = canvas(256, 256); const r = rng(seed);
  x.fillStyle = '#d6ccbb'; x.fillRect(0, 0, 256, 256);
  xe.fillStyle = '#000'; xe.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 6; i++) {
    const px = i * 42 + 8, py = j * 32 + 8;
    x.fillStyle = '#3b4148'; x.fillRect(px, py, 26, 18);
    x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(px, py, 26, 3);
    if (r() < 0.28) { xe.fillStyle = `rgb(255,${170 + r() * 50 | 0},${90 + r() * 50 | 0})`; xe.fillRect(px, py, 26, 18); }
  }
  x.fillStyle = 'rgba(0,0,0,0.08)'; for (let j = 0; j < 8; j++) x.fillRect(0, j * 32 + 29, 256, 3);
  const t = tex(c); const te = tex(ce);
  return [t, te];
}
export function makeWaterNormal() {
  const [c, x] = canvas(256, 256); const r = rng(21);
  const img = x.createImageData(256, 256);
  const hgt = new Float32Array(256 * 256);
  for (let k = 0; k < 40; k++) {
    const fx = (1 + (r() * 6 | 0)) * 2 * Math.PI / 256, fy = (1 + (r() * 6 | 0)) * 2 * Math.PI / 256, ph = r() * 6.28, a = 1 / (1 + k * 0.2);
    for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) hgt[j * 256 + i] += Math.sin(i * fx + j * fy + ph) * a;
  }
  for (let j = 0; j < 256; j++) for (let i = 0; i < 256; i++) {
    const dx = hgt[j * 256 + ((i + 1) & 255)] - hgt[j * 256 + ((i + 255) & 255)];
    const dy = hgt[((j + 1) & 255) * 256 + i] - hgt[((j + 255) & 255) * 256 + i];
    const o = (j * 256 + i) * 4;
    img.data[o] = 128 + dx * 20; img.data[o + 1] = 128 + dy * 20; img.data[o + 2] = 255; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return tex(c, { srgb: false });
}
export function makePanelTexture() {
  // subtle panel joints for beige cladding
  const [c, x] = canvas(256, 256); const r = rng(31);
  noiseFill(x, 256, 256, '#c2b6a5', 0.06, 3000, 2, r);
  x.fillStyle = 'rgba(70,60,50,0.25)';
  x.fillRect(0, 0, 256, 2); x.fillRect(0, 128, 256, 2); x.fillRect(0, 0, 2, 256); x.fillRect(128, 0, 2, 256);
  return tex(c);
}
export function makeSolarTexture() {
  const [c, x] = canvas(256, 256);
  x.fillStyle = '#1b2a4a'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#8fa2c0'; x.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke(); }
  return tex(c);
}
