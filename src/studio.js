// ============================================================
// studio.js — turntable preview for the avatar
// ============================================================
const Studio = {
  yaw: 0.12, pitch: 0.04, dist: 1.75, ty: 1.33,
  yawT: 0.12, pitchT: 0.04, distT: 1.75, tyT: 1.33,
  spin: false, pose: 'stand', t: 0, swingT: 0,
};
const VIEWS = {
  face: { yaw: 0.12, pitch: 0.04, dist: 1.75, ty: 1.33 },
  front: { yaw: 0, pitch: 0.1, dist: 4.1, ty: 0.95 },
  three: { yaw: 0.7, pitch: 0.12, dist: 3.9, ty: 1.0 },
  side: { yaw: 1.55, pitch: 0.08, dist: 3.9, ty: 1.0 },
  back: { yaw: Math.PI, pitch: 0.12, dist: 3.9, ty: 1.0 },
};

function studioBoot() {
  const stage = document.getElementById('stage'), cv = document.getElementById('cv');
  document.getElementById('ref-img').src = LETTER_JPG;
  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(32, 1, 0.05, 60);
  scene.add(new THREE.HemisphereLight(0xfff1f5, 0xe8d3c6, 2.1));
  const key = new THREE.DirectionalLight(0xfff4e8, 1.7); key.position.set(2.2, 4, 3.2); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); const sc = key.shadow.camera; sc.left = -2; sc.right = 2; sc.top = 3; sc.bottom = -1; sc.near = 0.5; sc.far = 12; key.shadow.bias = -0.0005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffd6e6, 0.6); rim.position.set(-3, 2.5, -3); scene.add(rim);
  // grass disc
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.6, 0.12, 48), new THREE.MeshLambertMaterial({ color: '#9fd27a' }));
  disc.position.y = -0.06; disc.receiveShadow = true; scene.add(disc);
  for (let i = 0; i < 6; i++) {
    const band = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 2.9), new THREE.MeshLambertMaterial({ color: i % 2 ? '#a9da84' : '#95c96f', transparent: true, opacity: 0.55 }));
    band.rotation.x = -Math.PI / 2; band.position.set(-1.25 + i * 0.5, 0.002, 0); band.receiveShadow = true; scene.add(band);
  }
  const ringGeo = new THREE.RingGeometry(1.5, 1.6, 64); const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#fffaf2', transparent: true, opacity: 0.7 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.003; scene.add(ring);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 18, 12), new THREE.MeshLambertMaterial({ color: '#ffffff' }));
  ball.castShadow = true; scene.add(ball);

  const g = new Golfer(); scene.add(g.root);
  window.__studio = { g, Studio, scene, cam, renderer, setView, setPose };

  const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  window.addEventListener('resize', resize); resize();

  function setView(k) {
    const v = VIEWS[k]; Studio.yawT = v.yaw; Studio.pitchT = v.pitch; Studio.distT = v.dist; Studio.tyT = v.ty;
    document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === k)));
  }
  function setPose(p) {
    Studio.pose = p; Studio.swingT = 0;
    document.querySelectorAll('#poses button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.pose === p)));
    g.setPose(p === 'swing' ? 'address' : 'walk');
    g.walkClubHolder.visible = p === 'walk';
    ball.visible = p === 'swing';
    if (p === 'swing' && Studio.distT < 3) setView('three');
  }
  document.querySelectorAll('#views button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('#poses button').forEach(b => b.addEventListener('click', () => setPose(b.dataset.pose)));
  const spinBtn = document.getElementById('spin');
  spinBtn.addEventListener('click', () => { Studio.spin = !Studio.spin; spinBtn.setAttribute('aria-pressed', String(Studio.spin)); });

  // orbit: drag, wheel, pinch
  const pts = new Map(); let pinch0 = 0, dist0 = 0;
  stage.addEventListener('pointerdown', e => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { stage.setPointerCapture(e.pointerId); } catch (_) { } if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); dist0 = Studio.distT; } });
  stage.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId); if (!p) return;
    if (pts.size === 1) { Studio.yawT -= (e.clientX - p.x) * 0.008; Studio.pitchT = clamp(Studio.pitchT + (e.clientY - p.y) * 0.005, -0.25, 0.9); }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0 > 0) Studio.distT = clamp(dist0 * pinch0 / d, 1.2, 7); }
  });
  const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', e => { e.preventDefault(); Studio.distT = clamp(Studio.distT * (1 + Math.sign(e.deltaY) * 0.1), 1.2, 7); Studio.tyT = Studio.distT < 2.4 ? 1.33 : Studio.tyT; }, { passive: false });

  setPose('stand');
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    step(dt);
    renderer.render(scene, cam);
    requestAnimationFrame(frame);
  }
  function step(dt) {
    Studio.t += dt;
    if (Studio.spin) Studio.yawT += dt * 0.6;
    const k = 1 - Math.exp(-dt * 6);
    Studio.yaw += (Studio.yawT - Studio.yaw) * k; Studio.pitch += (Studio.pitchT - Studio.pitch) * k;
    Studio.dist += (Studio.distT - Studio.dist) * k; Studio.ty += (Studio.tyT - Studio.ty) * k;
    const cp = Math.cos(Studio.pitch);
    cam.position.set(Math.sin(Studio.yaw) * cp * Studio.dist, Studio.ty + Math.sin(Studio.pitch) * Studio.dist, Math.cos(Studio.yaw) * cp * Studio.dist);
    cam.lookAt(0, Studio.ty, 0);
    let swing = -0.1, speed = 0;
    if (Studio.pose === 'walk') speed = 0.5;
    if (Studio.pose === 'wave') g.wave = 0.2;
    if (Studio.pose === 'swing') {
      Studio.swingT = (Studio.swingT + dt) % 3.2; const t = Studio.swingT;
      if (t < 1.1) swing = lerp(-0.1, -2.35, easeInOut(t / 1.1));
      else if (t < 1.35) swing = -2.35;
      else if (t < 1.6) { const u = (t - 1.35) / 0.25; swing = lerp(-2.35, -0.1, u * u); }
      else if (t < 2.0) swing = lerp(-0.1, 2.25, 1 - Math.pow(1 - (t - 1.6) / 0.4, 3));
      else if (t < 2.7) swing = 2.25;
      else swing = lerp(2.25, -0.1, easeInOut((t - 2.7) / 0.5));
      // golfer stands beside the ball, facing it; target to her left
      g.root.position.set(-ADDR_DIST, 0, 0); g.root.rotation.y = Math.PI / 2;
      ball.position.set(0, BALL_R, 0);
    } else { g.root.position.set(0, 0, 0); g.root.rotation.y = 0; }
    g.update(dt, { speed, swing, watching: false });
  }
  window.__studio.step = step;
  requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
}
try { studioBoot(); } catch (e) { console.error(e); document.querySelector('.hint').textContent = 'เปิดโมเดลไม่สำเร็จ: ' + e.message; }
