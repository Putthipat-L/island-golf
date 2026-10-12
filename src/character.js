// ============================================================
// character.js — stylized "mom" avatar (sculpted, not photo)
// Golfer API: setClub, setPose, update(dt, {speed, swing, watching}), cheer, wave.
// ============================================================
const LOOK = {
  skin: '#f3cbb2', skinD: '#e5a98f', shirt: '#f6f7f9', jeans: '#86a6d4', jeansD: '#7393c2',
  shoe: '#f4f4f2', sole: '#c4cad1', hair: '#5a3d38', hairHi: '#7b544c', hairDk: '#46302c',
  brow: '#6a4740', eye: '#3b2723', frame: '#8e959d', silver: '#dfe3e8',
};
const HEAD_R = 0.37;
const _matCache = {};
function cmat(c) { return _matCache[c] || (_matCache[c] = new THREE.MeshLambertMaterial({ color: c })); }
function cmesh(geo, color) { const m = new THREE.Mesh(geo, cmat(color)); m.castShadow = true; return m; }
function limb(a, b, r0, r1, color) {
  const d = new THREE.Vector3().subVectors(b, a); const L = d.length();
  const m = cmesh(new THREE.CylinderGeometry(r1, r0, L, 10), color);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  return m;
}
function makeClub(key, len) {
  const g = new THREE.Group();
  const grip = cmesh(new THREE.CylinderGeometry(0.024, 0.021, 0.22, 8), '#23272d'); grip.position.y = -0.09; g.add(grip);
  const shaft = cmesh(new THREE.CylinderGeometry(0.012, 0.009, len - 0.2, 6), '#cfd6dc'); shaft.position.y = -0.2 - (len - 0.2) / 2; g.add(shaft);
  if (key === 'iron') {
    const head = cmesh(new THREE.BoxGeometry(0.04, 0.075, 0.17), '#a7b0b8'); head.position.set(0, -len, 0.06); g.add(head);
  } else {
    const head = cmesh(new THREE.BoxGeometry(0.07, 0.05, 0.16), '#3b4048'); head.position.set(0, -len + 0.005, 0.05); g.add(head);
    const sight = cmesh(new THREE.BoxGeometry(0.072, 0.052, 0.012), '#f6f2e8'); sight.position.set(0, -len + 0.006, 0.05); g.add(sight);
  }
  return g;
}

