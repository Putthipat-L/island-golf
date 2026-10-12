// ============================================================
// core.js — constants, math, course data, zones, terrain height
// World units are yards. Y is up. Holes run toward -Z.
// ============================================================
const WATER_Y = -0.45;
const BALL_R = 0.11;
const CUP_R = 0.3;
const CAPTURE_SPEED = 4.6;   // yd/s — faster than this lips out
const GRAV = 12;             // yd/s^2 (snappy but believable hang time)
const IRON_ANGLE = 30 * Math.PI / 180;
const ADDR_DIST = 0.85;      // golfer stands this far from the ball
const MAX_STROKES = 10;
const WIND_K = 0.13;          // yd/s^2 of push per mph while airborne

const ZONE = { OB: 0, FAIRWAY: 1, GREEN: 2, BUNKER: 3, WATER: 4, TEE: 5, ROUGH: 6 };
const ZONE_LABEL = ['OB', 'Fairway', 'Green', 'Bunker', 'ลงน้ำ', 'Tee', 'Rough'];
// rolling deceleration per zone (yd/s^2)
const DECEL = [30, 7.0, 3.2, 80, 30, 7.0, 15];
// lie penalty on hitting power: bunker -40%, rough -20%
const LIE_FACTOR = [1, 1, 1, 0.6, 1, 1, 0.8];
function roughW(s) { return 7 + 1.4 * Math.sin(s * 0.05 + 0.7); }

const CLUBS = {
  iron:   { key: 'iron',   name: 'Iron',   max: 180 },
  putter: { key: 'putter', name: 'Putter', max: 20 },
};

