// ============================================================
// ui.js — sticks, power bar, HUD, markers, maps, scorecard, menus
// ============================================================
const $ = id => document.getElementById(id);

class Stick {
  constructor(el, axisX) {
    this.el = el; this.knob = el.querySelector('.knob'); this.axisX = axisX; this.x = 0; this.y = 0; this.id = null;
    el.addEventListener('pointerdown', e => {
      if (this.id !== null) return;
      this.id = e.pointerId; try { el.setPointerCapture(e.pointerId); } catch (_) { }
      this.rect = el.getBoundingClientRect(); el.classList.add('active'); this.move(e); e.preventDefault(); e.stopPropagation();
      Sound.init();
    });
    el.addEventListener('pointermove', e => { if (e.pointerId === this.id) this.move(e); });
    const end = e => { if (e.pointerId !== this.id) return; this.id = null; this.x = 0; this.y = 0; this.render(); el.classList.remove('active'); };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end); el.addEventListener('lostpointercapture', end);
  }
  move(e) {
    const r = this.rect, R = r.width / 2 * 0.62;
    let dx = (e.clientX - (r.left + r.width / 2)) / R, dy = (e.clientY - (r.top + r.height / 2)) / R;
    if (this.axisX) dy = 0;
    const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; }
    this.x = dx; this.y = -dy; this.render();
  }
  reset() { this.id = null; this.x = 0; this.y = 0; this.render(); this.el.classList.remove('active'); }
  render() {
    const R = this.el.offsetWidth / 2 * 0.62;
    this.knob.style.transform = `translate(calc(-50% + ${(this.x * R).toFixed(1)}px), calc(-50% + ${(-this.y * R).toFixed(1)}px))`;
  }
}

