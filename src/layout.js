// All units in metres. +Y up, +Z towards the main road (front), +X to the right.
export const FH = 3.2;               // floor-to-floor height (tower)
export const POD_LEVELS = 5;         // podium = floors 1-5 (G+4)
export const POD_FH = 4.2;
export const Y_POD = POD_LEVELS * POD_FH;     // 21 m podium roof
export const TOWER_FLOORS = 30;      // floors 6..35 above podium  => 35 floors total
export const Y_TOP = Y_POD + TOWER_FLOORS * FH; // 117 m roof slab
export const BRIDGE_FLOOR = 20;      // 20th floor = "The Connect"
export const BRIDGE_I = BRIDGE_FLOOR - POD_LEVELS - 1; // tower floor index (0-based) = 14
export const Y_BRIDGE = Y_POD + BRIDGE_I * FH;
export const GREEN_I = [0, 3, 4, BRIDGE_I];          // podium-top, floors ~9-10, bridge level

// Plan positions matched to ref01/ref08: two staggered rows with clear gaps (10-16 m) between towers.
// back row: Imperial, Harmony, Cove   front row: Oasis (wide, front-left), Elite, Alpha (front centre), Nexus (right)
export const TOWERS = [
  { name: 'Imperial', x: -23, z: -14, w: 20, d: 22, seed: 11 },
  { name: 'Harmony', x: 12, z: -26, w: 20, d: 22, seed: 12 },
  { name: 'Cove', x: 46, z: -14, w: 20, d: 22, seed: 13 },
  { name: 'Oasis', x: -54, z: 14, w: 26, d: 28, seed: 14 },
  { name: 'Elite', x: -14, z: 24, w: 20, d: 22, seed: 15 },
  { name: 'Alpha', x: 20, z: 32, w: 20, d: 22, seed: 16 },
  { name: 'Nexus', x: 54, z: 22, w: 24, d: 26, seed: 17 },
];
export const T = Object.fromEntries(TOWERS.map(t => [t.name, t]));

// skybridges at the 20th floor (pairs of towers). axis decided automatically
export const BRIDGES = [
  ['Oasis', 'Elite'], ['Elite', 'Alpha'], ['Alpha', 'Nexus'],
  ['Imperial', 'Harmony'], ['Harmony', 'Cove'],
  ['Imperial', 'Elite'], ['Cove', 'Nexus'],
];