// ---------- math ----------
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hash2(x, y) { const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function wob(s) { return 1.6 * Math.sin(s * 0.071) + 1.1 * Math.sin(s * 0.173 + 1.3); }
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }
function dist2d(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

// ---------- raw course data ----------
// path: [x, y, halfWidth] with y = yards forward from the tee, x = yards to the right.
// abs ellipse: [x, y, rx, ry, rot]  · rel ellipse (around the cup): {rel:[along, side], r:[across, along]}
const HOLES_RAW = [
  {
    name: 'Palm Cove', par: 3, yards: 150, seed: 11, sky: 'day', wind: [2, 7], greenAmp: 0.3,
    blurb: 'ตีข้ามแนวมะพร้าวตรงเข้ากรีน ระวังบ่อน้ำด้านขวา',
    path: [[0, 0, 11], [0, 40, 13], [6, 95, 17], [0, 150, 19], [-3, 172, 13]],
    green: { r: [15, 13], along: 1 },
    bunkers: [{ rel: [-9, -17], r: [4.5, 7.5], rot: 0.5 }, { rel: [11, 14], r: [4, 8], rot: -0.4 }],
    ponds: [[22, 85, 12, 20, 0.12]],
    trees: [['palm', -17, 55, 1], ['palm', -21, 98, 1.1], ['palm', 21, 122, 0.95], ['bush', -14, 117, 1.1],
            ['round', -20, 140, 0.9], ['round', 22, 150, 1], ['rock', 15, 32, 1.3], ['palm', 20, 20, 0.9]],
  },
  {
    name: 'Coral Bend', par: 4, yards: 400, seed: 23, sky: 'day', wind: [3, 9], greenAmp: 0.36,
    blurb: 'Dogleg ขวา ตัดมุมข้ามกลุ่มต้นไม้ได้ถ้ากล้า',
    path: [[0, 0, 11], [0, 90, 17], [8, 190, 21], [50, 260, 18], [120, 310, 18], [178, 335, 16]],
    green: { r: [14, 15], along: 1 },
    bunkers: [[-12, 212, 9, 5, 0.6], [26, 168, 6, 4, 0.3],
              { rel: [-10, 15], r: [4, 7], rot: 0 }, { rel: [16, 3], r: [7, 4], rot: 0 }],
    ponds: [{ rel: [2, -23], r: [8, 13], rot: 0 }],
    trees: [['round', 42, 205, 1.1], ['round', 55, 222, 1], ['round', 38, 228, 0.9], ['round', 64, 240, 1.2],
            ['palm', 62, 226, 1], ['palm', 95, 288, 1.05], ['cone', 30, 200, 1], ['cone', 74, 252, 1.1],
            ['rock', -18, 120, 1.4], ['bush', 22, 60, 1]],
  },
  {
    name: 'Twin Lagoon', par: 5, yards: 560, seed: 37, sky: 'sunset', wind: [4, 11], greenAmp: 0.42, finale: true,
    blurb: 'ทางตัว S มีลำธารตัดกลาง Fairway ที่ ~330 หลา ข้ามสะพานไม้ได้',
    path: [[0, 0, 11], [0, 100, 17], [-20, 200, 19], [-60, 270, 17], [-70, 330, 19], [-50, 400, 17],
           [0, 470, 17], [26, 522, 20], [34, 540, 13]],
    green: { r: [15, 14], along: 1 },
    bunkers: [[14, 196, 9, 5, 0.3], [-70, 410, 8, 5, -0.6],
              { rel: [-4, 16], r: [4, 7], rot: 0 }, { rel: [17, 4], r: [7, 3.5], rot: 0 }],
    ponds: [[-67.8, 316.8, 75, 6, 0.165], { rel: [0, -24], r: [9, 16], rot: 0 }],
    bridge: { at: 330, side: 12, len: 20, wid: 3.6 },
    trees: [['rock', -40, 252, 1.6], ['rock', -37, 255.5, 1.1], ['rock', -42.5, 256, 1.0],
            ['palm', -8, 452, 1.05], ['palm', -3, 458, 0.95], ['round', 30, 120, 1.1], ['round', 26, 132, 0.9],
            ['cone', -40, 160, 1], ['palm', -96, 300, 1], ['round', -30, 360, 1.1], ['bush', 10, 300, 1]],
  },
];

// ---------- hole building (pure data) ----------
function buildHoleData(raw, index) {
  const pts = raw.path.map(p => ({ x: p[0], z: -p[1], hw: p[2], s: 0 }));
  for (let i = 1; i < pts.length; i++) pts[i].s = pts[i - 1].s + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  const H = { index, name: raw.name, par: raw.par, yards: raw.yards, blurb: raw.blurb, seed: raw.seed, pts, len: pts[pts.length - 1].s };
  const cupP = pointAtS(H, raw.yards);
  H.cupS = raw.yards;
  const dir = { x: cupP.dx, z: cupP.dz };
  const right = { x: -dir.z, z: dir.x };
  const relPos = (along, side) => ({ x: cupP.x + dir.x * along + right.x * side, z: cupP.z + dir.z * along + right.z * side });
  const relRot = Math.atan2(right.z, right.x);
  H.cup = { x: cupP.x, z: cupP.z };
  H.cupDir = dir;
  const toEll = e => {
    if (Array.isArray(e)) return { x: e[0], z: -e[1], rx: e[2], rz: e[3], rot: -e[4] };
    const c = relPos(e.rel[0], e.rel[1]);
    return { x: c.x, z: c.z, rx: e.r[0], rz: e.r[1], rot: relRot + (e.rot || 0) };
  };
  const gc = relPos(raw.green.along || 0, 0);
  H.green = { x: gc.x, z: gc.z, rx: raw.green.r[0], rz: raw.green.r[1], rot: relRot };
  H.green.rmin = Math.min(H.green.rx, H.green.rz);
  H.bunkers = (raw.bunkers || []).map(toEll);
  H.ponds = (raw.ponds || []).map(toEll);
  // tee box at the first point, aligned with the first segment
  const t0 = pointAtS(H, 0);
  H.tee = { x: pts[0].x, z: pts[0].z, hw: 5, hl: 4, rot: Math.atan2(t0.dx, -t0.dz) };
  H.teeDir = { x: t0.dx, z: t0.dz };
  // bridge
  if (raw.bridge) {
    const b = pointAtS(H, raw.bridge.at);
    const r = { x: -b.dz, z: b.dx };
    H.bridge = { x: b.x + r.x * raw.bridge.side, z: b.z + r.z * raw.bridge.side, len: raw.bridge.len, wid: raw.bridge.wid,
                 rot: Math.atan2(b.dz, b.dx), dir: { x: b.dx, z: b.dz } };
  }
  H.treeDefs = raw.trees.map(t => ({ type: t[0], x: t[1], z: -t[2], scale: t[3] }));
  H.sky = raw.sky || 'day'; H.windRange = raw.wind || [2, 8];
  // green undulation (bumps + tilt), flattened around the cup
  { const r = mulberry32(raw.seed * 131 + 7);
    H.und = { a: raw.greenAmp || 0.3, f1: 0.17 + r() * 0.06, f2: 0.15 + r() * 0.06, p1: r() * 6.28, p2: r() * 6.28, tx: (r() - 0.5) * 0.05, tz: (r() - 0.5) * 0.05, hc: 0 };
    H.und.hc = greenRaw(H, H.cup.x, H.cup.z); }
  if (raw.finale) {
    const u = H.cupDir, rt = { x: -u.z, z: u.x };
    H.isle = { x: H.cup.x + u.x * 84 + rt.x * 6, z: H.cup.z + u.z * 84 + rt.z * 6, r: 15 };
    const dx = H.isle.x - H.cup.x, dz = H.isle.z - H.cup.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    let t1 = 20; for (let t = 0; t < L; t += 0.5) if (heightAt(H, H.cup.x + ux * t, H.cup.z + uz * t) < WATER_Y - 0.05) { t1 = t; break; }
    let t2 = 10; for (let t = 0; t < L; t += 0.5) if (heightAt(H, H.isle.x - ux * t, H.isle.z - uz * t) < WATER_Y - 0.05) { t2 = t; break; }
    const a = t1 - 3, e = L - (t2 - 3), len = e - a, c = a + len / 2;
    H.fb = { x: H.cup.x + ux * c, z: H.cup.z + uz * c, len, wid: 3.2, rot: Math.atan2(uz, ux), dir: { x: ux, z: uz }, open: false,
             start: { x: H.cup.x + ux * a, z: H.cup.z + uz * a }, end: { x: H.cup.x + ux * e, z: H.cup.z + uz * e } };
    H.chest = { x: H.isle.x - ux * 1.5, z: H.isle.z - uz * 1.5, yaw: Math.atan2(-ux, -uz) };
  }
  // bounds
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) { minX = Math.min(minX, p.x - p.hw); maxX = Math.max(maxX, p.x + p.hw); minZ = Math.min(minZ, p.z - p.hw); maxZ = Math.max(maxZ, p.z + p.hw); }
  H.bounds = { minX, maxX, minZ, maxZ };
  return H;
}

