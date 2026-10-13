// ============================================================
// main.js — game state, ball physics, camera, flow
// ============================================================
const V3 = THREE.Vector3;
const Game = {
  mode: 'loading', holeIdx: 0, H: null,
  round: { type: 'round', scores: [null, null, null] },
  strokes: 0, penalties: 0, putts: 0, longest: 0,
  ball: { p: new V3(), v: new V3(), state: 'rest', lastPos: new V3(), shot: null, outcome: null, inCanopy: new Set(), lipped: false, restZone: ZONE.TEE, sink: 0 },
  player: { p: new V3(), yaw: Math.PI, speed: 0 },
  camYaw: Math.PI, camDrag: 0,
  aimYaw: Math.PI, club: 'iron', power: 0, dragging: false, swing: -0.1, swingT: 0, swingFrom: 0, shotPower: 0, launched: false,
  mark: null, overlay: null,
  t: 0, waitT: 0, introT: 0, holedT: 0, watchT: 0,
  camPos: new V3(0, 30, 40), camLook: new V3(), shakeT: 0,
};
const ADDR_ANGLE = -0.1;
// hole intro: overview → swoop down to the golfer's face (she waves) → swing round behind her
const INTRO = { over: 2.3, fly: 5.0, hold: 6.4, end: 7.6, card: 3.4 };
const CHEST_OPEN_R = 3.6;   // walking this close to the chest opens the letter by itself
let golfer, ballMesh, ballShadowFix;
const keys = {};

// ---------- hole setup ----------
function loadHole(idx) {
  Game.holeIdx = idx;
  const H = buildHoleData(HOLES_RAW[idx], idx);
  Game.H = H;
  buildHoleWorld(H);
  UI.bakeMap(H);
  Game.strokes = 0; Game.penalties = 0; Game.putts = 0; Game.longest = 0;
  const b = Game.ball;
  b.p.set(H.tee.x + H.teeDir.x * 0.5, 0, H.tee.z + H.teeDir.z * 0.5); b.p.y = heightAt(H, b.p.x, b.p.z) + BALL_R + 0.03;
  b.v.set(0, 0, 0); b.state = 'rest'; b.outcome = null; b.restZone = ZONE.TEE; b.lastPos.copy(b.p); b.sink = 0;
  ballMesh.visible = true;
  Game.mark = null;
  trailReset();
  const yaw = Math.atan2(H.teeDir.x, H.teeDir.z);
  const right = { x: -H.teeDir.z, z: H.teeDir.x };
  Game.player.p.set(b.p.x - H.teeDir.x * 2.2 - right.x * 1.2, 0, b.p.z - H.teeDir.z * 2.2 - right.z * 1.2);
  Game.player.p.y = standHeight(H, Game.player.p.x, Game.player.p.z);
  Game.player.yaw = yaw; Game.camYaw = yaw; Game.aimYaw = yaw;
  golfer.setPose('walk'); golfer.cheer = 0;
  golfer.root.position.copy(Game.player.p); golfer.root.rotation.y = yaw;
  Game.finStage = H.isle ? 'locked' : null; Game.finT = 0; Game.atChest = false;
  FW.shells.length = 0; FW.parts.length = 0;
  rollWind(true);
  UI.hideOverlays(); UI.hideLetter && UI.hideLetter();
}

function rollWind(fresh) {
  const [lo, hi] = Game.H.windRange;
  if (fresh || !Game.windBase) Game.windBase = { dir: Math.random() * Math.PI * 2, speed: lo + Math.random() * (hi - lo) };
  const b = Game.windBase;
  Game.wind = { dir: b.dir + (Math.random() - 0.5) * 0.7, speed: Math.round(clamp(b.speed + (Math.random() - 0.5) * 3, Math.max(0, lo - 1), hi + 1)) };
}

function startHole(idx) {
  Sound.init();
  document.getElementById('title').hidden = true;
  loadHole(idx);
  Game.mode = 'intro'; Game.introT = 0; Game.introCard = true; Game.introWave = false;
  UI.showIntro(Game.H, Game.round);
  UI.setHUD(false); UI.setCine(true);
  UI.refreshHUD();
}
function updateIntro(dt) {
  Game.introT += dt;
  if (Game.introCard && Game.introT > INTRO.card) { Game.introCard = false; UI.hideIntro(); }
  if (!Game.introWave && Game.introT > INTRO.fly - 0.5) { Game.introWave = true; golfer.wave = INTRO.hold - INTRO.fly + 0.8; }
  if (Game.introT >= INTRO.end) endIntro();
}
function endIntro() {
  if (Game.mode !== 'intro') return;
  if (Game.introCard) { Game.introCard = false; UI.hideIntro(); }
  golfer.wave = 0;
  UI.setCine(false); UI.setHUD(true);
  enterWalk();
}
function skipIntro() { if (Game.mode === 'intro') endIntro(); }

function startRound(type, idx) {
  Game.round = { type, scores: [null, null, null], start: idx };
  startHole(idx);
}

// ---------- helpers ----------
function aimDir() { return { x: Math.sin(Game.aimYaw), z: Math.cos(Game.aimYaw) }; }
function ballZone() { return zoneAt(Game.H, Game.ball.p.x, Game.ball.p.z); }
function distBallToCup() { return dist2d(Game.ball.p.x, Game.ball.p.z, Game.H.cup.x, Game.H.cup.z); }
function nearBall() {
  const b = Game.ball, p = Game.player.p;
  return b.state === 'rest' && b.outcome !== 'holed' && dist2d(b.p.x, b.p.z, p.x, p.z) < 2.6;
}
function defaultClub() {
  const z = ballZone();
  if (z === ZONE.BUNKER) return 'iron';
  if (z === ZONE.GREEN) return 'putter';
  return distBallToCup() <= maxDistance('putter') ? 'putter' : 'iron';
}
function defaultAimYaw() {
  const H = Game.H, b = Game.ball.p;
  Game.aimTarget = distBallToCup();
  if (Game.club !== 'iron') return Math.atan2(H.cup.x - b.x, H.cup.z - b.z);
  const maxD = maxDistance('iron');
  if (distBallToCup() <= maxD * 0.98) return Math.atan2(H.cup.x - b.x, H.cup.z - b.z);
  // longest safe lay-up along the fairway: landing (90%) and roll-out must stay out of water/bunker/OB
  const s0 = projectS(H, b.x, b.z);
  const bad = z => z === ZONE.WATER || z === ZONE.OB || z === ZONE.BUNKER;
  let best = null;
  for (let T = 200; T >= 40; T -= 4) {
    const t = pointAtS(H, Math.min(s0 + T, H.cupS));
    const D = dist2d(b.x, b.z, t.x, t.z);
    if (D > maxD) continue;
    let ok = true;
    for (let f = 0.9; f <= 1.001; f += 0.02) {
      const x = lerp(b.x, t.x, f), z = lerp(b.z, t.z, f);
      if (bad(zoneAt(H, x, z))) { ok = false; break; }
    }
    if (ok && zoneAt(H, t.x, t.z) === ZONE.FAIRWAY) { best = { t, D }; break; }
  }
  if (!best) { const t = pointAtS(H, Math.min(s0 + 150, H.cupS)); best = { t, D: dist2d(b.x, b.z, t.x, t.z) }; }
  Game.aimTarget = best.D;
  return Math.atan2(best.t.x - b.x, best.t.z - b.z);
}
function maxDistance(club) {
  return CLUBS[club].max * LIE_FACTOR[ballZone()];
}