// ---- face: painted features on a front cap, designed in head coordinates ----
// head-local x (viewer's right = +x), y up; the cap spans these sphere angles:
const FACE_CAP = { phi0: Math.PI / 2 - 0.9, phiL: 1.8, th0: 0.95, thL: 1.45 };
function faceUV(x, y, R) {
  const th = Math.acos(clamp(y / R, -1, 1));
  const ph = Math.PI / 2 + Math.asin(clamp(x / (R * Math.sin(th)), -1, 1));
  return [(ph - FACE_CAP.phi0) / FACE_CAP.phiL, (th - FACE_CAP.th0) / FACE_CAP.thL];
}
function makeFaceCanvas() {
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); const R = HEAD_R;
  const P = (x, y) => { const [u, v] = faceUV(x, y, R); return [u * S, v * S]; };
  const path = (pts, close) => { g.beginPath(); pts.forEach(([x, y], i) => { const [px, py] = P(x, y); i ? g.lineTo(px, py) : g.moveTo(px, py); }); if (close) g.closePath(); };
  const arc = (cx, cy, rx, ry, a0, a1, n = 24) => { const out = []; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return out; };
  const px = 1024 / (R * FACE_CAP.phiL); // pixels per head unit (approx)
  // blush
  for (const s of [-1, 1]) {
    const [bx, by] = P(0.185 * s, -0.07);
    const gr = g.createRadialGradient(bx, by, 0, bx, by, 0.065 * px);
    gr.addColorStop(0, 'rgba(240,140,140,0.55)'); gr.addColorStop(1, 'rgba(240,140,140,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(bx, by, 0.075 * px, 0.05 * px, 0, 0, Math.PI * 2); g.fill();
  }
  // soft smile lines
  g.strokeStyle = 'rgba(205,125,110,0.32)'; g.lineWidth = 0.008 * px; g.lineCap = 'round'; g.lineJoin = 'round';
  const qb = (a, b, c, n = 10) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u * u * a[0] + 2 * u * t * b[0] + t * t * c[0], u * u * a[1] + 2 * u * t * b[1] + t * t * c[1]]); } return o; };
  // (smile lines removed — they read as brackets at game scale)
  // eyebrows: soft, slightly arched, thin
  g.strokeStyle = LOOK.brow; g.lineWidth = 0.014 * px;
  for (const s of [-1, 1]) { path(qb([0.055 * s, 0.122], [0.11 * s, 0.152], [0.165 * s, 0.125], 16)); g.stroke(); }
  // smiling eyes: rounded top, lower lid lifted (happy squint) + highlight + outer lash
  for (const s of [-1, 1]) {
    const cx = 0.112 * s, cy = 0.022, rx = 0.031;
    g.fillStyle = LOOK.eye; path(arc(cx, cy, rx, 0.037, 0, Math.PI, 20).concat(arc(cx, cy - 0.004, rx, 0.006, Math.PI, 0, 20)), true); g.fill();
    g.strokeStyle = LOOK.eye; g.lineWidth = 0.009 * px; path([[cx + s * (rx - 0.004), cy + 0.004], [cx + s * (rx + 0.012), cy + 0.016]]); g.stroke();
    const [hx, hy] = P(cx - 0.01, cy + 0.022);
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.arc(hx, hy, 0.0075 * px, 0, Math.PI * 2); g.fill();
  }
  // nose hint
  g.strokeStyle = 'rgba(190,118,98,0.55)'; g.lineWidth = 0.008 * px;
  path(arc(0, -0.038, 0.017, 0.009, Math.PI * 1.15, Math.PI * 1.85, 10)); g.stroke();
  // big open smile with upper teeth
  const mouthTop = [], mouthBot = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24, x = -0.074 + t * 0.148; mouthTop.push([x, -0.098 + Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.016]); }
  for (let i = 24; i >= 0; i--) { const t = i / 24, x = -0.074 + t * 0.148; mouthBot.push([x, -0.098 - Math.sin(t * Math.PI) * 0.06 + Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.016]); }
  g.fillStyle = '#a3424c'; path(mouthTop.concat(mouthBot), true); g.fill();
  // tongue
  g.save(); path(mouthTop.concat(mouthBot), true); g.clip();
  const [tx, ty] = P(0, -0.152); g.fillStyle = '#e07c84'; g.beginPath(); g.ellipse(tx, ty, 0.05 * px, 0.026 * px, 0, 0, Math.PI * 2); g.fill();
  // upper teeth band
  const teeth = mouthTop.map(([x, y]) => [x, y + 0.002]);
  for (let i = 24; i >= 0; i--) { const t = i / 24, x = -0.074 + t * 0.148; teeth.push([x, -0.098 + Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.016 - 0.026 * Math.pow(Math.sin(t * Math.PI), 0.6)]); }
  g.fillStyle = '#ffffff'; path(teeth, true); g.fill();
  g.restore();
  g.strokeStyle = '#c45f65'; g.lineWidth = 0.007 * px; path(mouthTop.concat(mouthBot), true); g.stroke();
  return c;
}

// tapered tube along a curve (hair strands)
function strandGeo(points, r0, r1, segs = 28, radial = 9) {
  const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)), false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, segs, 1, radial, false);
  const pos = geo.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs; curve.getPointAt(t, c);
    const r = lerp(r0, r1, t) * Math.min(1, 0.12 + t * 9) * (t > 0.86 ? Math.max(0.15, 1 - (t - 0.86) * 6) : 1);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j; v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c); pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}
// wavy strand helper: start → end with lateral waves along a side vector
function wavy(a, b, mids, side, amp, waves) {
  const pts = [a, ...mids, b]; const out = [];
  const n = 9;
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)));
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), w = Math.sin(t * Math.PI * waves) * amp * Math.min(1, t * 2.2);
    out.push([p.x + side[0] * w, p.y + side[1] * w, p.z + side[2] * w]);
  }
  return out;
}