function pointAtS(H, s) {
  const P = H.pts;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (s <= b.s || i === P.length - 2) {
      const L = b.s - a.s; const t = clamp((s - a.s) / L, 0, 1);
      return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), dx: (b.x - a.x) / L, dz: (b.z - a.z) / L, hw: lerp(a.hw, b.hw, t) };
    }
  }
}

// nearest arc length on the centerline
function projectS(H, x, z) {
  const P = H.pts; let best = 1e9, bs = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
    const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / L2, 0, 1);
    const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
    if (d < best) { best = d; bs = a.s + (b.s - a.s) * t; }
  }
  return bs;
}

// ---------- shape tests ----------
function ellK(x, z, e) {
  const dx = x - e.x, dz = z - e.z, c = Math.cos(e.rot), s = Math.sin(e.rot);
  const qx = c * dx + s * dz, qz = -s * dx + c * dz;
  return Math.hypot(qx / e.rx, qz / e.rz);
}
function inRect(x, z, r, hw, hl) {
  const dx = x - r.x, dz = z - r.z, c = Math.cos(r.rot), s = Math.sin(r.rot);
  const qx = c * dx + s * dz, qz = -s * dx + c * dz;
  return Math.abs(qx) <= hw && Math.abs(qz) <= hl;
}
let _fwS = 0; // arc length of the nearest segment from the last fairwaySD call
function fairwaySD(H, x, z) {
  const P = H.pts; let best = 1e9, bs = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
    let t = ((x - a.x) * abx + (z - a.z) * abz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
    const s = a.s + (b.s - a.s) * t;
    const sd = d - (a.hw + (b.hw - a.hw) * t + wob(s));
    if (sd < best) { best = sd; bs = s; }
  }
  _fwS = bs;
  return best;
}
// in-bounds land = fairway + rough band + green
function courseSD(H, x, z) {
  const f = fairwaySD(H, x, z);
  return Math.min(f - roughW(_fwS), (ellK(x, z, H.green) - 1) * H.green.rmin);
}
function onBridge(H, x, z, pad = 0) {
  const b = H.bridge; if (!b) return false;
  return inRect(x, z, b, b.len / 2 + pad, b.wid / 2 + pad);
}