// ---------- mode transitions ----------
function enterWalk() {
  Game.mode = 'walk';
  if (World.slopeArrows) World.slopeArrows.visible = false;
  golfer.setPose('walk');
  UI.setAimUI(false);
}
function enterAim() {
  if (!nearBall()) return;
  Sound.play('ui');
  Game.mode = 'aim';
  Game.club = defaultClub();
  Game.aimYaw = defaultAimYaw();
  Game.power = 0; Game.dragging = false; Game.swing = ADDR_ANGLE;
  golfer.setClub(Game.club);
  golfer.setPose('address');
  placeGolferAtAddress();
  UI.setAimUI(true);
  UI.setClub(Game.club, ballZone() === ZONE.BUNKER);
}
function exitAim() {
  if (Game.mode !== 'aim') return;
  Game.dragging = false; Game.power = 0;
  enterWalk();
  FX.dots.count = 0; FX.ring.visible = false;
}
function setClub(key) {
  if (Game.mode !== 'aim') return;
  if (key === 'putter' && ballZone() === ZONE.BUNKER) { UI.toast('ใช้ Putter ใน Bunker ไม่ได้', 'warn'); return; }
  Game.club = key; golfer.setClub(key);
  UI.setClub(key, ballZone() === ZONE.BUNKER);
  Sound.play('ui');
}
function placeGolferAtAddress() {
  const d = aimDir(); const b = Game.ball.p;
  const f = { x: -d.z, z: d.x };              // golfer faces the ball, target to his left
  const px = b.x - f.x * ADDR_DIST, pz = b.z - f.z * ADDR_DIST;
  Game.player.p.set(px, standHeight(Game.H, px, pz), pz);
  Game.player.yaw = Math.atan2(f.x, f.z);
  golfer.root.position.copy(Game.player.p);
  golfer.root.position.y = b.y - BALL_R - 0.0;
  golfer.root.rotation.y = Game.player.yaw;
}

function releasePower(p) {
  if (Game.mode !== 'aim') return;
  Game.dragging = false;
  if (p < 0.03) { Game.power = 0; return; }
  Game.mode = 'swing'; Game.swingT = 0; Game.swingFrom = Game.swing; Game.shotPower = p; Game.launched = false;
  UI.setAimUI(false);
  FX.dots.count = 0; FX.ring.visible = false;
}

function launchBall() {
  const b = Game.ball, H = Game.H, p = Game.shotPower, d = aimDir();
  const startZone = ballZone();
  b.lastPos.copy(b.p);
  b.inCanopy.clear(); b.lipped = false; b.outcome = null; b.sink = 0; b.rollT = 0;
  Game.strokes += 1;
  if (Game.club === 'putter') {
    if (startZone === ZONE.GREEN) Game.putts += 1;
    const D = p * maxDistance('putter'), a = DECEL[startZone] || DECEL[ZONE.FAIRWAY];
    const v0 = Math.sqrt(2 * a * D);
    b.v.set(d.x * v0, 0, d.z * v0);
    b.state = 'roll';
    b.shot = { club: 'putter', carry: 0 };
    Sound.play('putt');
  } else {
    const carry = p * maxDistance('iron') * 0.9;
    const v0 = Math.sqrt(carry * GRAV / Math.sin(2 * IRON_ANGLE));
    b.v.set(d.x * v0 * Math.cos(IRON_ANGLE), v0 * Math.sin(IRON_ANGLE), d.z * v0 * Math.cos(IRON_ANGLE));
    b.p.y += 0.02;
    b.state = 'flight';
    b.shot = { club: 'iron', carry, deflected: false };
    Sound.play('hit', p);
    if (startZone === ZONE.BUNKER) burst(b.p.x, b.p.y, b.p.z, '#f6e7c4', 40, 4, 5);
    else burst(b.p.x, b.p.y, b.p.z, '#7cc35a', 12, 2, 2.5);
  }
  trailReset(); trailPush(b.p);
  Game.mode = 'flight';
  Game.watchT = 0;
  UI.refreshHUD();
}

// ---------- ball physics ----------
function stepBall(dt) {
  const b = Game.ball, H = Game.H;
  if (b.state === 'flight' || b.state === 'hop') {
    b.v.y -= GRAV * dt;
    const w = Game.wind;
    if (w && w.speed > 0) { const a = w.speed * WIND_K; b.v.x += Math.sin(w.dir) * a * dt; b.v.z += Math.cos(w.dir) * a * dt; }
    b.p.addScaledVector(b.v, dt);
    collideObstacles(b, true);
    const gy = heightAt(H, b.p.x, b.p.z);
    if (b.p.y - BALL_R <= gy) groundContact(b, gy);
  } else if (b.state === 'roll') {
    const zone = zoneAt(H, b.p.x, b.p.z);
    if (zone === ZONE.WATER) { splashBall(); return; }
    if (zone === ZONE.OB) { b.v.multiplyScalar(0.0); b.state = 'rest'; b.outcome = 'ob'; return; }
    if (zone === ZONE.BUNKER) { b.v.set(0, 0, 0); b.state = 'rest'; b.p.y = heightAt(H, b.p.x, b.p.z) + BALL_R * 0.6; burst(b.p.x, b.p.y, b.p.z, '#f6e7c4', 10, 1.5, 2); return; }
    // gravity along the slope (greens undulate), then rolling friction
    const e = 0.15;
    const ax = -GRAV * 0.71 * (heightAt(H, b.p.x + e, b.p.z) - heightAt(H, b.p.x - e, b.p.z)) / (2 * e);
    const az = -GRAV * 0.71 * (heightAt(H, b.p.x, b.p.z + e) - heightAt(H, b.p.x, b.p.z - e)) / (2 * e);
    b.v.x += ax * dt; b.v.z += az * dt;
    const sp = Math.hypot(b.v.x, b.v.z);
    const nsp = Math.max(0, sp - DECEL[zone] * dt);
    b.rollT = (b.rollT || 0) + dt;
    if ((nsp < 0.06 && Math.hypot(ax, az) < DECEL[zone] * 0.95) || b.rollT > 30) { b.v.set(0, 0, 0); b.state = 'rest'; return; }
    if (sp > 0) { b.v.x *= nsp / sp; b.v.z *= nsp / sp; }
    b.p.x += b.v.x * dt; b.p.z += b.v.z * dt;
    b.p.y = heightAt(H, b.p.x, b.p.z) + BALL_R;
    collideObstacles(b, false);
    // cup
    const dc = dist2d(b.p.x, b.p.z, H.cup.x, H.cup.z);
    if (dc < CUP_R) {
      if (nsp < CAPTURE_SPEED) { holeOut(); return; }
      if (!b.lipped) {
        b.lipped = true;
        const ang = (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.25);
        const c = Math.cos(ang), s = Math.sin(ang);
        const vx = b.v.x * c - b.v.z * s, vz = b.v.x * s + b.v.z * c;
        b.v.set(vx * 0.7, 0, vz * 0.7);
        Sound.play('lip');
      }
    } else if (dc > CUP_R + 0.3) b.lipped = false;
  }
}