const UI = {
  stickL: { x: 0, y: 0 }, stickR: { x: 0, y: 0 }, map: null, miniT: 0, hudT: 0, toastT: null,

  init() {
    this.el = {
      hud: $('hud'), aim: $('aim-ui'), addr: $('btn-address'), toast: $('toast'), stickL: $('stick-l'),
      hcNum: $('hc-num'), hcName: $('hc-name'), hcMeta: $('hc-meta'), hcStrokes: $('hc-strokes'), hcPin: $('hc-pin'), hcLie: $('hc-lie'),
      pwFill: $('pw-fill'), pwHandle: $('pw-handle'), pwPct: $('pw-pct'), pwYds: $('pw-yds'), pwTrack: $('pw-track'),
      mkFlag: $('mk-flag'), mkBall: $('mk-ball'), mkLand: $('mk-land'), mkGift: $('mk-gift'),
      wind: $('wind'), windArrow: $('wind-arrow'), windSpeed: $('wind-speed'),
      mini: $('minimap'), mapOv: $('map-ov'), mapCanvas: $('map-canvas'),
    };
    this.stickL = new Stick($('stick-l'), false);
    this.stickR = new Stick($('stick-r'), true);
    this.initPower();
    // buttons
    this.el.addr.addEventListener('click', () => { if (this.el.addr.classList.contains('letter')) collectLetter(); else enterAim(); });
    $('cine').addEventListener('pointerdown', () => { if (Game.mode === 'intro') skipIntro(); else skipFinale(); });
    $('lt-save').addEventListener('click', () => this.saveImage());
    $('lt-score').addEventListener('click', () => { this.hideLetter(); Game.finStage = 'done'; Game.mode = 'scorecard'; this.showScorecard(Game.H, Game.round, !!Game.roundDone); });
    $('lt-close').addEventListener('click', () => closeLetter());
    $('save-close').addEventListener('click', () => { $('save-ov').hidden = true; });
    $('save-dl').addEventListener('click', () => this.downloadImage());
    try { if (window.claude && typeof window.claude.use === 'function') window.claude.use('downloads').then(d => { this.downloads = d; }).catch(() => { }); } catch (e) { }
    $('btn-exit').addEventListener('click', () => exitAim());
    document.querySelectorAll('.pill.club').forEach(b => b.addEventListener('click', () => setClub(b.dataset.club)));
    $('btn-map').addEventListener('click', () => this.openMap());
    $('map-close').addEventListener('click', () => this.closeOverlay());
    $('map-clear').addEventListener('click', () => { Game.mark = null; this.drawBigMap(); });
    $('map-aim').addEventListener('click', () => {
      if (Game.mark && Game.mode === 'aim') { Game.aimYaw = Math.atan2(Game.mark.x - Game.ball.p.x, Game.mark.z - Game.ball.p.z); placeGolferAtAddress(); }
      this.closeOverlay();
    });
    $('btn-menu').addEventListener('click', () => this.openOverlay('menu-ov'));
    $('m-resume').addEventListener('click', () => this.closeOverlay());
    $('m-warp').addEventListener('click', () => { this.closeOverlay(); if (Game.mode === 'aim') exitAim(); if (Game.mode === 'walk') teleportToBall(); });
    $('m-restart').addEventListener('click', () => { this.closeOverlay(); replayHole(); });
    $('m-how').addEventListener('click', () => { this.closeOverlay(); this.openOverlay('howto'); });
    $('m-sound').addEventListener('click', () => { Sound.on = !Sound.on; $('m-sound').textContent = 'เสียง: ' + (Sound.on ? 'เปิด' : 'ปิด'); });
    $('m-home').addEventListener('click', () => { this.closeOverlay(); goTitle(); });
    $('btn-play').addEventListener('click', () => { $('title').hidden = true; startRound('round', 0); });
    $('btn-how').addEventListener('click', () => this.openOverlay('howto'));
    $('how-close').addEventListener('click', () => this.closeOverlay());
    $('intro').addEventListener('pointerdown', () => skipIntro());
    // overlay backdrop click closes (map/menu/howto)
    ['map-ov', 'menu-ov', 'howto'].forEach(id => $(id).addEventListener('pointerdown', e => { if (e.target.id === id) this.closeOverlay(); }));
    // camera drag on the scene
    const cv = $('gl'); let dragId = null, lastX = 0;
    cv.addEventListener('pointerdown', e => { if (Game.mode !== 'walk' || dragId !== null) return; dragId = e.pointerId; lastX = e.clientX; try { cv.setPointerCapture(e.pointerId); } catch (_) { } Sound.init(); });
    cv.addEventListener('pointermove', e => { if (e.pointerId !== dragId) return; Game.camYaw -= (e.clientX - lastX) * 0.007; lastX = e.clientX; Game.camDrag = 0.8; });
    const endDrag = e => { if (e.pointerId === dragId) dragId = null; };
    cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
    // map canvas
    this.el.mapCanvas.addEventListener('pointerdown', e => this.onMapTap(e));
    // hole cards on title
    const th = $('t-holes');
    HOLES_RAW.forEach((h, i) => {
      const b = document.createElement('button'); b.className = 't-hole';
      b.innerHTML = `<span class="n">${i + 1}</span><span><b>${h.name}</b><span>Par ${h.par} · ${h.yards} หลา<span class="best" data-i="${i}"></span></span></span>`;
      b.addEventListener('click', () => { $('title').hidden = true; startRound('single', i); });
      th.appendChild(b);
    });
    window.addEventListener('resize', () => { this.sizeMini(); if (Game.overlay === 'map-ov') this.drawBigMap(); });
    this.sizeMini();
    const mq = () => { $('rotate-hint').hidden = !(window.innerHeight > window.innerWidth * 1.15 && window.innerWidth < 700 && Game.mode !== 'title'); };
    window.addEventListener('resize', mq); this.rotateCheck = mq;
  },

  initPower() {
    const tr = this.el.pwTrack; let id = null, y0 = 0;
    tr.addEventListener('pointerdown', e => {
      if (Game.mode !== 'aim' || id !== null) return;
      id = e.pointerId; y0 = e.clientY; try { tr.setPointerCapture(id); } catch (_) { }
      Game.dragging = true; Game.power = 0; this.setPower(0, true); e.preventDefault(); Sound.init();
    });
    tr.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const h = tr.clientHeight * 0.9;
      Game.power = clamp((e.clientY - y0) / h, 0, 1);
      this.setPower(Game.power, true);
    });
    const end = e => {
      if (e.pointerId !== id) return; id = null;
      const p = Game.power; this.setPower(0, false);
      releasePower(p);
    };
    tr.addEventListener('pointerup', end); tr.addEventListener('pointercancel', end);
  },
  setPower(p, dragging) {
    const tr = this.el.pwTrack, h = tr.clientHeight;
    this.el.pwFill.style.height = (p * 100).toFixed(1) + '%';
    this.el.pwFill.style.setProperty('--pw-h', h + 'px');
    this.el.pwHandle.style.top = (p * (h - 26)).toFixed(1) + 'px';
    if (dragging || p > 0) {
      this.el.pwPct.textContent = Math.round(p * 100) + '%';
      this.el.pwYds.textContent = '~' + Math.round(p * maxDistance(Game.club)) + 'y';
    } else {
      this.el.pwPct.textContent = Math.round(maxDistance(Game.club)) + 'y';
      this.el.pwYds.textContent = 'ลากลง';
    }
  },

  setHUD(on) { this.el.hud.hidden = !on; if (on) this.sizeMini(); if (this.rotateCheck) this.rotateCheck(); },
  setAimUI(on) {
    this.el.aim.hidden = !on;
    this.el.stickL.classList.toggle('off', on);
    if (!on) { this.stickR.reset(); } else { this.stickL.reset(); this.setPower(0, false); }
  },
  setClub(key, inBunker) {
    document.querySelectorAll('.pill.club').forEach(b => { b.classList.toggle('on', b.dataset.club === key); b.disabled = b.dataset.club === 'putter' && inBunker; });
    const z = ballZone();
    $('max-iron').textContent = Math.round(CLUBS.iron.max * LIE_FACTOR[z]) + 'y';
    $('max-putter').textContent = Math.round(CLUBS.putter.max * LIE_FACTOR[z]) + 'y';
    this.setPower(0, false);
  },
  toast(msg, kind) {
    const t = this.el.toast; t.hidden = true; void t.offsetWidth;
    t.textContent = msg; t.className = kind || ''; t.hidden = false;
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { t.hidden = true; }, 2300);
  },
  refreshHUD() {
    const H = Game.H; if (!H) return;
    const e = this.el;
    e.hcNum.textContent = H.index + 1;
    e.hcName.textContent = H.name;
    e.hcMeta.textContent = `Par ${H.par} · ${H.yards} หลา`;
    e.hcStrokes.textContent = Game.strokes;
    e.hcPin.textContent = Math.round(distBallToCup()) + 'y';
    const z = Game.ball.state === 'rest' ? ballZone() : null;
    if (z !== null) { e.hcLie.textContent = z === ZONE.TEE ? 'Tee' : ZONE_LABEL[z] + (LIE_FACTOR[z] < 1 ? ` · แรง −${Math.round((1 - LIE_FACTOR[z]) * 100)}%` : ''); e.hcLie.dataset.z = z; }
  },

  hideOverlays() { ['map-ov', 'menu-ov', 'howto', 'scorecard', 'intro'].forEach(id => $(id).hidden = true); Game.overlay = null; },
  openOverlay(id) { this.hideOverlays(); $(id).hidden = false; Game.overlay = id; Sound.play('ui'); },
  closeOverlay() { const id = Game.overlay; if (id && id !== 'scorecard') $(id).hidden = true; Game.overlay = null; },

  showTitle() {
    $('title').hidden = false; this.setHUD(false);
    document.querySelectorAll('.t-hole .best').forEach(s => { const b = Best.get(+s.dataset.i); s.textContent = b ? ` · ดีที่สุด ${b}` : ''; });
    const r = Best.round(); $('t-best').textContent = r ? `สกอร์รวมดีที่สุด 3 หลุม: ${r} สโตรก (Par 12)` : '';
    if (this.rotateCheck) this.rotateCheck();
  },
  showIntro(H, round) {
    $('in-eyebrow').textContent = round.type === 'round' ? `หลุม ${H.index + 1} จาก 3` : `หลุม ${H.index + 1}`;
    $('in-name').textContent = H.name;
    $('in-meta').textContent = `Par ${H.par} · ${H.yards} หลา`;
    $('in-blurb').textContent = H.blurb;
    const el = $('intro'); el.classList.remove('out'); el.hidden = false;
  },
  hideIntro() { const el = $('intro'); el.classList.add('out'); setTimeout(() => { el.hidden = true; el.classList.remove('out'); }, 450); },

  // ---------- per frame ----------
  update(dt) {
    const mode = Game.mode;
    const letterReady = mode === 'walk' && (Game.finStage === 'open' || Game.finStage === 'done') && nearChest() && !Game.overlay;
    this.el.addr.classList.toggle('letter', letterReady);
    this.el.addr.querySelector('em').textContent = letterReady ? (Game.finStage === 'open' ? 'เก็บจดหมาย' : 'อ่านจดหมาย') : 'ตีลูก';
    this.el.addr.hidden = !((mode === 'walk' && nearBall() && !Game.overlay) || letterReady);
    if (Game.wind) {
      const viewYaw = (mode === 'aim' || mode === 'swing') ? Game.aimYaw : Game.camYaw;
      this.el.windArrow.style.transform = `rotate(${(-(Game.wind.dir - viewYaw) * 180 / Math.PI).toFixed(1)}deg)`;
      if (this.el.windSpeed.textContent !== String(Game.wind.speed)) this.el.windSpeed.textContent = Game.wind.speed;
    }
    this.updateMarkers();
    this.miniT -= dt; if (this.miniT <= 0 && !this.el.hud.hidden) { this.miniT = 0.1; this.drawMini(); }
    this.hudT -= dt; if (this.hudT <= 0) { this.hudT = 0.25; this.refreshHUD(); }
    if (Game.overlay === 'map-ov') { this.mapT = (this.mapT || 0) - dt; if (this.mapT <= 0) { this.mapT = 0.15; this.drawBigMap(); } }
  },
  project(x, y, z, clampEdge) {
    const cam = World.camera, v = new THREE.Vector3(x, y, z);
    const camSpace = v.clone().applyMatrix4(cam.matrixWorldInverse);
    v.project(cam);
    let nx = v.x, ny = v.y, edge = false;
    if (camSpace.z > 0) { nx = -nx; ny = -1; edge = true; }
    const W = window.innerWidth, Hh = window.innerHeight;
    let sx = (nx * 0.5 + 0.5) * W, sy = (-ny * 0.5 + 0.5) * Hh;
    if (clampEdge) {
      const mx = 46, myT = 92, myB = 70;
      if (sx < mx || sx > W - mx || sy < myT || sy > Hh - myB) edge = true;
      sx = clamp(sx, mx, W - mx); sy = clamp(sy, myT, Hh - myB);
    } else if (edge || Math.abs(nx) > 1.1 || Math.abs(ny) > 1.1) return null;
    return { x: sx, y: sy, edge };
  },
  placeMk(el, p, text) {
    if (!p) { el.style.display = 'none'; return; }
    el.style.display = 'flex';
    el.style.left = p.x.toFixed(1) + 'px'; el.style.top = p.y.toFixed(1) + 'px';
    el.classList.toggle('edge', !!p.edge);
    const b = el.querySelector('b'); if (b.textContent !== text) b.textContent = text;
  },
  updateMarkers() {
    const H = Game.H, mode = Game.mode, e = this.el;
    const show = H && !this.el.hud.hidden && !Game.overlay && mode !== 'intro' && mode !== 'scorecard';
    if (!show) { e.mkFlag.style.display = e.mkBall.style.display = e.mkLand.style.display = e.mkGift.style.display = 'none'; return; }
    if (H.chest && (Game.finStage === 'open') && mode === 'walk') {
      const gd = dist2d(Game.player.p.x, Game.player.p.z, H.chest.x, H.chest.z);
      this.placeMk(e.mkGift, gd > 4 ? this.project(H.chest.x, (World.fin ? World.fin.chestY : 0) + 2.9, H.chest.z, true) : null, Math.round(gd) + 'y');
    } else e.mkGift.style.display = 'none';
    if (Game.finStage && Game.finStage !== 'locked') { e.mkFlag.style.display = e.mkBall.style.display = e.mkLand.style.display = 'none'; return; }
    const from = (mode === 'walk') ? Game.player.p : Game.ball.p;
    const fd = dist2d(from.x, from.z, H.cup.x, H.cup.z);
    this.placeMk(e.mkFlag, this.project(H.cup.x, H.flagTopY + 0.25, H.cup.z, true), Math.round(fd) + 'y');
    const b = Game.ball.p, pd = dist2d(Game.player.p.x, Game.player.p.z, b.x, b.z);
    this.placeMk(e.mkBall, (mode === 'walk' && pd > 4) ? this.project(b.x, b.y + 0.6, b.z, true) : null, Math.round(pd) + 'y');
    if (mode === 'aim' && Game.landing) {
      const L = Game.landing;
      this.placeMk(e.mkLand, this.project(L.x, heightAt(H, L.x, L.z) + (Game.club === 'iron' ? Math.max(1, L.label * 0.025) * 1.2 : 0.5), L.z, false), L.label + 'y');
    } else e.mkLand.style.display = 'none';
  },

  // ---------- map baking ----------
  bakeMap(H) {
    const dir = { x: H.cup.x - H.tee.x, z: H.cup.z - H.tee.z }; const dl = Math.hypot(dir.x, dir.z); dir.x /= dl; dir.z /= dl;
    const right = { x: -dir.z, z: dir.x };
    const A = (x, z) => (x - H.tee.x) * right.x + (z - H.tee.z) * right.z;
    const F = (x, z) => (x - H.tee.x) * dir.x + (z - H.tee.z) * dir.z;
    let minA = 1e9, maxA = -1e9, minF = 1e9, maxF = -1e9;
    const grow = (x, z, r) => { const a = A(x, z), f = F(x, z); minA = Math.min(minA, a - r); maxA = Math.max(maxA, a + r); minF = Math.min(minF, f - r); maxF = Math.max(maxF, f + r); };
    for (const p of H.pts) grow(p.x, p.z, p.hw + 34);
    grow(H.green.x, H.green.z, Math.max(H.green.rx, H.green.rz) + 18);
    if (H.isle) grow(H.isle.x, H.isle.z, H.isle.r + 14);
    const span = Math.max(maxF - minF, (maxA - minA) * 1.25);
    const scale = Math.min(760 / (maxF - minF), 560 / (maxA - minA), 4);
    const w = Math.ceil((maxA - minA) * scale), h = Math.ceil((maxF - minF) * scale);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
    const hex = s => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const C = { fw: hex('#86c763'), fw2: hex('#7bbd58'), rough: hex('#5f9d45'), green: hex('#b6e58e'), bunker: hex('#fbf0d2'), tee: hex('#a3da78'), sand: hex('#f1e0b8'), shallow: hex('#8fdbe2'), deep: hex('#3aa5d4'), pond: hex('#5cc3dc') };
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) {
      const a = minA + (u + 0.5) / scale, f = maxF - (v + 0.5) / scale;
      const x = H.tee.x + right.x * a + dir.x * f, z = H.tee.z + right.z * a + dir.z * f;
      let c = null;
      for (const p of H.ponds) if (ellK(x, z, p) < 1) { c = C.pond; break; }
      if (!c && ellK(x, z, H.green) < 1) c = C.green;
      if (!c) for (const bk of H.bunkers) if (ellK(x, z, bk) < 1) { c = C.bunker; break; }
      if (!c && inRect(x, z, H.tee, H.tee.hw, H.tee.hl)) c = C.tee;
      if (!c) {
        const sd = fairwaySD(H, x, z);
        if (sd < 0) c = (Math.floor(_fwS / 9) % 2) ? C.fw : C.fw2;
        else if (sd < roughW(_fwS)) c = C.rough;
      }
      if (!c) {
        const hh = heightAt(H, x, z);
        if (hh < WATER_Y) { const t = smoothstep(0.1, 3.5, WATER_Y - hh); c = [lerp(C.shallow[0], C.deep[0], t), lerp(C.shallow[1], C.deep[1], t), lerp(C.shallow[2], C.deep[2], t)]; }
        else c = C.sand;
      }
      const i = (v * w + u) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const toMap = (x, z) => [(A(x, z) - minA) * scale, (maxF - F(x, z)) * scale];
    // trees, rocks, bridge
    for (const t of H.trees) { const [u, v] = toMap(t.cx, t.cz); ctx.fillStyle = 'rgba(46,120,52,0.9)'; ctx.beginPath(); ctx.arc(u, v, Math.max(2, t.cr * scale * 0.85), 0, 6.283); ctx.fill(); }
    for (const r of H.rocks) { const [u, v] = toMap(r.x, r.z); ctx.fillStyle = '#c9c2b2'; ctx.beginPath(); ctx.arc(u, v, Math.max(1.5, r.r * scale), 0, 6.283); ctx.fill(); }
    if (H.bridge) {
      const B = H.bridge; const [u, v] = toMap(B.x, B.z); const ang = Math.atan2(-(B.dir.x * dir.x + B.dir.z * dir.z), B.dir.x * right.x + B.dir.z * right.z);
      ctx.save(); ctx.translate(u, v); ctx.rotate(ang); ctx.fillStyle = '#b98457'; ctx.fillRect(-B.len / 2 * scale, -B.wid / 2 * scale, B.len * scale, B.wid * scale); ctx.restore();
    }
    ctx.fillStyle = '#ffffff';
    for (const s of H.stakes || []) { const [u, v] = toMap(s.x, s.z); ctx.fillRect(u - 1, v - 1, 2, 2); }
    if (H.fb && H.fb.open) {
      const [u0, v0] = toMap(H.fb.start.x, H.fb.start.z), [u1, v1] = toMap(H.fb.end.x, H.fb.end.z);
      ctx.strokeStyle = '#c58e5d'; ctx.lineWidth = Math.max(3, H.fb.wid * scale); ctx.beginPath(); ctx.moveTo(u0, v0); ctx.lineTo(u1, v1); ctx.stroke();
    }
    if (H.chest) { const [u, v] = toMap(H.chest.x, H.chest.z); ctx.fillStyle = '#f2715a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(u - 6, v - 4.5, 12, 9, 2) : ctx.rect(u - 6, v - 4.5, 12, 9); ctx.fill(); ctx.stroke(); }
    this.map = {
      canvas: cv, w, h, scale, toMap,
      fromMap: (u, v) => { const a = minA + u / scale, f = maxF - v / scale; return { x: H.tee.x + right.x * a + dir.x * f, z: H.tee.z + right.z * a + dir.z * f }; },
    };
  },
  sizeMini() {
    const c = this.el.mini, r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(1, Math.round(r.width * dpr)); c.height = Math.max(1, Math.round(r.height * dpr));
  },
  fit(W, Hh, pad) {
    const M = this.map, s = Math.min((W - pad * 2) / M.w, (Hh - pad * 2) / M.h);
    return { s, ox: (W - M.w * s) / 2, oy: (Hh - M.h * s) / 2 };
  },
  drawDots(ctx, f, big) {
    const M = this.map, H = Game.H;
    const P = (x, z) => { const [u, v] = M.toMap(x, z); return [f.ox + u * f.s, f.oy + v * f.s]; };
    const k = big ? 1.7 : 1;
    // flag
    const [fx, fy] = P(H.cup.x, H.cup.z);
    ctx.strokeStyle = '#163d43'; ctx.lineWidth = 1.6 * k; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 13 * k); ctx.stroke();
    ctx.fillStyle = '#f2715a'; ctx.beginPath(); ctx.moveTo(fx, fy - 13 * k); ctx.lineTo(fx + 9 * k, fy - 10 * k); ctx.lineTo(fx, fy - 7 * k); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#163d43'; ctx.beginPath(); ctx.arc(fx, fy, 1.8 * k, 0, 6.283); ctx.fill();
    // ball
    const b = Game.ball.p; const [bx, by] = P(b.x, b.z);
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#163d43'; ctx.lineWidth = 1.2 * k; ctx.beginPath(); ctx.arc(bx, by, 3 * k, 0, 6.283); ctx.fill(); ctx.stroke();
    // player
    const pp = Game.player.p; const [px, py] = P(pp.x, pp.z);
    const yawDir = M.toMap(pp.x + Math.sin(Game.player.yaw), pp.z + Math.cos(Game.player.yaw));
    const [ax, ay] = [f.ox + yawDir[0] * f.s - px, f.oy + yawDir[1] * f.s - py]; const al = Math.hypot(ax, ay) || 1;
    ctx.fillStyle = 'rgba(37,115,214,0.25)'; ctx.beginPath(); ctx.arc(px, py, 8 * k, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#2573d6'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.moveTo(px + ax / al * 7 * k, py + ay / al * 7 * k); ctx.lineTo(px - ay / al * 4.5 * k - ax / al * 3 * k, py + ax / al * 4.5 * k - ay / al * 3 * k); ctx.lineTo(px + ay / al * 4.5 * k - ax / al * 3 * k, py - ax / al * 4.5 * k - ay / al * 3 * k); ctx.closePath(); ctx.stroke(); ctx.fill();
    return { P, px, py, fx, fy };
  },
  drawMini() {
    if (!this.map || !Game.H) return;
    const c = this.el.mini;
    if (c.clientWidth && Math.abs(c.width - c.clientWidth * Math.min(2, window.devicePixelRatio || 1)) > 2) this.sizeMini();
    const ctx = c.getContext('2d'), W = c.width, Hh = c.height, dpr = W / (c.clientWidth || 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3aa5d4'; ctx.fillRect(0, 0, W, Hh);
    const f = this.fit(W, Hh, 2);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(this.map.canvas, f.ox, f.oy, this.map.w * f.s, this.map.h * f.s);
    ctx.save(); ctx.scale(dpr, dpr);
    this.drawDots(ctx, { s: f.s / dpr, ox: f.ox / dpr, oy: f.oy / dpr }, false);
    ctx.restore();
  },
  openMap() {
    if (!(Game.mode === 'walk' || Game.mode === 'aim')) return;
    this.openOverlay('map-ov');
    $('map-title').textContent = `แผนที่หลุม ${Game.H.index + 1} · Par ${Game.H.par} · ${Game.H.yards} หลา`;
    $('map-aim').hidden = Game.mode !== 'aim' || !Game.mark;
    requestAnimationFrame(() => this.drawBigMap());
  },
  drawBigMap() {
    if (!this.map) return;
    const c = this.el.mapCanvas, r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (r.width < 2) return;
    const W = Math.round(r.width * dpr), Hh = Math.round(r.height * dpr);
    if (c.width !== W || c.height !== Hh) { c.width = W; c.height = Hh; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#3aa5d4'; ctx.fillRect(0, 0, W, Hh);
    const f = this.fit(W, Hh, 10 * dpr); this.bigFit = { s: f.s / dpr, ox: f.ox / dpr, oy: f.oy / dpr };
    ctx.drawImage(this.map.canvas, f.ox, f.oy, this.map.w * f.s, this.map.h * f.s);
    ctx.save(); ctx.scale(dpr, dpr);
    const D = this.drawDots(ctx, this.bigFit, true);
    const H = Game.H, me = Game.player.p;
    const d3 = dist2d(me.x, me.z, H.cup.x, H.cup.z);
    $('map-d3').textContent = Math.round(d3) + ' หลา';
    if (Game.mark) {
      const [mx, my] = D.P(Game.mark.x, Game.mark.z);
      const d1 = dist2d(me.x, me.z, Game.mark.x, Game.mark.z), d2 = dist2d(Game.mark.x, Game.mark.z, H.cup.x, H.cup.z);
      ctx.setLineDash([6, 5]); ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.moveTo(D.px, D.py); ctx.lineTo(mx, my); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(D.fx, D.fy); ctx.stroke();
      ctx.setLineDash([]);
      this.label(ctx, (D.px + mx) / 2, (D.py + my) / 2, Math.round(d1) + 'y', '#f2715a', '#fff');
      this.label(ctx, (mx + D.fx) / 2, (my + D.fy) / 2, Math.round(d2) + 'y', '#fffaf0', '#163d43');
      ctx.fillStyle = '#f2715a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx, my, 8, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(mx, my, 2.5, 0, 6.283); ctx.fill();
      $('map-d1').textContent = Math.round(d1) + ' หลา'; $('map-d2').textContent = Math.round(d2) + ' หลา';
    } else { $('map-d1').textContent = '–'; $('map-d2').textContent = '–'; }
    ctx.restore();
    $('map-aim').hidden = Game.mode !== 'aim' || !Game.mark;
  },
  label(ctx, x, y, text, bg, fg) {
    ctx.font = '600 13px Mitr, Anuphan, sans-serif';
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, y - 11, w, 22, 11) : ctx.rect(x - w / 2, y - 11, w, 22); ctx.fill();
    ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
  },
  onMapTap(e) {
    if (!this.bigFit || !this.map) return;
    const r = this.el.mapCanvas.getBoundingClientRect(), f = this.bigFit;
    const u = (e.clientX - r.left - f.ox) / f.s, v = (e.clientY - r.top - f.oy) / f.s;
    if (u < 0 || v < 0 || u > this.map.w || v > this.map.h) return;
    Game.mark = this.map.fromMap(u, v);
    Sound.play('ui');
    this.drawBigMap();
  },

  // ---------- scorecard ----------
  resultName(strokes, par) {
    const d = strokes - par;
    if (strokes === 1) return 'Hole-in-One!';
    if (d <= -3) return 'Albatross!'; if (d === -2) return 'Eagle!'; if (d === -1) return 'Birdie!';
    if (d === 0) return 'Par'; if (d === 1) return 'Bogey'; if (d === 2) return 'Double Bogey'; if (d === 3) return 'Triple Bogey';
    return `+${d}`;
  },
  diffText(d) { return d < 0 ? `ต่ำกว่า Par ${-d}` : d === 0 ? 'เท่ากับ Par' : `เกิน Par ${d}`; },
  showScorecard(H, round, done) {
    this.hideOverlays(); this.setAimUI(false);
    const s = round.scores[H.index]; const d = s.strokes - s.par;
    $('sc-badge').textContent = done ? 'สรุปทั้งรอบ · 3 หลุม' : `หลุม ${H.index + 1} · ${H.name}`;
    let big = s.strokes, title = this.resultName(s.strokes, s.par), diff = this.diffText(d);
    if (done) {
      const tot = round.scores.reduce((a, x) => a + x.strokes, 0), par = 12;
      big = tot; title = tot - par < 0 ? 'รอบนี้สวยมาก!' : tot - par === 0 ? 'Even Par!' : 'จบรอบแล้ว'; diff = `รวม ${tot} สโตรก · ${this.diffText(tot - par)}`;
    }
    $('sc-big').textContent = big; $('sc-result').textContent = title; $('sc-diff').textContent = diff;
    const st = done
      ? [[round.scores.reduce((a, x) => a + x.putts, 0), 'พัตต์รวม'], [round.scores.reduce((a, x) => a + x.penalties, 0), 'ปรับโทษ'], [Math.max(...round.scores.map(x => x.longest)) + 'y', 'ช็อตไกลสุด'], [Best.round() || '–', 'ดีที่สุด']]
      : [[s.par, 'Par'], [s.putts, 'พัตต์'], [s.penalties, 'ปรับโทษ'], [(s.longest || 0) + 'y', 'ช็อตไกลสุด']];
    $('sc-stats').innerHTML = st.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
    // table
    const pars = HOLES_RAW.map(h => h.par);
    const cls = (sc, par) => { const x = sc - par; return x <= -2 ? 'under2' : x === -1 ? 'under' : x === 1 ? 'over' : x >= 2 ? 'over2' : ''; };
    let tot = 0, totPar = 0, played = 0;
    let rowScore = '', rowPar = '', rowDiff = '', head = '';
    HOLES_RAW.forEach((h, i) => {
      const x = round.scores[i]; const cur = i === H.index && !done ? ' class="cur"' : '';
      head += `<th${cur}>${i + 1}</th>`; rowPar += `<td${cur}>${h.par}</td>`;
      if (x) { tot += x.strokes; totPar += h.par; played++; rowScore += `<td${cur}><span class="sc-score ${cls(x.strokes, h.par)}">${x.strokes}</span></td>`; const dd = x.strokes - h.par; rowDiff += `<td${cur}>${dd > 0 ? '+' + dd : dd === 0 ? 'E' : dd}</td>`; }
      else { rowScore += `<td${cur}>–</td>`; rowDiff += `<td${cur}>–</td>`; }
    });
    const td = tot - totPar;
    $('sc-table').innerHTML = `<thead><tr><th>หลุม</th>${head}<th class="tot">รวม</th></tr></thead><tbody>
      <tr><td>Par</td>${rowPar}<td class="tot">${pars.reduce((a, b) => a + b, 0)}</td></tr>
      <tr><td>สกอร์</td>${rowScore}<td class="tot">${played ? tot : '–'}</td></tr>
      <tr><td>+/−</td>${rowDiff}<td class="tot">${played ? (td > 0 ? '+' + td : td === 0 ? 'E' : td) : '–'}</td></tr></tbody>`;
    const note = $('sc-note');
    const best = Best.get(H.index);
    note.hidden = false;
    note.textContent = done ? `สกอร์รวมดีที่สุดในเครื่องนี้: ${Best.round()} สโตรก` : `สกอร์ดีที่สุดของหลุมนี้ในเครื่องนี้: ${best} สโตรก`;
    // actions
    const act = $('sc-actions'); act.innerHTML = '';
    const add = (label, cls2, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls2; b.textContent = label; b.addEventListener('click', () => { Sound.play('ui'); fn(); }); act.appendChild(b); };
    if (round.type === 'round' && !done) {
      const next = round.scores.findIndex(x => !x);
      add(`ไปหลุม ${next + 1} · Par ${HOLES_RAW[next].par}`, 'primary', () => nextHole());
      add('เล่นหลุมนี้ใหม่', 'ghost', () => replayHole());
    } else if (done) {
      add('เล่นอีกรอบ', 'primary', () => startRound('round', 0));
      add('หน้าหลัก', 'ghost', () => goTitle());
      if (H.isle && Game.finStage === 'done') add('อ่านจดหมาย', 'ghost', () => { this.hideOverlays(); Game.mode = 'walk'; collectLetter(); });
    } else {
      add('เล่นหลุมนี้อีกครั้ง', 'primary', () => replayHole());
      add('เลือกหลุมอื่น', 'ghost', () => goTitle());
      if (H.isle && Game.finStage === 'done') add('อ่านจดหมาย', 'ghost', () => { this.hideOverlays(); Game.mode = 'walk'; collectLetter(); });
    }
    $('scorecard').hidden = false; Game.overlay = 'scorecard';
    // confetti for par or better
    const conf = $('confetti'); conf.innerHTML = '';
    const good = done ? (tot - totPar) <= 0 : d <= 0;
    if (good && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const cols = ['#f2715a', '#2aaec7', '#f5cf4b', '#8fd66a', '#ffffff', '#163d43'];
      for (let i = 0; i < 46; i++) {
        const p = document.createElement('i');
        p.style.left = (Math.random() * 100) + '%'; p.style.background = cols[i % cols.length];
        p.style.animationDelay = (Math.random() * 0.8) + 's'; p.style.animationDuration = (1.8 + Math.random() * 1.4) + 's';
        p.style.transform = `rotate(${Math.random() * 180}deg)`;
        conf.appendChild(p);
      }
    }
  },

  // ---------- cinematic bars ----------
  setCine(on) {
    const c = $('cine');
    clearTimeout(this.cineT);
    if (on) { c.hidden = false; requestAnimationFrame(() => c.classList.add('on')); }
    else { c.classList.remove('on'); this.cineT = setTimeout(() => { c.hidden = true; }, 500); }
  },

  // ---------- birthday letter ----------
  showLetter() {
    const ov = $('letter-ov');
    if (!$('lt-img').src) { $('lt-img').src = BIRTHDAY.photo; $('lt-img').alt = BIRTHDAY.photoAlt; }
    document.querySelector('.lt-text h2').textContent = BIRTHDAY.title;
    document.querySelector('.lt-text p').textContent = BIRTHDAY.message;
    ov.className = ''; ov.hidden = false; Game.overlay = 'letter'; $('rotate-hint').hidden = true;
    this.setHUD(false);
    this.buildBalloons();
    const steps = [[60, 'st-env'], [900, 'st-open'], [1700, 'st-letter']];
    this.letterTimers = steps.map(([ms, cls]) => setTimeout(() => {
      ov.classList.add(cls);
      if (cls === 'st-open') { Sound.play('sparkle'); this.startFireworks2D(); }
      if (cls === 'st-letter') Sound.birthday();
    }, ms));
  },
  hideLetter() {
    const ov = $('letter-ov'); if (ov.hidden) return;
    (this.letterTimers || []).forEach(clearTimeout);
    ov.hidden = true; ov.className = ''; Game.overlay = null;
    this.stopFireworks2D(); $('balloons').innerHTML = '';
    this.setHUD(true);
  },
  buildBalloons() {
    const box = $('balloons'); box.innerHTML = '';
    const cols = ['#ff7a8a', '#ffb3c7', '#c7a8ff', '#ffd66b', '#8fe0c4', '#8cc8ff', '#ff9e5e', '#ffffff'];
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (let i = 0; i < 16; i++) {
      const c = cols[i % cols.length], d = document.createElement('div');
      const size = 40 + Math.random() * 42;
      d.className = 'bl'; d.style.left = (Math.random() * 96) + '%'; d.style.width = size + 'px';
      d.style.animationDuration = (9 + Math.random() * 8) + 's'; d.style.animationDelay = (-Math.random() * 14) + 's';
      if (reduce) { d.style.animation = 'none'; d.style.bottom = (10 + Math.random() * 70) + '%'; }
      d.innerHTML = `<svg viewBox="0 0 60 120"><path d="M30 78 C 28 92, 34 100, 29 118" stroke="rgba(255,255,255,0.85)" stroke-width="1.4" fill="none"/><ellipse cx="30" cy="38" rx="25" ry="31" fill="${c}"/><ellipse cx="21" cy="26" rx="6" ry="10" fill="rgba(255,255,255,0.45)" transform="rotate(-20 21 26)"/><path d="M26 68 L34 68 L30 75 Z" fill="${c}"/></svg>`;
      box.appendChild(d);
    }
  },
  startFireworks2D() {
    const c = $('fw'), ctx = c.getContext('2d');
    const fit = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); c.width = c.clientWidth * dpr; c.height = c.clientHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    fit(); this.fwFit = fit; window.addEventListener('resize', fit);
    const cols = ['#ffd36b', '#ff8fb1', '#ff6b6b', '#c3a6ff', '#7fe3c8', '#ffffff', '#8fd0ff', '#ffb070'];
    const rockets = [], parts = [];
    let next = 0, last = performance.now(), run = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const loop = now => {
      if (!run) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const W = c.clientWidth, H = c.clientHeight;
      next -= dt;
      if (next <= 0) {
        rockets.push({ x: W * (0.12 + Math.random() * 0.76), y: H + 10, vx: (Math.random() - 0.5) * 60, vy: -(H * (0.85 + Math.random() * 0.35)), ty: H * (0.12 + Math.random() * 0.3), c: cols[Math.floor(Math.random() * cols.length)], c2: cols[Math.floor(Math.random() * cols.length)] });
        next = reduce ? 1.6 : 0.35 + Math.random() * 0.6;
      }
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]; r.vy += H * 0.55 * dt; r.x += r.vx * dt; r.y += r.vy * dt;
        ctx.strokeStyle = 'rgba(255,230,190,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r.x, r.y); ctx.lineTo(r.x - r.vx * 0.04, r.y - r.vy * 0.04); ctx.stroke();
        if (r.y <= r.ty || r.vy >= 0) {
          rockets.splice(i, 1);
          const n = 70 + Math.floor(Math.random() * 40), sp = Math.min(W, H) * (0.28 + Math.random() * 0.12), ring = Math.random() < 0.35;
          for (let k = 0; k < n; k++) {
            const a = Math.random() * Math.PI * 2, v = sp * (ring ? 1 : 0.35 + Math.random() * 0.65);
            parts.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.3 + Math.random() * 0.7, max: 2, c: k % 3 ? r.c : r.c2 });
          }
        }
      }
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.px = p.x; p.py = p.y; p.vx *= 0.975; p.vy = p.vy * 0.975 + H * 0.12 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalAlpha = Math.min(1, p.life / 1.1);
        ctx.strokeStyle = p.c; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
        if (Math.random() < 0.15) { ctx.fillStyle = '#fff'; ctx.fillRect(p.x, p.y, 1.6, 1.6); }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      requestAnimationFrame(loop);
    };
    this.fwStop = () => { run = false; window.removeEventListener('resize', fit); ctx.clearRect(0, 0, c.width, c.height); };
    requestAnimationFrame(loop);
  },
  stopFireworks2D() { if (this.fwStop) this.fwStop(); this.fwStop = null; },

  // ---------- save image ----------
  renderAvatar(w, h) {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setPixelRatio(1); r.setSize(w, h, false); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0x000000, 0);
    const sc = new THREE.Scene();
    sc.add(new THREE.HemisphereLight(0xfff2f6, 0xead6c8, 2.3));
    const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(1.5, 3, 4); sc.add(d);
    const g = new Golfer(); g.walkClubHolder.clear(); g.update(0.016, { speed: 0 });
    g.arms[1].rotation.set(-2.5, 0, -0.55); g.arms[0].rotation.set(0.15, 0, 0.25);
    g.root.rotation.y = 0.18; sc.add(g.root);
    const cam = new THREE.PerspectiveCamera(26, w / h, 0.1, 50); cam.position.set(0, 1.0, 5.6); cam.lookAt(0, 0.92, 0);
    r.render(sc, cam);
    const out = document.createElement('canvas'); out.width = w; out.height = h; out.getContext('2d').drawImage(r.domElement, 0, 0);
    r.dispose(); try { r.forceContextLoss(); } catch (e) { }
    return out;
  },
  wrap(ctx, text, maxW) {
    const raw = (typeof Intl !== 'undefined' && Intl.Segmenter) ? Array.from(new Intl.Segmenter('th', { granularity: 'word' }).segment(text), x => x.segment) : Array.from(text);
    // keep "ทุก ๆ", "ลูก ๆ", "ยาว ๆ" and emoji glued to the word before them
    const segs = [];
    raw.forEach((w, i) => {
      const nxt = raw[i + 1] || '';
      if (segs.length && (/^ๆ/.test(w) || (/^\s+$/.test(w) && /^ๆ/.test(nxt)) || /^\p{Extended_Pictographic}/u.test(w))) segs[segs.length - 1] += w;
      else segs.push(w);
    });
    const lines = []; let line = '';
    for (const w of segs) { const t = line + w; if (ctx.measureText(t).width > maxW && line.trim()) { lines.push(line.trimEnd()); line = w.trimStart(); } else line = t; }
    if (line.trim()) lines.push(line.trim());
    return lines;
  },
  async composeImage() {
    try { await Promise.all(['700 80px Mitr', '600 30px Mitr', '500 34px Anuphan', '400 24px Anuphan'].map(f => document.fonts.load(f))); } catch (e) { }
    const W = 1080, Hh = 1350, c = document.createElement('canvas'); c.width = W; c.height = Hh;
    const x = c.getContext('2d'); const rnd = mulberry32(2026);
    const bg = x.createLinearGradient(0, 0, 0, Hh); bg.addColorStop(0, '#f8e2c9'); bg.addColorStop(0.45, '#f3b8cf'); bg.addColorStop(1, '#b7b0e6');
    x.fillStyle = bg; x.fillRect(0, 0, W, Hh);
    const sun = x.createRadialGradient(W * 0.5, 120, 10, W * 0.5, 120, 520); sun.addColorStop(0, 'rgba(255,248,225,0.8)'); sun.addColorStop(1, 'rgba(255,248,225,0)');
    x.fillStyle = sun; x.fillRect(0, 0, W, Hh);
    const conf = ['#ff7a8a', '#ffd66b', '#8fe0c4', '#8cc8ff', '#c7a8ff', '#ffffff'];
    for (let i = 0; i < 90; i++) { x.save(); x.translate(rnd() * W, rnd() * Hh); x.rotate(rnd() * 3); x.fillStyle = conf[i % conf.length]; x.globalAlpha = 0.75; x.fillRect(-5, -8, 10, 16); x.restore(); }
    const balloon = (bx, by, r, col) => {
      x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 2; x.beginPath(); x.moveTo(bx, by + r * 1.2); x.bezierCurveTo(bx - 12, by + r * 1.8, bx + 14, by + r * 2.3, bx, by + r * 3); x.stroke();
      x.fillStyle = col; x.beginPath(); x.ellipse(bx, by, r, r * 1.2, 0, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.moveTo(bx - 7, by + r * 1.18); x.lineTo(bx + 7, by + r * 1.18); x.lineTo(bx, by + r * 1.32); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.45)'; x.beginPath(); x.ellipse(bx - r * 0.35, by - r * 0.45, r * 0.2, r * 0.34, -0.4, 0, Math.PI * 2); x.fill();
    };
    balloon(90, 120, 48, '#ff7a8a'); balloon(170, 70, 38, '#ffd66b'); balloon(985, 110, 50, '#c7a8ff'); balloon(905, 60, 36, '#8fe0c4'); balloon(1030, 260, 30, '#8cc8ff');
    x.textAlign = 'center'; x.textBaseline = 'alphabetic';
    x.font = '700 80px Mitr, Anuphan, sans-serif'; x.fillStyle = '#ffffff';
    x.shadowColor = 'rgba(140,60,90,0.35)'; x.shadowBlur = 18; x.shadowOffsetY = 6;
    x.fillText(BIRTHDAY.title, W / 2, 160);
    x.shadowColor = 'transparent';
    // letter card
    const cx = 60, cy = 205, cw = 960, ch = 700;
    x.save(); x.shadowColor = 'rgba(90,40,70,0.25)'; x.shadowBlur = 40; x.shadowOffsetY = 14;
    x.fillStyle = '#fffaf3'; x.beginPath(); x.roundRect ? x.roundRect(cx, cy, cw, ch, 36) : x.rect(cx, cy, cw, ch); x.fill(); x.restore();
    x.strokeStyle = 'rgba(242,113,90,0.25)'; x.lineWidth = 3; x.setLineDash([2, 10]); x.beginPath(); x.roundRect ? x.roundRect(cx + 18, cy + 18, cw - 36, ch - 36, 24) : x.rect(cx + 18, cy + 18, cw - 36, ch - 36); x.stroke(); x.setLineDash([]);
    // polaroid photo
    const img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = BIRTHDAY.photo; });
    x.save(); x.translate(300, 500); x.rotate(-0.045);
    x.shadowColor = 'rgba(60,30,50,0.25)'; x.shadowBlur = 20; x.shadowOffsetY = 8; x.fillStyle = '#ffffff'; x.fillRect(-190, -215, 380, 460); x.shadowColor = 'transparent';
    if (img) { const pw = 348, ph = 370, s2 = Math.max(pw / img.width, ph / img.height), sw = pw / s2, sh = ph / s2; x.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, -174, -199, pw, ph); }
    x.fillStyle = 'rgba(255,170,195,0.75)'; x.save(); x.translate(0, -215); x.rotate(0.06); x.fillRect(-60, -16, 120, 32); x.restore();
    x.fillStyle = '#f2715a'; x.save(); x.translate(0, 205); x.scale(1.6, 1.6); x.beginPath(); x.moveTo(0, 6); x.bezierCurveTo(10, -2, 7, -11, 0, -5); x.bezierCurveTo(-7, -11, -10, -2, 0, 6); x.fill(); x.restore();
    x.restore();
    // message
    x.textAlign = 'left'; x.fillStyle = '#4a2f3a'; x.font = '500 36px Anuphan, sans-serif';
    const msg = BIRTHDAY.message;
    const lines = this.wrap(x, msg, 445), lh = 64;
    let ty = cy + (ch - lines.length * lh) / 2 + 40; for (const ln of lines) { x.fillText(ln, 530, ty); ty += lh; }
    // avatar standing, looking at the camera
    try { const av = this.renderAvatar(460, 620); x.drawImage(av, 10, 735, 460, 620); } catch (e) { }
    // mini scorecard
    const sx = 470, sy = 950, sw = 560, sh = 300;
    x.fillStyle = 'rgba(255,250,243,0.95)'; x.beginPath(); x.roundRect ? x.roundRect(sx, sy, sw, sh, 26) : x.rect(sx, sy, sw, sh); x.fill();
    x.fillStyle = '#163d43'; x.font = '600 28px Mitr, sans-serif'; x.textAlign = 'left'; x.fillText('สกอร์การ์ด · Island Golf', sx + 26, sy + 48);
    const sc = Game.round.scores, pars = HOLES_RAW.map(h => h.par);
    const cols = ['หลุม', '1', '2', '3', 'รวม'], colX = [sx + 26, sx + 190, sx + 278, sx + 366, sx + 470];
    let tot = 0, totPar = 0, played = 0;
    x.font = '500 22px Mitr, sans-serif'; x.fillStyle = '#55777a';
    cols.forEach((t, i) => { x.textAlign = i ? 'center' : 'left'; x.fillText(t, colX[i], sy + 100); });
    x.textAlign = 'left'; x.fillText('Par', colX[0], sy + 160); x.fillText('สกอร์', colX[0], sy + 236);
    x.strokeStyle = 'rgba(22,61,67,0.12)'; x.lineWidth = 2; [sy + 118, sy + 186].forEach(yy => { x.beginPath(); x.moveTo(sx + 22, yy); x.lineTo(sx + sw - 22, yy); x.stroke(); });
    x.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      x.font = '500 26px Mitr, sans-serif'; x.fillStyle = '#163d43'; x.fillText(String(pars[i]), colX[i + 1], sy + 160);
      const s2 = sc[i];
      if (s2) {
        tot += s2.strokes; totPar += pars[i]; played++;
        const dd = s2.strokes - pars[i];
        if (dd < 0) { x.strokeStyle = '#f2715a'; x.lineWidth = 3; x.beginPath(); x.arc(colX[i + 1], sy + 227, 24, 0, 6.283); x.stroke(); }
        if (dd > 0) { x.strokeStyle = '#55777a'; x.lineWidth = 3; x.strokeRect(colX[i + 1] - 23, sy + 204, 46, 46); }
        x.font = '600 30px Mitr, sans-serif'; x.fillText(String(s2.strokes), colX[i + 1], sy + 238);
      } else { x.fillStyle = '#9bb0b2'; x.fillText('–', colX[i + 1], sy + 238); }
    }
    x.fillStyle = '#163d43'; x.font = '600 26px Mitr, sans-serif'; x.fillText('12', colX[4], sy + 160);
    x.fillStyle = '#d65843'; x.font = '700 34px Mitr, sans-serif'; x.fillText(played ? String(tot) : '–', colX[4], sy + 240);
    if (played) { const d2 = tot - totPar; x.font = '500 20px Anuphan, sans-serif'; x.fillStyle = '#55777a'; x.fillText(d2 === 0 ? 'Even' : (d2 > 0 ? '+' + d2 : String(d2)), colX[4], sy + 276); }
    return c;
  },
  async saveImage() {
    const btn = $('lt-save'); btn.disabled = true; const old = btn.textContent; btn.textContent = 'กำลังสร้างรูป…';
    try {
      const c = await this.composeImage();
      this.savedCanvas = c;
      $('save-img').src = c.toDataURL('image/png');
      const inClaude = !!(window.claude && typeof window.claude.use === 'function');
      const can = !!this.downloads || !inClaude;   // outside Claude a normal browser download works
      $('save-dl').hidden = !can;
      $('save-hint').textContent = can ? 'กดปุ่มด้านล่างเพื่อบันทึกรูปลงเครื่อง' : 'กดค้างที่รูปแล้วเลือก "บันทึกรูปภาพ" เพื่อเก็บไว้ในเครื่อง';
      $('save-ov').hidden = false;
    } catch (e) { console.error(e); this.toast('สร้างรูปไม่สำเร็จ ลองอีกครั้ง', 'bad'); }
    btn.disabled = false; btn.textContent = old;
  },
  downloadImage() {
    const c = this.savedCanvas; if (!c) return;
    if (!this.downloads) {
      // standalone hosting (e.g. GitHub Pages): plain browser download
      c.toBlob(blob => {
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = BIRTHDAY.saveFilename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        $('save-hint').textContent = 'บันทึกรูปเรียบร้อย ถ้าไม่เห็นไฟล์ ให้กดค้างที่รูปแล้วเลือก "บันทึกรูปภาพ"';
      }, 'image/png');
      return;
    }
    c.toBlob(blob => {
      this.downloads.save({ filename: BIRTHDAY.saveFilename, data: blob })
        .then(() => { $('save-hint').textContent = 'บันทึกรูปเรียบร้อย'; })
        .catch(err => {
          const code = err && err.code;
          if (code === 'declined') $('save-hint').textContent = 'ยกเลิกการบันทึกแล้ว กดอีกครั้งได้เลย';
          else if (code === 'rate_limited') $('save-hint').textContent = 'รอสักครู่แล้วกดบันทึกอีกครั้ง';
          else { $('save-dl').hidden = true; $('save-hint').textContent = 'บันทึกจากปุ่มไม่ได้ในหน้านี้ กดค้างที่รูปแล้วเลือก "บันทึกรูปภาพ" แทน'; }
        });
    }, 'image/png');
  },
};