function greenRaw(H, x, z) {
  const u = H.und, dx = x - H.green.x, dz = z - H.green.z;
  return u.a * (Math.sin(dx * u.f1 + u.p1) * Math.cos(dz * u.f2 + u.p2) + 0.45 * Math.sin((dx * 0.7 - dz) * u.f2 * 1.2 + u.p2 * 0.5)) + u.tx * dx + u.tz * dz;
}
function greenUnd(H, x, z, gk) {
  if (!H.und || gk > 1.3) return 0;
  let h = greenRaw(H, x, z);
  h = lerp(h, H.und.hc, 1 - smoothstep(1.0, 2.8, Math.hypot(x - H.cup.x, z - H.cup.z)));
  return h * (1 - smoothstep(0.9, 1.3, gk));
}
function heightAt(H, x, z) {
  const d = courseSD(H, x, z);
  let y = 0;
  if (d > 0) {
    const bw = 16 + 12 * vnoise(x * 0.018 + 3.1, z * 0.018 - 1.7);
    y = -smoothstep(bw * 0.45, bw + 8, d) * 1.3 - smoothstep(bw + 8, bw + 70, d) * 6.0;
    y += 0.35 * smoothstep(1.5, 5, d) * (1 - smoothstep(bw * 0.3, bw * 0.6, d)) * vnoise(x * 0.12, z * 0.12);
  }
  const gk = ellK(x, z, H.green);
  if (gk < 1.35) y += 0.07 * (1 - smoothstep(1.0, 1.35, gk)) + greenUnd(H, x, z, gk);
  if (H.isle) {
    const I = H.isle, dx = x - I.x, dz = z - I.z, dd = Math.hypot(dx, dz);
    if (dd < I.r + 45) {
      const rr = I.r * (1 + 0.12 * Math.sin(Math.atan2(dz, dx) * 3 + 1.2));
      y = Math.max(y, lerp(0.35, -3.2, smoothstep(-7, 12, dd - rr)));
    }
  }
  for (let i = 0; i < H.bunkers.length; i++) {
    const k = ellK(x, z, H.bunkers[i]);
    if (k < 1.25) { y -= 0.32 * (1 - smoothstep(0.5, 1.0, k)); y += 0.10 * smoothstep(0.92, 1.04, k) * (1 - smoothstep(1.04, 1.25, k)); }
  }
  for (let i = 0; i < H.ponds.length; i++) {
    const k = ellK(x, z, H.ponds[i]);
    if (k < 1.3) y = Math.min(y, lerp(-1.8, 0.0, smoothstep(0.6, 1.25, k)));
  }
  return y;
}

function zoneAt(H, x, z) {
  for (let i = 0; i < H.ponds.length; i++) if (ellK(x, z, H.ponds[i]) < 1) return ZONE.WATER;
  if (ellK(x, z, H.green) < 1) return ZONE.GREEN;
  for (let i = 0; i < H.bunkers.length; i++) if (ellK(x, z, H.bunkers[i]) < 1) return ZONE.BUNKER;
  if (inRect(x, z, H.tee, H.tee.hw, H.tee.hl)) return ZONE.TEE;
  const f = fairwaySD(H, x, z);
  if (f < 0) return ZONE.FAIRWAY;
  if (f < roughW(_fwS)) return ZONE.ROUGH;
  return heightAt(H, x, z) < WATER_Y ? ZONE.WATER : ZONE.OB;
}

// can the golfer stand here?
function onFinaleBridge(H, x, z) {
  const b = H.fb; return !!(b && b.open && inRect(x, z, b, b.len / 2 + 0.6, b.wid / 2 - 0.2));
}
function walkable(H, x, z) {
  if (onBridge(H, x, z) || onFinaleBridge(H, x, z)) return true;
  if (heightAt(H, x, z) < WATER_Y - 0.12) return false;
  for (let i = 0; i < H.ponds.length; i++) if (ellK(x, z, H.ponds[i]) < 1.0) return false;
  const b = H.terrainBounds;
  if (b && (x < b.minX + 5 || x > b.maxX - 5 || z < b.minZ + 5 || z > b.maxZ - 5)) return false;
  return true;
}
function standHeight(H, x, z) {
  if (onBridge(H, x, z, 0.4)) return Math.max(heightAt(H, x, z), 0.32);
  if (onFinaleBridge(H, x, z)) return Math.max(heightAt(H, x, z), 0.36);
  return Math.max(heightAt(H, x, z), WATER_Y - 0.12);
}