function groundContact(b, gy) {
  const H = Game.H;
  const zone = zoneAt(H, b.p.x, b.p.z);
  b.p.y = gy + BALL_R;
  if (zone === ZONE.WATER) { splashBall(); return; }
  if (zone === ZONE.OB) {
    b.v.set(0, 0, 0); b.state = 'rest'; b.outcome = 'ob';
    burst(b.p.x, b.p.y, b.p.z, '#efdcb0', 14, 2, 3); Sound.play('thud');
    return;
  }
  if (zone === ZONE.BUNKER) {
    b.v.set(0, 0, 0); b.state = 'rest'; b.p.y = gy + BALL_R * 0.6;
    burst(b.p.x, b.p.y, b.p.z, '#f6e7c4', 34, 3, 4.5); Sound.play('sand');
    return;
  }
  // direct dunk
  if (zone === ZONE.GREEN && dist2d(b.p.x, b.p.z, H.cup.x, H.cup.z) < CUP_R * 1.1) { holeOut(); return; }
  const hs = Math.hypot(b.v.x, b.v.z);
  const dx = hs > 0.001 ? b.v.x / hs : 0, dz = hs > 0.001 ? b.v.z / hs : 0;
  if (b.state === 'flight') {
    const a = DECEL[zone];
    const rollFrac = zone === ZONE.GREEN ? 0.05 : zone === ZONE.ROUGH ? 0.03 : 0.11;
    const R = b.shot && b.shot.carry ? b.shot.carry * rollFrac : 0;
    const vyHop = Math.min(Math.abs(b.v.y) * (zone === ZONE.GREEN ? 0.14 : zone === ZONE.ROUGH ? 0.1 : 0.2), 6);
    const tHop = 2 * vyHop / GRAV;
    let vr = R > 0 ? a * (-tHop + Math.sqrt(tHop * tHop + 2 * R / a)) : 0;
    vr = Math.min(vr, hs * 0.6);
    b.v.set(dx * vr, vyHop, dz * vr);
    b.state = vyHop > 0.4 ? 'hop' : 'roll';
    if (zone === ZONE.GREEN) burst(b.p.x, b.p.y, b.p.z, '#bfe89a', 6, 1, 1.5);
    else burst(b.p.x, b.p.y, b.p.z, '#86c763', 8, 1.5, 2);
    Sound.play('thud');
  } else {
    b.v.y = 0; b.state = 'roll';
  }
}

function collideObstacles(b, air) {
  const H = Game.H;
  for (const t of H.trees) {
    if (t.trunkR > 0 && b.p.y < t.trunkH) {
      const dx = b.p.x - t.x, dz = b.p.z - t.z, rr = t.trunkR + BALL_R, d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 0.001, nx = dx / d, nz = dz / d, vn = b.v.x * nx + b.v.z * nz;
        if (vn < 0) { b.v.x -= 1.6 * vn * nx; b.v.z -= 1.6 * vn * nz; b.v.x *= 0.55; b.v.z *= 0.55; Sound.play('knock'); if (b.shot) b.shot.deflected = true; }
        b.p.x = t.x + nx * rr; b.p.z = t.z + nz * rr;
      }
    }
    if (air && t.cr > 0 && !b.inCanopy.has(t)) {
      const cx = b.p.x - t.cx, cy = b.p.y - t.cy, cz = b.p.z - t.cz;
      if (cx * cx + cy * cy + cz * cz < t.cr * t.cr) {
        b.inCanopy.add(t);
        b.v.x *= 0.28; b.v.z *= 0.28; b.v.y = Math.min(b.v.y * 0.3, 0);
        if (b.shot) b.shot.deflected = true;
        burst(b.p.x, b.p.y, b.p.z, '#4fae4b', 16, 2.5, 1.5);
        Sound.play('leaves');
      }
    }
  }
  for (const r of H.rocks) {
    const dx = b.p.x - r.x, dy = b.p.y - r.y, dz = b.p.z - r.z, rr = r.r + BALL_R;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < rr * rr) {
      const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d, nz = dz / d;
      const vn = b.v.x * nx + b.v.y * ny + b.v.z * nz;
      if (vn < 0) { b.v.x -= 1.5 * vn * nx; b.v.y -= 1.5 * vn * ny; b.v.z -= 1.5 * vn * nz; b.v.multiplyScalar(0.6); Sound.play('knock'); if (b.shot) b.shot.deflected = true; }
      b.p.set(r.x + nx * rr, r.y + ny * rr, r.z + nz * rr);
      if (b.state === 'roll' && b.v.y > 0.5) b.state = 'hop';
    }
  }
}

function splashBall() {
  const b = Game.ball;
  b.v.set(0, 0, 0); b.state = 'sinking'; b.outcome = 'water'; b.sink = 0;
  b.p.y = WATER_Y;
  burst(b.p.x, WATER_Y + 0.1, b.p.z, '#ffffff', 40, 2.5, 5);
  Sound.play('splash');
}

function holeOut() {
  const b = Game.ball, H = Game.H;
  b.state = 'holed'; b.outcome = 'holed'; b.v.set(0, 0, 0);
  b.p.x = H.cup.x; b.p.z = H.cup.z; b.sink = 0;
  Sound.play('cup');
}

function updateBall(dt) {
  const b = Game.ball;
  if (b.state === 'flight' || b.state === 'hop' || b.state === 'roll') {
    const n = 6; for (let i = 0; i < n; i++) { stepBall(dt / n); if (!(b.state === 'flight' || b.state === 'hop' || b.state === 'roll')) break; }
    if (b.state === 'flight' || b.state === 'hop') trailPush(b.p);
    // visual roll spin
    const sp = Math.hypot(b.v.x, b.v.z);
    if (sp > 0.01) ballMesh.rotateOnWorldAxis(new V3(b.v.z / sp, 0, -b.v.x / sp), sp * dt / BALL_R);
  } else if (b.state === 'sinking') {
    b.sink += dt; b.p.y = WATER_Y - b.sink * 0.6;
  } else if (b.state === 'holed') {
    b.sink += dt; const gy = heightAt(Game.H, b.p.x, b.p.z);
    b.p.y = gy + BALL_R - Math.min(1, b.sink * 3) * 0.32;
  }
  ballMesh.position.copy(b.p);
  ballMesh.visible = !(b.state === 'sinking' && b.sink > 0.5);
}

