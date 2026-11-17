import { Batch, rng } from './batch.js';
import { TOWERS, Y_TOP } from './layout.js';
import * as THREE from 'three';

export function buildRoofs(scene, M, foliage) {
  const b = new Batch();
  for (const t of TOWERS) {
    const r = rng(t.seed + 500);
    const y = Y_TOP + 0.5;
    const x0 = t.x, z0 = t.z;
    const iw = t.w - 2.2, id = t.d - 2.2;
    // flip amenity arrangement per tower for variety
    const fz = (t.seed % 2) ? 1 : -1;
    // timber deck on the "amenity" half
    b.box('deck', x0, y + 0.08, z0 + fz * id * 0.2, iw, 0.16, id * 0.6);
    // pool with white coping
    const pw = Math.min(iw * 0.55, 13), pd = Math.max(4.2, id * 0.2);
    const pcx = x0 - iw * 0.12, pcz = z0 + fz * id * 0.28;
    b.box('stone', pcx, y + 0.35, pcz + pd / 2 + 0.35, pw + 1.4, 0.4, 0.7);
    b.box('stone', pcx, y + 0.35, pcz - pd / 2 - 0.35, pw + 1.4, 0.4, 0.7);
    b.box('stone', pcx + pw / 2 + 0.35, y + 0.35, pcz, 0.7, 0.4, pd);
    b.box('stone', pcx - pw / 2 - 0.35, y + 0.35, pcz, 0.7, 0.4, pd);
    b.box('poolTile', pcx, y + 0.1, pcz, pw, 0.2, pd);
    b.box('water', pcx, y + 0.42, pcz, pw, 0.06, pd);
    // loungers along pool
    for (let i = 0; i < 6; i++) {
      const lx = pcx - pw / 2 + 1 + i * (pw - 2) / 5, lz = pcz - fz * (pd / 2 + 1.9);
      b.box('cushion', lx, y + 0.35, lz, 0.7, 0.18, 1.5);
      b.box('cushion', lx, y + 0.55, lz - fz * 0.85, 0.7, 0.55, 0.15, 0, fz * 0.6);
      b.box('metalDark', lx, y + 0.2, lz, 0.6, 0.2, 1.4);
      if (i % 2) b.box('fabric', lx + 0.5, y + 1.6, lz, 0.05, 2.6, 0.05); // parasol pole
      if (i % 2) b.geom('fabric', new THREE.ConeGeometry(1.3, 0.5, 8), new THREE.Matrix4().makeTranslation(lx + 0.5, y + 3.0, lz));
    }
    // pergola (white posts + slats)
    const gx = x0 + iw * 0.32, gz = pcz, gw = Math.min(6.5, iw * 0.28), gd = pd + 2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('fin', gx + sx * gw / 2, y + 1.45, gz + sz * gd / 2, 0.25, 2.9, 0.25);
    b.box('fin', gx, y + 2.95, gz + gd / 2, gw + 0.3, 0.3, 0.25); b.box('fin', gx, y + 2.95, gz - gd / 2, gw + 0.3, 0.3, 0.25);
    for (let i = 0; i <= 12; i++) b.box('fin', gx - gw / 2 + i * gw / 12, y + 3.15, gz, 0.1, 0.18, gd + 0.4);
    b.box('cushion', gx, y + 0.35, gz, gw - 1, 0.5, 2.2);         // lounge sofa
    b.box('deck', gx, y + 0.45, gz + 1.6, 1.5, 0.08, 0.9);
    // cabanas
    for (let i = 0; i < 2; i++) {
      const cxp = x0 - iw / 2 + 2.3 + i * 3.4, czp = z0 + fz * (id / 2 - 1.8);
      b.box('fabric', cxp, y + 2.6, czp, 3.0, 0.2, 3.0);
      for (const sx of [-1, 1]) b.box('fabric', cxp + sx * 1.4, y + 1.3, czp, 0.15, 2.6, 3.0);
      b.box('cushion', cxp, y + 0.4, czp, 2.2, 0.4, 1.8);
    }
    // plantings on deck
    for (let i = 0; i < 4; i++) {
      const px = x0 + (r() - 0.5) * iw * 0.9, pz = z0 + fz * (id / 2 - 0.9);
      b.box('planter', px, y + 0.45, pz, 1.6, 0.9, 1.0);
      foliage.blob(px, y + 1.2, pz, 0.8, 0.6, 0.6, r());
    }
    foliage.palm(x0 + iw / 2 - 1.2, y + 0.9, z0 + fz * (id / 2 - 1.2), 3.5, r());
    foliage.palm(x0 - iw / 2 + 1.2, y + 0.9, z0 + fz * 1.0, 3.0, r());
    b.box('planter', x0 + iw / 2 - 1.2, y + 0.45, z0 + fz * (id / 2 - 1.2), 1.4, 0.9, 1.4);
    b.box('planter', x0 - iw / 2 + 1.2, y + 0.45, z0 + fz * 1.0, 1.4, 0.9, 1.4);
    // service half: lift overrun, plant, tanks, solar array
    const sz0 = z0 - fz * id * 0.28;
    b.box('mech', x0 - iw * 0.18, y + 2.2, sz0, 6, 4.4, 4.6);
    b.box('fin', x0 - iw * 0.18, y + 4.5, sz0, 6.3, 0.25, 4.9);
    b.box('mech', x0 + iw * 0.15, y + 1.2, sz0 + fz * 0.5, 2.6, 2.4, 2.2);
    b.box('mech', x0 + iw * 0.15 + 2.2, y + 0.8, sz0 - fz * 1.2, 1.4, 1.6, 1.4);
    b.geom('mech', new THREE.CylinderGeometry(0.9, 0.9, 2, 12), new THREE.Matrix4().makeTranslation(x0 + iw * 0.4, y + 1, sz0));
    const rows = 3, cols = Math.floor(iw / 1.15);
    for (let rr = 0; rr < rows; rr++) for (let c = 0; c < cols; c++) {
      const sx = x0 - iw / 2 + 0.6 + c * 1.15, szz = z0 - fz * (id / 2 - 1.3 - rr * 2.2);
      if (Math.abs(sx - (x0 - iw * 0.18)) < 3.6 && Math.abs(szz - sz0) < 3) continue;
      b.box('solar', sx, y + 0.55, szz, 1.05, 0.05, 1.9, 0, -fz * 0.3);
      b.box('metalDark', sx, y + 0.25, szz, 0.08, 0.5, 0.08);
    }
  }
  const g = new THREE.Group(); g.name = 'Rooftops';
  b.build(g, M);
  scene.add(g);
}