function buildMomHead(head) {
  const L = LOOK, R = HEAD_R;
  const skull = cmesh(new THREE.SphereGeometry(R, 40, 30), L.skin); head.add(skull);
  // painted face
  const tex = new THREE.CanvasTexture(makeFaceCanvas()); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const faceMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const fc = FACE_CAP;
  const face = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0, 48, 36, fc.phi0, fc.phiL, fc.th0, fc.thL), faceMat);
  face.renderOrder = 2;
  // the cap sits on the unscaled sphere; push it to sit over cheeks too
  face.scale.setScalar(1.004); head.add(face);
  // nose
  const nose = cmesh(new THREE.SphereGeometry(0.034, 14, 10), L.skinD); nose.position.set(0, -0.025, R * 0.955); nose.scale.set(1.1, 0.9, 0.8); head.add(nose);
  // ears
  for (const s of [-1, 1]) { const ear = cmesh(new THREE.SphereGeometry(0.06, 10, 8), L.skin); ear.position.set(0.352 * s, -0.01, 0.0); ear.scale.set(0.6, 1, 0.85); head.add(ear); }
  // glasses: thin rounded-rectangle frames wrapped slightly around the face
  const glasses = new THREE.Group(); head.add(glasses);
  const frameMat = new THREE.MeshLambertMaterial({ color: L.frame });
  const Rg = R + 0.045;
  const onG = (x, y) => new THREE.Vector3(x, y, Math.sqrt(Math.max(0.001, Rg * Rg - x * x - y * y)) - 0.012);
  const rrect = (cx, cy, w, h, r) => {
    const pts = []; const seg = 6;
    const corners = [[cx + w / 2 - r, cy + h / 2 - r, 0], [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2], [cx - w / 2 + r, cy - h / 2 + r, Math.PI], [cx + w / 2 - r, cy - h / 2 + r, Math.PI * 1.5]];
    for (const [qx, qy, a0] of corners) for (let i = 0; i <= seg; i++) { const a = a0 + (Math.PI / 2) * i / seg; pts.push(onG(qx + Math.cos(a) * r, qy + Math.sin(a) * r)); }
    return pts;
  };
  for (const s of [-1, 1]) {
    const pts = rrect(0.112 * s, 0.035, 0.138, 0.088, 0.03);
    const curve = new THREE.CatmullRomCurve3(pts, true);
    const rim = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.0055, 6, true), frameMat); glasses.add(rim);
    // lens with a little shine
    const shape = new THREE.Shape(); const w = 0.13, h = 0.08, r = 0.027, cx = 0.112 * s, cy = 0.035;
    shape.moveTo(cx - w / 2 + r, cy - h / 2); shape.lineTo(cx + w / 2 - r, cy - h / 2); shape.quadraticCurveTo(cx + w / 2, cy - h / 2, cx + w / 2, cy - h / 2 + r);
    shape.lineTo(cx + w / 2, cy + h / 2 - r); shape.quadraticCurveTo(cx + w / 2, cy + h / 2, cx + w / 2 - r, cy + h / 2); shape.lineTo(cx - w / 2 + r, cy + h / 2);
    shape.quadraticCurveTo(cx - w / 2, cy + h / 2, cx - w / 2, cy + h / 2 - r); shape.lineTo(cx - w / 2, cy - h / 2 + r); shape.quadraticCurveTo(cx - w / 2, cy - h / 2, cx - w / 2 + r, cy - h / 2);
    const lg = new THREE.ShapeGeometry(shape, 8); const lp = lg.attributes.position;
    for (let i = 0; i < lp.count; i++) { const q = onG(lp.getX(i), lp.getY(i)); lp.setZ(i, q.z); }
    const lens = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: '#dff0ff', transparent: true, opacity: 0.16, depthWrite: false })); glasses.add(lens);
    const shine = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.07), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false }));
    const sp = onG(cx + 0.03 * s, cy + 0.008); shine.position.copy(sp).add(new THREE.Vector3(0, 0, 0.003)); shine.rotation.z = -0.6; shine.rotation.y = 0.32 * s; glasses.add(shine);
    // temple arm back toward the ear
    const tp = [onG(0.18 * s, 0.05), new THREE.Vector3(0.3 * s, 0.05, 0.2), new THREE.Vector3(0.375 * s, 0.03, 0.02)];
    glasses.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(tp), 12, 0.006, 5, false), frameMat));
  }
  const bridge = new THREE.CatmullRomCurve3([onG(-0.044, 0.05), onG(0, 0.06), onG(0.044, 0.05)]);
  glasses.add(new THREE.Mesh(new THREE.TubeGeometry(bridge, 10, 0.005, 5, false), frameMat));

  // hair — crown cap, a wavy shoulder-length shell open at the face, side-swept fringe, face-framing waves
  const hm = c => new THREE.MeshLambertMaterial({ color: c, side: THREE.DoubleSide });
  const hairM = hm(L.hair), hiM = hm(L.hairHi), dkM = hm(L.hairDk);
  const shellM = new THREE.MeshLambertMaterial({ color: L.hair, side: THREE.DoubleSide });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(R * 1.06, 40, 16, 0, Math.PI * 2, 0, 0.95), hairM); cap.position.set(0, 0.008, -0.01); cap.castShadow = true; head.add(cap);
  // lathe profile (radius, y) from the crown down past the jaw to the shoulders
  const prof = [[0.05, 0.4], [0.2, 0.36], [0.31, 0.27], [0.385, 0.13], [0.405, -0.02], [0.41, -0.16], [0.425, -0.28], [0.45, -0.38], [0.47, -0.43]];
  const lath = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 64, 0.88, Math.PI * 2 - 1.76);
  { const p = lath.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const phi = Math.atan2(v.x, v.z), low = smoothstep(0.1, -0.35, v.y);
      const k = 1 + low * (0.06 * Math.sin(phi * 9 + v.y * 9) + 0.03 * Math.sin(phi * 17));
      v.x *= k; v.z *= k; v.z -= 0.02 * low;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    lath.computeVertexNormals(); }
  const shell = new THREE.Mesh(lath, shellM); shell.castShadow = true; head.add(shell);
  const add = (pts, r0, r1, m) => { const sm = new THREE.Mesh(strandGeo(pts, r0, r1), m); sm.castShadow = true; head.add(sm); return sm; };
  // fringe from a part on her right (viewer's left) sweeping across the forehead
  add([[-0.08, 0.39, 0.05], [-0.03, 0.36, 0.22], [0.07, 0.29, 0.31], [0.19, 0.22, 0.3], [0.3, 0.1, 0.24], [0.36, -0.05, 0.19]], 0.065, 0.05, hairM);
  add([[-0.06, 0.4, -0.02], [0.02, 0.38, 0.19], [0.13, 0.32, 0.27], [0.25, 0.22, 0.27], [0.34, 0.08, 0.2]], 0.06, 0.04, hiM);
  add([[-0.1, 0.385, 0.08], [-0.13, 0.33, 0.24], [-0.22, 0.24, 0.26], [-0.31, 0.11, 0.22], [-0.37, -0.03, 0.17]], 0.055, 0.045, hairM);
  // face-framing waves that rest in front of the shoulders
  for (const s of [-1, 1]) {
    add(wavy([0.33 * s, 0.12, 0.19], [0.37 * s, -0.42, 0.14], [[0.385 * s, -0.08, 0.17], [0.39 * s, -0.26, 0.15]], [s, 0, 0.3], 0.028, 2.2), 0.07, 0.05, s > 0 ? hiM : hairM);
    add(wavy([0.36 * s, 0.1, 0.08], [0.42 * s, -0.43, 0.06], [[0.41 * s, -0.08, 0.08], [0.42 * s, -0.27, 0.07]], [s, 0, 0], 0.03, 2.4), 0.075, 0.05, dkM);
    add([[0.36 * s, -0.36, 0.13], [0.41 * s, -0.45, 0.16], [0.47 * s, -0.45, 0.17]], 0.045, 0.03, hiM);
  }
  // a few highlight waves on the back
  for (let i = 0; i < 5; i++) {
    const a = -0.8 + i * 0.4, x = Math.sin(a), z = -Math.cos(a);
    add(wavy([x * 0.2, 0.36, z * 0.22], [x * 0.47, -0.42, z * 0.47], [[x * 0.42, 0.1, z * 0.42], [x * 0.44, -0.18, z * 0.44]], [Math.cos(a), 0, Math.sin(a)], 0.025, 2.2), 0.05, 0.035, i % 2 ? hiM : dkM);
  }
  return head;
}