// ---------- shot resolution ----------
function ballStopped() {
  const b = Game.ball;
  return b.state === 'rest' || b.state === 'holed' || (b.state === 'sinking' && b.sink > 0.4);
}
function resolveShot() {
  const b = Game.ball, H = Game.H;
  if (b.outcome === 'holed') { Game.mode = 'holed'; Game.holedT = 0; golfer.setPose('walk'); golfer.cheer = 2.2; UI.toast(Game.strokes === 1 ? 'Hole-in-One!' : 'ลงหลุม!', 'good'); burst(H.cup.x, heightAt(H, H.cup.x, H.cup.z) + 0.3, H.cup.z, '#ffd36b', 50, 3, 6); return; }
  if (!b.outcome && zoneAt(H, b.p.x, b.p.z) === ZONE.OB) b.outcome = 'ob';
  if (b.outcome === 'ob' || b.outcome === 'water') {
    Game.strokes += 1; Game.penalties += 1;
    UI.toast(b.outcome === 'ob' ? 'OB! +1 สโตรก · ตีใหม่จุดเดิม' : 'ลงน้ำ! +1 สโตรก · ตีใหม่จุดเดิม', 'bad');
    b.p.copy(b.lastPos); b.v.set(0, 0, 0); b.state = 'rest'; b.outcome = null;
    ballMesh.visible = true;
    // golfer back next to the ball, facing the hole
    const yaw = Math.atan2(H.cup.x - b.p.x, H.cup.z - b.p.z);
    Game.player.p.set(b.p.x - Math.sin(yaw) * 1.8, 0, b.p.z - Math.cos(yaw) * 1.8);
    if (!walkable(H, Game.player.p.x, Game.player.p.z)) Game.player.p.set(b.p.x, 0, b.p.z);
    Game.player.p.y = standHeight(H, Game.player.p.x, Game.player.p.z);
    Game.player.yaw = yaw; Game.camYaw = yaw;
    golfer.root.position.copy(Game.player.p); golfer.root.rotation.y = yaw;
    Game.camSnap = true;
  } else {
    const z = zoneAt(H, b.p.x, b.p.z);
    const d = Math.round(dist2d(b.lastPos.x, b.lastPos.z, b.p.x, b.p.z));
    if (b.shot && b.shot.club === 'iron') Game.longest = Math.max(Game.longest, d);
    const label = z === ZONE.GREEN ? 'On the green' : ZONE_LABEL[z];
    UI.toast(`${label} · ${d} หลา`, z === ZONE.BUNKER || z === ZONE.ROUGH ? 'warn' : 'good');
    b.restZone = z;
  }
  UI.refreshHUD();
  if (Game.strokes >= MAX_STROKES) { UI.toast(`ครบ ${MAX_STROKES} สโตรก จบหลุมนี้`, 'bad'); Game.mode = 'holed'; Game.holedT = 0.6; Game.strokes = MAX_STROKES; return; }
  Game.camYaw = Game.player.yaw;
  rollWind(false);
  enterWalk();
}

function recordScore() {
  const r = Game.round;
  r.scores[Game.holeIdx] = { strokes: Game.strokes, par: Game.H.par, putts: Game.putts, penalties: Game.penalties, longest: Game.longest };
  Best.record(Game.holeIdx, Game.strokes);
  const done = r.type === 'round' && r.scores.every(s => s);
  if (done) Best.recordRound(r.scores.reduce((a, s) => a + s.strokes, 0));
  return done;
}
function finishHole() {
  const done = recordScore();
  Game.mode = 'scorecard';
  UI.showScorecard(Game.H, Game.round, done);
}

// ---------- birthday finale (after hole 3) ----------
const CINE_END = 8.2, CINE_OPEN = 2.4;
function startFinale() {
  Game.roundDone = recordScore();
  Game.mode = 'finale'; Game.finT = 0; Game.finStage = 'cine';
  golfer.setPose('walk'); golfer.cheer = 0;
  UI.setHUD(false); UI.setCine(true);
  ballMesh.visible = false;
}
function skipFinale() {
  if (Game.mode !== 'finale') return;
  const F = World.fin; if (F && F.openT < 6) F.openT = 6;
  Game.finT = CINE_END;
}
function updateFinaleCine(dt) {
  const F = World.fin; if (!F) return;
  Game.finT += dt;
  if (Game.finT >= CINE_OPEN && F.openT < 0) { F.openT = 0; Sound.play('chest'); }
  if (Game.finT >= CINE_END) endFinaleCine();
}
function endFinaleCine() {
  const H = Game.H, F = World.fin;
  H.fb.open = true; Game.finStage = 'open';
  UI.setCine(false); UI.setHUD(true); UI.bakeMap(H);
  const P = Game.player.p, yaw = Math.atan2(H.chest.x - P.x, H.chest.z - P.z);
  Game.player.yaw = yaw; Game.camYaw = yaw; golfer.root.rotation.y = yaw;
  enterWalk();
  UI.toast('สะพานเปิดแล้ว! เดินไปเปิดหีบบนเกาะ', 'good');
}
function nearChest() {
  const H = Game.H; if (!H || !H.chest) return false;
  return dist2d(Game.player.p.x, Game.player.p.z, H.chest.x, H.chest.z) < 3.6;
}
// open the letter as soon as the golfer reaches the chest (again after walking away and back)
function autoOpenLetter() {
  const H = Game.H;
  if (Game.mode !== 'walk' || !H || !H.chest || Game.overlay) return;
  if (Game.finStage !== 'open' && Game.finStage !== 'done') return;
  const d = dist2d(Game.player.p.x, Game.player.p.z, H.chest.x, H.chest.z);
  if (d < CHEST_OPEN_R) {
    if (!Game.atChest) { Game.atChest = true; UI.stickL.reset(); collectLetter(); }
  } else if (d > CHEST_OPEN_R + 1.5) Game.atChest = false;
}
function collectLetter() {
  const F = World.fin; if (!F) return;
  Sound.init(); Sound.play('sparkle');
  Game.atChest = true;
  if (Game.finStage === 'open') { F.collectT = 0; Game.finStage = 'collecting'; }
  else { Game.finStage = 'reading'; UI.showLetter(); }
  Game.mode = 'letter'; golfer.cheer = 2.4;
  const H = Game.H, P = Game.player.p;
  // face the camera toward the golfer's front so her face shows behind the letter
  Game.player.yaw = Math.atan2(H.chest.x - P.x, H.chest.z - P.z); golfer.root.rotation.y = Game.player.yaw;
}
function closeLetter() {
  UI.hideLetter(); Game.finStage = 'done'; enterWalk();
}
function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function updateFinaleWorld(dt) {
  const F = World.fin; if (!F) return;
  const Hh = 0.72;
  if (F.openT === undefined) F.openT = -1;
  if (F.openT >= 0) F.openT += dt;
  const t = F.openT;
  // lid + envelope + glow
  const lidK = t < 0 ? 0 : easeInOut(clamp(t / 1.0, 0, 1));
  F.lidPivot.rotation.x = -1.95 * lidK;
  const envK = t < 0 ? 0 : easeInOut(clamp((t - 0.3) / 1.6, 0, 1));
  if (F.collectT === undefined || F.collectT < 0) {
    if (!F.collected) {
      F.env.position.y = lerp(Hh - 0.2, Hh + 1.15, envK) + (t > 1.9 ? Math.sin(World.time * 2.2) * 0.08 : 0);
      F.env.rotation.x = lerp(-0.15, -0.5, envK);
      if (t > 0.3) F.env.rotation.y += dt * 0.9 * envK;
    }
  }
  F.glow.material.opacity = (F.collected ? 0.25 : 0.9) * envK * (0.85 + 0.15 * Math.sin(World.time * 3));
  F.light.intensity = envK * 3.2;
  if (t > 0.6 && !F.collected && Math.random() < dt * 6) {
    const wp = new THREE.Vector3(); F.env.getWorldPosition(wp);
    burst(wp.x + (Math.random() - 0.5) * 0.8, wp.y + 0.2, wp.z + (Math.random() - 0.5) * 0.8, Math.random() < 0.5 ? '#ffe08a' : '#ffc3d6', 2, 0.8, 1.5);
  }
  // bridge rises plank by plank
  const N = F.segs.length;
  F.segs.forEach((seg, i) => {
    const k = t < 0 ? 0 : clamp((t - 2.6 - i * (2.2 / N)) / 0.55, 0, 1);
    seg.visible = k > 0;
    if (k > 0 && !seg.userData.splashed) { seg.userData.splashed = true; burst(seg.position.x, WATER_Y + 0.1, seg.position.z, '#ffffff', 14, 2, 3.5); Sound.play('plank'); }
    seg.position.y = lerp(-2.4, 0.27, k <= 0 ? 0 : easeOutBack(k));
  });
  F.lanterns.forEach(b => { b.material.emissiveIntensity = t > 2.4 ? 0.9 + 0.1 * Math.sin(World.time * 4) : 0.15; });
  // balloons
  const C = Game.H.chest;
  F.balloons.forEach((bl, i) => {
    const u = bl.userData;
    if (t < 1.6) { bl.visible = false; return; }
    bl.visible = true;
    if (u.tied) {
      const rise = clamp((t - 1.6) / 1.2, 0, 1);
      bl.position.set(C.x + u.ox + Math.sin(World.time * 1.3 + u.ph) * 0.15, F.chestY + lerp(0.8, 2.4 + u.strLen, easeOutBack(rise)) + Math.sin(World.time * 1.7 + u.ph) * 0.12, C.z + u.oz + Math.cos(World.time * 1.1 + u.ph) * 0.15);
    } else {
      if (u.y === undefined) u.y = F.chestY + 1 + Math.random() * 6;
      u.y += u.speed * dt;
      if (u.y > F.chestY + 55) u.y = F.chestY + 1;
      bl.position.set(C.x + u.ox + Math.sin(World.time * 0.7 + u.ph) * 1.2, u.y, C.z + u.oz + Math.cos(World.time * 0.6 + u.ph) * 1.2);
    }
    bl.rotation.z = Math.sin(World.time * 1.4 + u.ph) * 0.12;
  });
  // fireworks over the island once the chest is open
  if (t > 0.8 && Game.mode !== 'title') {
    F.fwT = (F.fwT === undefined ? 0 : F.fwT) - dt;
    if (F.fwT <= 0) { launchFirework(Game.H.isle.x, F.chestY, Game.H.isle.z); F.fwT = 0.55 + Math.random() * 0.9; }
  }
  // collecting: envelope flies to the camera, then the letter opens
  if (F.collectT !== undefined && F.collectT >= 0) {
    F.collectT += dt;
    const cam = World.camera, target = new THREE.Vector3(0, -0.15, -1.6).applyMatrix4(cam.matrixWorld);
    const local = F.chest.worldToLocal(target.clone());
    F.env.position.lerp(local, Math.min(1, dt * 5));
    F.env.rotation.y += dt * 6;
    if (F.collectT > 0.75) { F.collectT = -1; F.collected = true; F.env.visible = false; Game.finStage = 'reading'; UI.showLetter(); }
  }
}
function nextHole() {
  const r = Game.round;
  if (r.type === 'round') {
    const next = r.scores.findIndex(s => !s);
    if (next >= 0) { startHole(next); return; }
  }
  goTitle();
}
function replayHole() {
  Game.round.scores[Game.holeIdx] = null;
  startHole(Game.holeIdx);
}
function goTitle() {
  if (Game.H == null || Game.holeIdx !== 0) loadHole(0);
  Game.mode = 'title';
  UI.setHUD(false); UI.hideOverlays(); UI.showTitle();
}
function teleportToBall() {
  const b = Game.ball, H = Game.H;
  if (b.state !== 'rest') return;
  const yaw = Math.atan2(H.cup.x - b.p.x, H.cup.z - b.p.z);
  Game.player.p.set(b.p.x - Math.sin(yaw) * 1.6, 0, b.p.z - Math.cos(yaw) * 1.6);
  if (!walkable(H, Game.player.p.x, Game.player.p.z)) Game.player.p.set(b.p.x, 0, b.p.z);
  Game.player.p.y = standHeight(H, Game.player.p.x, Game.player.p.z);
  Game.player.yaw = yaw; Game.camYaw = yaw;
  golfer.root.position.copy(Game.player.p); golfer.root.rotation.y = yaw;
  Game.camSnap = true;
}

// ---------- per-frame ----------
function updatePlayer(dt) {
  const H = Game.H, P = Game.player;
  let ix = UI.stickL.x, iy = UI.stickL.y;
  if (keys.KeyW || keys.ArrowUp) iy += 1; if (keys.KeyS || keys.ArrowDown) iy -= 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1; if (keys.KeyD || keys.ArrowRight) ix += 1;
  let m = Math.hypot(ix, iy); if (m > 1) { ix /= m; iy /= m; m = 1; }
  if (m < 0.12) m = 0;
  const F = { x: Math.sin(Game.camYaw), z: Math.cos(Game.camYaw) }, R = { x: -Math.cos(Game.camYaw), z: Math.sin(Game.camYaw) };
  let speed = 0;
  if (m > 0) {
    const mx = F.x * iy + R.x * ix, mz = F.z * iy + R.z * ix, ml = Math.hypot(mx, mz) || 1;
    const dx = mx / ml, dz = mz / ml;
    speed = m > 0.9 ? 15 : 4 + 9 * (m / 0.9);
    const step = speed * dt;
    let nx = P.p.x + dx * step, nz = P.p.z + dz * step;
    if (walkable(H, nx, nz)) { P.p.x = nx; P.p.z = nz; }
    else if (walkable(H, nx, P.p.z)) P.p.x = nx;
    else if (walkable(H, P.p.x, nz)) P.p.z = nz;
    // push out of trunks
    for (const t of H.trees) {
      if (t.trunkR <= 0) continue;
      const ex = P.p.x - t.x, ez = P.p.z - t.z, rr = t.trunkR + 0.35, d = Math.hypot(ex, ez);
      if (d < rr && d > 0.001) { P.p.x = t.x + ex / d * rr; P.p.z = t.z + ez / d * rr; }
    }
    for (const r of H.rocks) {
      const ex = P.p.x - r.x, ez = P.p.z - r.z, rr = r.r * 0.85 + 0.3, d = Math.hypot(ex, ez);
      if (d < rr && d > 0.001) { P.p.x = r.x + ex / d * rr; P.p.z = r.z + ez / d * rr; }
    }
    const want = Math.atan2(dx, dz);
    P.yaw += angDiff(P.yaw, want) * Math.min(1, dt * 12);
    if (Game.camDrag <= 0) Game.camYaw += angDiff(Game.camYaw, P.yaw) * Math.min(1, dt * 1.4 * m);
  }
  P.speed = speed;
  P.p.y = lerp(P.p.y, standHeight(H, P.p.x, P.p.z), Math.min(1, dt * 15));
  golfer.root.position.copy(P.p);
  golfer.root.rotation.y = P.yaw;
}

function updateAim(dt) {
  let ax = UI.stickR.x;
  if (keys.KeyA || keys.ArrowLeft) ax -= keys.ShiftLeft || keys.ShiftRight ? 0.25 : 0.6;
  if (keys.KeyD || keys.ArrowRight) ax += keys.ShiftLeft || keys.ShiftRight ? 0.25 : 0.6;
  if (Math.abs(ax) > 0.04) {
    const rate = (Game.club === 'putter' ? 0.75 : 1.0) * Math.sign(ax) * Math.pow(Math.abs(ax), 2.2) * 1.0;
    Game.aimYaw -= rate * dt;
    placeGolferAtAddress();
  }
  // keyboard power (hold space)
  if (keys.Space && Game.mode === 'aim') { Game.dragging = true; Game.power = Math.min(1, Game.power + dt / 1.3); UI.setPower(Game.power, true); }
  const maxBack = Game.club === 'iron' ? 2.4 : 0.75;
  const want = Game.dragging ? ADDR_ANGLE - Game.power * maxBack : ADDR_ANGLE;
  Game.swing = lerp(Game.swing, want, Math.min(1, dt * 18));
  updatePreview();
  if (World.slopeArrows) World.slopeArrows.visible = Game.club === 'putter';
}