class Golfer {
  constructor() {
    const L = LOOK;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); this.root.add(this.body);
    this.t = 0; this.phase = 0; this.amp = 0; this.pose = 'walk'; this.club = 'iron'; this.cheer = 0; this.wave = 0;
    this.legs = [];
    for (const s of [1, -1]) {
      const p = new THREE.Group(); p.position.set(0.12 * s, 0.5, 0); p.name = s > 0 ? 'legL' : 'legR';
      const leg = cmesh(new THREE.CylinderGeometry(0.088, 0.072, 0.42, 10), L.jeans); leg.position.y = -0.2; p.add(leg);
      const cuff = cmesh(new THREE.CylinderGeometry(0.075, 0.075, 0.04, 10), L.jeansD); cuff.position.y = -0.39; p.add(cuff);
      const shoe = cmesh(new THREE.SphereGeometry(1, 14, 10), L.shoe); shoe.scale.set(0.095, 0.07, 0.16); shoe.position.set(0, -0.43, 0.04); p.add(shoe);
      const sole = cmesh(new THREE.CylinderGeometry(1, 1, 1, 14), L.sole); sole.scale.set(0.095, 0.025, 0.16); sole.position.set(0, -0.485, 0.04); p.add(sole);
      this.body.add(p); this.legs.push(p);
    }
    const hips = cmesh(new THREE.CylinderGeometry(0.19, 0.21, 0.2, 14), L.jeans); hips.position.y = 0.56; this.body.add(hips);
    this.upper = new THREE.Group(); this.upper.position.y = 0.62; this.body.add(this.upper);
    const torso = cmesh(new THREE.CapsuleGeometry(0.205, 0.15, 4, 14), L.shirt); torso.position.y = 0.17; torso.scale.set(1, 1, 0.86); this.upper.add(torso);
    const hem = cmesh(new THREE.CylinderGeometry(0.212, 0.218, 0.06, 16), L.shirt); hem.position.y = -0.02; hem.scale.z = 0.9; this.upper.add(hem);
    const collar = cmesh(new THREE.TorusGeometry(0.085, 0.014, 6, 18), '#eceef2'); collar.rotation.x = Math.PI / 2; collar.position.y = 0.38; this.upper.add(collar);
    const neck = cmesh(new THREE.CylinderGeometry(0.07, 0.08, 0.12, 10), L.skin); neck.position.y = 0.4; this.upper.add(neck);
    const chain = cmesh(new THREE.TorusGeometry(0.1, 0.006, 6, 24), L.silver); chain.rotation.x = Math.PI / 2 - 0.45; chain.position.set(0, 0.35, 0.03); this.upper.add(chain);
    this.head = new THREE.Group(); this.head.position.y = 0.74; this.upper.add(this.head);
    buildMomHead(this.head);
    this.walkArms = new THREE.Group(); this.upper.add(this.walkArms);
    this.arms = [];
    for (const s of [1, -1]) {
      const p = new THREE.Group(); p.position.set(0.245 * s, 0.35, 0); p.rotation.z = 0.14 * s; p.name = s > 0 ? 'armL' : 'armR';
      const sleeve = cmesh(new THREE.CylinderGeometry(0.088, 0.082, 0.17, 10), L.shirt); sleeve.position.y = -0.06; p.add(sleeve);
      const arm = cmesh(new THREE.CylinderGeometry(0.05, 0.046, 0.25, 10), L.skin); arm.position.y = -0.22; p.add(arm);
      const hand = cmesh(new THREE.SphereGeometry(0.06, 10, 8), L.skin); hand.position.y = -0.36; p.add(hand);
      this.walkArms.add(p); this.arms.push(p);
    }
    this.walkClubHolder = new THREE.Group(); this.walkClubHolder.position.y = -0.36; this.walkClubHolder.rotation.x = 0.95; this.arms[1].add(this.walkClubHolder);
    const sh = new THREE.Vector3(0, 0.98, 0.02);
    const tgt = new THREE.Vector3(0, 0.055, ADDR_DIST);
    const v = tgt.clone().sub(sh); this.reach = v.length();
    this.swingPivot = new THREE.Group(); this.swingPivot.position.copy(sh);
    this.swingPivot.rotation.x = -Math.atan2(v.z, -v.y);
    this.body.add(this.swingPivot);
    this.swingArm = new THREE.Group(); this.swingPivot.add(this.swingArm);
    const hand = new THREE.Vector3(0, -0.47, 0);
    for (const s of [1, -1]) {
      const sp = new THREE.Vector3(0.2 * s, 0, 0);
      this.swingArm.add(limb(sp, new THREE.Vector3(0.12 * s, -0.13, 0.02), 0.088, 0.082, L.shirt));
      this.swingArm.add(limb(new THREE.Vector3(0.12 * s, -0.13, 0.02), new THREE.Vector3(0.03 * s, -0.44, 0), 0.049, 0.045, L.skin));
    }
    const hands = cmesh(new THREE.SphereGeometry(0.075, 10, 8), L.skin); hands.position.copy(hand); this.swingArm.add(hands);
    this.swingClubHolder = new THREE.Group(); this.swingClubHolder.position.set(0, -0.44, 0); this.swingArm.add(this.swingClubHolder);
    this.setClub('iron');
    this.setPose('walk');
  }
  setClub(key) {
    this.club = key;
    this.walkClubHolder.clear(); this.swingClubHolder.clear();
    this.walkClubHolder.add(makeClub(key, key === 'iron' ? 0.82 : 0.78));
    this.swingClubHolder.add(makeClub(key, this.reach - 0.44));
  }
  setPose(p) {
    this.pose = p;
    this.walkArms.visible = p === 'walk';
    this.swingPivot.visible = p === 'address';
  }
  update(dt, st) {
    this.t += dt;
    this.amp = lerp(this.amp, st.speed || 0, 1 - Math.exp(-dt * 10));
    const a = this.amp;
    if (this.pose === 'walk') {
      if (a > 0.02) this.phase += dt * (5.5 + 8.5 * a);
      const s = Math.sin(this.phase);
      this.legs[0].rotation.x = s * 0.85 * a; this.legs[1].rotation.x = -s * 0.85 * a;
      this.arms[0].rotation.x = -s * 0.75 * a; this.arms[1].rotation.x = s * 0.45 * a;
      this.arms[0].rotation.z = 0.14; this.arms[1].rotation.z = -0.14;
      this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.085 * a + Math.sin(this.t * 2.4) * 0.006 * (1 - a);
      this.body.rotation.z = s * 0.05 * a; this.body.rotation.x = 0.1 * a;
      this.upper.rotation.y = 0; this.head.rotation.set(0, 0, Math.sin(this.t * 1.3) * 0.02 * (1 - a));
      if (this.wave > 0) {
        this.wave -= dt;
        this.arms[0].rotation.x = -2.55; this.arms[0].rotation.z = 0.35 + Math.sin(this.t * 9) * 0.35;
        this.head.rotation.z = 0.08;
      }
      if (this.cheer > 0) {
        this.cheer -= dt;
        const j = Math.abs(Math.sin(this.t * 9));
        this.body.position.y = j * 0.35;
        this.arms[0].rotation.x = -2.7 + Math.sin(this.t * 18) * 0.15; this.arms[1].rotation.x = -2.7 - Math.sin(this.t * 18) * 0.15;
        this.arms[0].rotation.z = 0.35; this.arms[1].rotation.z = -0.35;
        this.legs[0].rotation.x = -j * 0.3; this.legs[1].rotation.x = -j * 0.3;
      }
    } else {
      this.legs[0].rotation.x = 0; this.legs[1].rotation.x = 0;
      this.body.position.y = 0; this.body.rotation.set(0, 0, 0);
      this.swingArm.rotation.z = st.swing;
      this.upper.rotation.y = clamp(st.swing, -2.4, 2.4) * 0.2;
      this.head.rotation.x = st.watching ? 0.05 : 0.22;
      this.head.rotation.y = st.watching ? clamp(st.swing, -2.4, 2.4) * 0.12 + 0.6 : -clamp(st.swing, -2.4, 2.4) * 0.16;
    }
  }
}