function updatePreview() {
  const H = Game.H, b = Game.ball.p, d = aimDir();
  const p = Game.dragging ? Math.max(Game.power, 0.02) : 1;
  const dummy = new THREE.Object3D(); const cam = World.camera.position;
  let n = 0, land;
  if (Game.club === 'iron') {
    const carry = p * maxDistance('iron') * 0.9;
    const v0 = Math.sqrt(carry * GRAV / Math.sin(2 * IRON_ANGLE));
    const T = 2 * v0 * Math.sin(IRON_ANGLE) / GRAV;
    const N = 30;
    for (let i = 1; i < N; i++) {
      const t = T * i / N;
      const x = b.x + d.x * v0 * Math.cos(IRON_ANGLE) * t, z = b.z + d.z * v0 * Math.cos(IRON_ANGLE) * t;
      const y = b.y + v0 * Math.sin(IRON_ANGLE) * t - 0.5 * GRAV * t * t;
      const s = clamp(Math.hypot(x - cam.x, y - cam.y, z - cam.z) * 0.0055, 0.05, 0.9);
      dummy.position.set(x, y, z); dummy.scale.setScalar(s); dummy.updateMatrix(); FX.dots.setMatrixAt(n++, dummy.matrix);
    }
    land = { x: b.x + d.x * carry, z: b.z + d.z * carry, label: Math.round(carry) };
    FX.ring.scale.setScalar(Math.max(1, carry * 0.025));
  } else {
    const z0 = ballZone();
    let v = Math.sqrt(2 * (DECEL[z0] || DECEL[1]) * p * maxDistance('putter')), x = b.x, z = b.z, travelled = 0, nextDot = 0.6;
    for (let k = 0; k < 600 && v > 0.05; k++) {
      const zz = zoneAt(H, x, z);
      if (zz === ZONE.OB || zz === ZONE.WATER || zz === ZONE.BUNKER) break;
      const dt = 0.02; v = Math.max(0, v - DECEL[zz] * dt);
      x += d.x * v * dt; z += d.z * v * dt; travelled += v * dt;
      if (travelled >= nextDot && n < 58) {
        nextDot += 0.6;
        dummy.position.set(x, heightAt(H, x, z) + 0.04, z); dummy.scale.setScalar(clamp(Math.hypot(x - cam.x, z - cam.z) * 0.006, 0.04, 0.2)); dummy.updateMatrix(); FX.dots.setMatrixAt(n++, dummy.matrix);
      }
    }
    land = { x, z, label: Math.round(dist2d(b.x, b.z, x, z)) };
    FX.ring.scale.setScalar(0.35);
  }
  FX.dots.count = n; FX.dots.instanceMatrix.needsUpdate = true;
  FX.ring.visible = true;
  FX.ring.position.set(land.x, heightAt(H, land.x, land.z) + 0.06, land.z);
  FX.ring.material.opacity = Game.dragging ? 0.95 : 0.55;
  FX.dots.material.opacity = Game.dragging ? 0.95 : 0.5;
  Game.landing = land;
}

function updateSwing(dt) {
  Game.swingT += dt;
  const iron = Game.club === 'iron';
  const D = iron ? 0.2 : 0.3, F = iron ? 0.38 : 0.4, follow = iron ? 2.3 : 0.6;
  if (Game.swingT < D) {
    const k = Game.swingT / D;
    Game.swing = lerp(Game.swingFrom, ADDR_ANGLE, k * k);
  } else {
    if (!Game.launched) { Game.launched = true; launchBall(); }
  }
}
function updateFollowThrough(dt) {
  // golfer finishes the swing, then turns to watch
  const iron = Game.club === 'iron';
  const D = iron ? 0.2 : 0.3, F = iron ? 0.38 : 0.4, follow = iron ? 2.3 : 0.6;
  Game.swingT += dt;
  const k = clamp((Game.swingT - D) / F, 0, 1);
  Game.swing = lerp(ADDR_ANGLE, follow, 1 - Math.pow(1 - k, 3));
}

function updateCamera(dt) {
  const cam = World.camera, H = Game.H, P = Game.player.p, b = Game.ball.p;
  let pos = new V3(), look = new V3(), k = 1 - Math.exp(-dt * 5);
  const mode = Game.mode;
  if (mode === 'title') {
    const cx = (H.tee.x + H.cup.x) / 2, cz = (H.tee.z + H.cup.z) / 2, a = Game.t * 0.06;
    pos.set(cx + Math.cos(a) * 120, 48, cz + Math.sin(a) * 120); look.set(cx, 0, cz);
    k = Game.t < 0.1 ? 1 : 1 - Math.exp(-dt * 2);
  } else if (mode === 'intro') {
    const t = Game.introT, I = INTRO;
    const yaw = Game.player.yaw, F = { x: Math.sin(yaw), z: Math.cos(yaw) }, S = { x: -F.z, z: F.x };
    const head = new V3(P.x, P.y + 1.12, P.z);
    const B = H.bounds, center = new V3((B.minX + B.maxX) / 2, 0, (B.minZ + B.maxZ) / 2);
    const ext = Math.max(B.maxX - B.minX, B.maxZ - B.minZ);
    const dl = Math.hypot(H.cup.x - H.tee.x, H.cup.z - H.tee.z), d = { x: (H.cup.x - H.tee.x) / dl, z: (H.cup.z - H.tee.z) / dl };
    // high side-on view of the whole hole, drifting slowly round
    const overview = u => {
      const a = lerp(0.32, 0.08, u), c = Math.cos(a), sn = Math.sin(a), R = ext * 0.47 + 34;
      const vx = -d.z * c - d.x * sn, vz = d.x * c - d.z * sn;   // side vector swung toward the tee
      return new V3(center.x + vx * R, ext * 0.32 + 36 - u * 8, center.z + vz * R);
    };
    // orbit round the golfer: small angle = face close-up in front of her, PI = the walk camera behind her
    const orbit = (th, r, y) => { const c = Math.cos(th), sn = Math.sin(th); return new V3(P.x + (F.x * c + S.x * sn) * r, P.y + y, P.z + (F.z * c + S.z * sn) * r); };
    const TH0 = 0.34, face = orbit(TH0, 2.65, 1.42);
    if (t < I.over) {
      pos.copy(overview(t / I.over)); look.copy(center);
    } else if (t < I.fly) {
      const u = easeInOut((t - I.over) / (I.fly - I.over)), v = 1 - u;
      const p0 = overview(1);
      const p1 = new V3(lerp(p0.x, P.x + F.x * 45, 0.55), p0.y * 0.5, lerp(p0.z, P.z + F.z * 45, 0.55));
      const p2 = new V3(P.x + F.x * 13 + S.x * 3, P.y + 4.2, P.z + F.z * 13 + S.z * 3);
      pos.set(0, 0, 0).addScaledVector(p0, v * v * v).addScaledVector(p1, 3 * v * v * u).addScaledVector(p2, 3 * v * u * u).addScaledVector(face, u * u * u);
      look.copy(center).lerp(head, smoothstep(0.08, 0.78, u));
    } else if (t < I.hold) {
      const u = (t - I.fly) / (I.hold - I.fly);
      pos.copy(orbit(TH0 + 0.06 * u, 2.65 - 0.25 * u, 1.42)); look.copy(head);
    } else {
      const u = easeInOut(clamp((t - I.hold) / (I.end - I.hold), 0, 1));
      pos.copy(orbit(lerp(TH0 + 0.06, Math.PI, u), lerp(2.4, 7.2, u), lerp(1.42, 3.7, u)));
      look.copy(head).lerp(new V3(P.x + F.x * 2.6, P.y + 0.5, P.z + F.z * 2.6), u);
    }
    k = 1;
  } else if (mode === 'walk' || mode === 'scorecard') {
    const F = { x: Math.sin(Game.camYaw), z: Math.cos(Game.camYaw) };
    pos.set(P.x - F.x * 7.2, P.y + 3.7, P.z - F.z * 7.2);
    look.set(P.x + F.x * 2.6, P.y + 0.5, P.z + F.z * 2.6);
    k = 1 - Math.exp(-dt * 4);
  } else if (mode === 'aim' || mode === 'swing') {
    const d = aimDir();
    const L = { x: d.z, z: -d.x }; // golfer's side of the ball
    if (Game.club === 'putter') { pos.set(b.x - d.x * 3.9 + L.x * 0.35, b.y + 1.95, b.z - d.z * 3.9 + L.z * 0.35); look.set(b.x + d.x * 7, b.y - 0.2, b.z + d.z * 7); }
    else { pos.set(b.x - d.x * 4.7 + L.x * 0.45, b.y + 2.25, b.z - d.z * 4.7 + L.z * 0.45); look.set(b.x + d.x * 15, b.y + 0.1, b.z + d.z * 15); }
    k = 1 - Math.exp(-dt * 9);
  } else if (mode === 'flight' || mode === 'settle' || mode === 'holed') {
    const bv = Game.ball.v; const hs = Math.hypot(bv.x, bv.z);
    if (hs > 0.5) Game.chaseDir = { x: bv.x / hs, z: bv.z / hs };
    const cd = Game.chaseDir || aimDir();
    const back = Game.club === 'putter' ? 4.2 : 10, up = Game.club === 'putter' ? 1.9 : 4.5;
    if (mode === 'holed') { pos.set(H.cup.x - cd.x * 5, heightAt(H, H.cup.x, H.cup.z) + 2.6, H.cup.z - cd.z * 5); look.set(H.cup.x, heightAt(H, H.cup.x, H.cup.z), H.cup.z); k = 1 - Math.exp(-dt * 2); }
    else { pos.set(b.x - cd.x * back, Math.max(b.y, 0) + up, b.z - cd.z * back); look.set(b.x, b.y, b.z); k = 1 - Math.exp(-dt * (Game.club === 'putter' ? 4 : 3)); }
  } else if (mode === 'finale' && World.fin) {
    const F = World.fin, C = H.chest, cy = F.chestY, fb = H.fb;
    const tw = { x: -fb.dir.x, z: -fb.dir.z }, sd = { x: -tw.z, z: tw.x };
    if (Game.finT < 4.7) {
      pos.set(C.x + tw.x * 4.4 + sd.x * 1.8, cy + 2.4, C.z + tw.z * 4.4 + sd.z * 1.8); look.set(C.x, cy + 0.95, C.z);
      k = 1 - Math.exp(-dt * (Game.finT < 2.4 ? 1.7 : 3));
    } else {
      const mx = (fb.start.x + H.isle.x) / 2, mz = (fb.start.z + H.isle.z) / 2;
      pos.set(mx + sd.x * 30 + tw.x * 8, 21, mz + sd.z * 30 + tw.z * 8); look.set(fb.x, 0, fb.z);
      k = 1 - Math.exp(-dt * 1.5);
    }
  } else if (mode === 'letter') {
    const yaw = Game.player.yaw, f = { x: Math.sin(yaw), z: Math.cos(yaw) };
    pos.set(P.x + f.x * 3.8 + f.z * 0.8, P.y + 1.7, P.z + f.z * 3.8 - f.x * 0.8); look.set(P.x, P.y + 1.15, P.z);
    k = 1 - Math.exp(-dt * 2.5);
  } else { pos.copy(Game.camPos); look.copy(Game.camLook); }
  // keep above ground
  const gy = heightAt(H, pos.x, pos.z);
  if (pos.y < gy + 1.0) pos.y = gy + 1.0;
  if (pos.y < WATER_Y + 1.0) pos.y = WATER_Y + 1.0;
  if (Game.camSnap) { k = 1; Game.camSnap = false; }
  Game.camPos.lerp(pos, k); Game.camLook.lerp(look, k);
  cam.position.copy(Game.camPos);
  cam.lookAt(Game.camLook);
  // sun follows focus
  const focus = (mode === 'flight' || mode === 'settle') ? b : (mode === 'title' || mode === 'intro' || mode === 'finale') ? Game.camLook : P;
  World.sun.target.position.set(focus.x, 0, focus.z);
  World.sun.position.set(focus.x - 40, 85, focus.z + 30);
  const sc = World.sun.shadow.camera; const ext = (mode === 'title' || (mode === 'intro' && Game.introT < INTRO.over + 1.6)) ? 120 : 45;
  if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
}

function update(dt) {
  Game.t += dt;
  animateWorld(dt);
  if (Game.camDrag > 0) Game.camDrag -= dt;
  const mode = Game.mode;
  if (mode === 'intro') updateIntro(dt);
  if (mode === 'walk') { updatePlayer(dt); autoOpenLetter(); } else Game.player.speed = 0;
  if (mode === 'aim') updateAim(dt);
  if (mode === 'swing') updateSwing(dt);
  if (mode === 'flight' || mode === 'settle') {
    updateFollowThrough(dt);
    Game.watchT += dt;
    if (mode === 'flight' && ballStopped()) { Game.mode = 'settle'; Game.waitT = 0; }
    if (Game.mode === 'settle') { Game.waitT += dt; if (Game.waitT > (Game.ball.outcome === 'holed' ? 0.5 : 1.1)) resolveShot(); }
  }
  if (mode === 'holed') { Game.holedT += dt; if (Game.holedT > 2.2) { if (Game.H.isle) startFinale(); else finishHole(); } }
  if (mode === 'finale') updateFinaleCine(dt);
  updateFinaleWorld(dt);
  updateBall(dt);
  golfer.update(dt, { speed: clamp(Game.player.speed / 15, 0, 1), swing: Game.swing, watching: (mode === 'flight' || mode === 'settle') && Game.watchT > 0.9 });
  updateCamera(dt);
  updateFX(dt);
  if (mode === 'walk' || mode === 'aim' || mode === 'title' || mode === 'intro') { FX.trailAge = (FX.trailAge || 0) + dt; } else FX.trailAge = 0;
  FX.trail.material.opacity = 1 - smoothstep(2.5, 4.5, FX.trailAge || 0);
  trailUpdate(World.camera);
  UI.update(dt);
}

let lastT = 0, perfAcc = 0, perfN = 0, testFreeze = false;   // tests can freeze the real-time loop and step it by hand
function adaptQuality(rawDt) {
  if (rawDt > 0.2) return;   // one-off hitches (shader compile, app switch) say nothing about steady speed
  perfAcc += rawDt; perfN++;
  if (perfN >= 90) {
    const avg = perfAcc / perfN; perfAcc = 0; perfN = 0;
    const r = World.renderer, pr = r.getPixelRatio(), cap = Math.min(window.devicePixelRatio || 1, QUALITY.maxPR);
    // below ~38 fps step down; go under 1x only when really slow (a 30 fps low-power cap shouldn't blur the game)
    const floor = avg > 0.045 ? QUALITY.minPR : Math.max(1, QUALITY.minPR);
    if (avg > 0.026 && pr > floor) { r.setPixelRatio(Math.max(floor, pr - 0.25)); onResize(); World.qualityDropped = true; }
    else if (avg < 0.0135 && pr < cap && !World.qualityDropped) { r.setPixelRatio(Math.min(cap, pr + 0.25)); onResize(); }
  }
}
// iPhone Safari: no pinch-zoom, double-tap zoom or rubber-band scrolling of the page (overlay cards still scroll)
function lockGestures() {
  const opt = { passive: false };
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), opt));
  document.addEventListener('touchmove', e => {
    if (e.touches.length > 1) { e.preventDefault(); return; }
    const box = e.target.closest && e.target.closest('.letter, .save-card, .sc-card, .how-card');
    if (!box || box.scrollHeight <= box.clientHeight + 1) e.preventDefault();
  }, opt);
  document.addEventListener('dblclick', e => e.preventDefault(), opt);
}
function frame(now) {
  const raw = Math.max(0, (now - lastT) / 1000);
  const dt = Math.min(0.05, raw); lastT = now;
  if (!document.hidden) adaptQuality(raw);
  if (!testFreeze) { try { update(dt); } catch (e) { console.error(e); } }
  World.renderer.render(World.scene, World.camera);
  requestAnimationFrame(frame);
}

// ---------- best scores (per viewer, optional) ----------
const Best = {
  key: 'island-golf.best.v1',
  read() { try { return JSON.parse(localStorage.getItem(this.key) || '{}') || {}; } catch (e) { return {}; } },
  write(o) { try { localStorage.setItem(this.key, JSON.stringify(o)); } catch (e) { } },
  record(i, s) { const o = this.read(); if (!o['h' + i] || s < o['h' + i]) { o['h' + i] = s; this.write(o); } },
  recordRound(s) { const o = this.read(); if (!o.round || s < o.round) { o.round = s; this.write(o); } },
  get(i) { return this.read()['h' + i] || null; },
  round() { return this.read().round || null; },
};

// ---------- sound (tiny WebAudio synth) ----------
const Sound = {
  ctx: null, on: true,
  init() { if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; } try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; } },
  noise(dur, freq, q, gain, type = 'bandpass') {
    const c = this.ctx, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  },
  tone(freq, dur, gain, type = 'sine', when = 0, slide = 0) {
    const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  birthday() {
    if (!this.on || !this.ctx) return;
    const N = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392, A4: 440, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99 };
    const tune = [['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2], ['G4', .75], ['G4', .25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
      ['G4', .75], ['G4', .25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2], ['F5', .75], ['F5', .25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3]];
    let t = 0.15; const beat = 0.4;
    try { for (const [n, d] of tune) { this.tone(N[n], d * beat * 1.6, 0.13, 'triangle', t); this.tone(N[n] * 2, d * beat * 0.8, 0.03, 'sine', t); t += d * beat; } } catch (e) { }
  },
  play(type, p = 1) {
    if (!this.on || !this.ctx) return;
    try {
      switch (type) {
        case 'hit': this.noise(0.08, 3200, 0.8, 0.5 * (0.4 + p)); this.tone(210, 0.12, 0.35, 'triangle', 0, 0.6); break;
        case 'putt': this.tone(950, 0.06, 0.25, 'triangle'); this.noise(0.03, 2500, 1, 0.15); break;
        case 'thud': this.tone(120, 0.12, 0.25, 'sine', 0, 0.5); break;
        case 'sand': this.noise(0.25, 900, 0.6, 0.35); break;
        case 'splash': this.noise(0.6, 700, 0.4, 0.5, 'lowpass'); this.noise(0.3, 2400, 0.7, 0.2); break;
        case 'cup': this.tone(1320, 0.18, 0.25, 'triangle'); this.tone(990, 0.22, 0.25, 'triangle', 0.12); this.tone(1480, 0.3, 0.2, 'sine', 0.26); break;
        case 'knock': this.tone(420, 0.08, 0.3, 'square', 0, 0.5); break;
        case 'leaves': this.noise(0.3, 3500, 0.5, 0.25); break;
        case 'lip': this.tone(700, 0.08, 0.2, 'triangle', 0, 0.7); break;
        case 'ui': this.tone(660, 0.05, 0.12, 'sine'); break;
        case 'launch': this.tone(500, 0.6, 0.04, 'sine', 0, 2.4); break;
        case 'boom': this.noise(0.7, 260, 0.5, 0.35, 'lowpass'); this.tone(70, 0.4, 0.2, 'sine', 0, 0.6); break;
        case 'chest': this.tone(180, 0.35, 0.12, 'square', 0, 0.7); [1046, 1318, 1568, 2093].forEach((f, i) => this.tone(f, 0.5, 0.12, 'triangle', 0.35 + i * 0.09)); break;
        case 'sparkle': [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.35, 0.1, 'triangle', i * 0.07)); break;
        case 'plank': this.tone(240, 0.09, 0.12, 'triangle', 0, 0.8); this.noise(0.12, 1200, 0.8, 0.08); break;
      }
    } catch (e) { }
  },
};

// ---------- boot ----------
function boot() {
  const canvas = document.getElementById('gl');
  lockGestures();
  initWorld(canvas);
  initFX();
  golfer = new Golfer();
  World.scene.add(golfer.root);
  ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 18, 12), new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.15 }));
  ballMesh.castShadow = true;
  World.scene.add(ballMesh);
  UI.init();
  loadHole(0);
  onResize();
  Game.mode = 'title';
  UI.showTitle();
  document.getElementById('loading').hidden = true;
  window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (Game.mode === 'intro' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) { e.preventDefault(); skipIntro(); keys[e.code] = false; return; }
    if (Game.overlay) { if (e.code === 'Escape') UI.closeOverlay(); return; }
    if (e.code === 'KeyM' && (Game.mode === 'walk' || Game.mode === 'aim')) UI.openMap();
    if (e.code === 'Escape' && Game.mode === 'aim') exitAim();
    if (e.code === 'Space') { e.preventDefault(); if (Game.mode === 'walk' && nearBall()) { enterAim(); keys.Space = false; } }
    if (e.code === 'Digit1') setClub('iron');
    if (e.code === 'Digit2') setClub('putter');
  });
  window.addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'Space' && Game.mode === 'aim' && Game.dragging) { releasePower(Game.power); UI.setPower(0, false); }
  });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
  requestAnimationFrame(t => { lastT = t; requestAnimationFrame(frame); });
}

// test hooks
window.__golf = { Game, World, UI, INTRO, freeze(on = true) { testFreeze = on; }, startFinale, skipFinale, skipIntro, collectLetter, closeLetter, rollWind, step(n, dt = 1 / 60) { for (let i = 0; i < n; i++) update(dt); World.renderer.render(World.scene, World.camera); }, render() { World.renderer.render(World.scene, World.camera); }, get golfer() { return golfer; }, loadHole, startHole, startRound, enterAim, releasePower, setClub, zoneAt, heightAt, teleportToBall,
  shoot(power, yaw, club) { if (Game.mode !== 'aim') { teleportToBall(); enterAim(); } if (club) setClub(club); if (yaw !== undefined) Game.aimYaw = yaw; placeGolferAtAddress(); releasePower(power); },
};
