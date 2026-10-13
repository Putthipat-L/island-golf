// ============================================================
// world.js — renderer, sky, water, terrain shader, trees, props
// ============================================================
const SKY_TOP = new THREE.Color('#79c3ee');
const SKY_HORIZON = new THREE.Color('#d9f1fb');

const World = {
  renderer: null, scene: null, camera: null, sun: null, hemi: null,
  holeGroup: null, groundMat: null, waterMat: null, flag: null, clouds: null,
  time: 0,
};

// phones get a lighter start (lower pixel ratio, cheaper shadows); adaptQuality tunes it from there
const QUALITY = (() => {
  const mobile = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  return { mobile, startPR: mobile ? 1.5 : 2, maxPR: 2, minPR: mobile ? 0.75 : 1, shadow: mobile ? 1024 : 2048 };
})();
function initWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY.startPR));
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = QUALITY.mobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  World.renderer = renderer;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_HORIZON.clone(), 260, 1150);
  World.scene = scene;

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 2600);
  camera.position.set(0, 6, 10);
  World.camera = camera;

  const hemi = new THREE.HemisphereLight(0xe6f6ff, 0xf1e2c0, 2.05);
  scene.add(hemi); World.hemi = hemi;
  const sun = new THREE.DirectionalLight(0xfff3df, 1.75);
  sun.position.set(-40, 80, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUALITY.shadow, QUALITY.shadow);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target); World.sun = sun;

  // sky dome
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6, 0.0, 1.0); vec3 c = mix(hor, mid, smoothstep(0.0, 0.32, h)); c = mix(c, top, smoothstep(0.3, 1.0, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  World.skyMat = skyMat;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2200, 32, 16), skyMat);
  sky.renderOrder = -10;
  scene.add(sky); World.sky = sky;


  // water plane
  const waterUniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uBase: { value: new THREE.Vector3(0.33, 0.74, 0.90) }, uDash: { value: new THREE.Vector3(1, 1, 1) } }]);
  World.waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, uniforms: waterUniforms,
    vertexShader: `
      #include <fog_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader: `
      #include <fog_pars_fragment>
      uniform float uTime; uniform vec3 uBase; uniform vec3 uDash; varying vec3 vW;
      float wh(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 p = vW.xz + vec2(uTime*0.6, uTime*0.25);
        vec2 sz = vec2(7.0, 4.0);
        vec2 cell = floor(p / sz); vec2 f = fract(p / sz);
        float r = wh(cell);
        float ph = fract(uTime*0.22 + r);
        float vis = smoothstep(0.0,0.2,ph)*(1.0-smoothstep(0.45,0.75,ph)) * step(0.35, wh(cell+1.7));
        float cx = 0.2 + 0.6*wh(cell+3.1), cy = 0.2 + 0.6*wh(cell+7.7);
        float dx = abs(f.x - cx)*sz.x, dy = abs(f.y - cy)*sz.y;
        float dash = (1.0 - smoothstep(0.5, 0.8, dx)) * (1.0 - smoothstep(0.04, 0.11, dy)) * vis;
        vec3 base = pow(uBase, vec3(2.2));
        gl_FragColor = vec4(mix(base, pow(uDash, vec3(2.2)), dash), 0.14 + dash*0.6);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), World.waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = WATER_Y; water.renderOrder = 2;
  scene.add(water); World.water = water;
  const deep = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(Math.pow(0.12, 2.2), Math.pow(0.56, 2.2), Math.pow(0.80, 2.2), THREE.LinearSRGBColorSpace) }));
  deep.rotation.x = -Math.PI / 2; deep.position.y = -6.6;
  scene.add(deep); World.deep = deep;
  World.hills = makeHills(); scene.add(World.hills);
  initFireworks();

  World.clouds = makeClouds();
  scene.add(World.clouds);
  // browser bars sliding in and out fire bursts of resize events: resize the canvas once per frame at most
  let resizeQ = 0;
  window.addEventListener('resize', () => { if (!resizeQ) resizeQ = requestAnimationFrame(() => { resizeQ = 0; onResize(); }); });
}

const ATMOS = {
  day: { top: '#6fbcec', mid: '#a6d9f2', hor: '#dff3fb', fog: '#dff3fb', near: 260, far: 1150, hemiSky: '#e6f6ff', hemiGround: '#f1e2c0', hemiI: 2.05, sun: '#fff3df', sunI: 1.75, sunOff: [-40, 85, 30],
         water: [0.33, 0.74, 0.90], dash: [1, 1, 1], shallow: [0.47, 0.86, 0.86], deep: [0.12, 0.56, 0.80], cloud: '#bfd8e6', hills: false },
  sunset: { top: '#f7dfc6', mid: '#f1b5cc', hor: '#bdb3e6', fog: '#cfb9e3', near: 220, far: 1050, hemiSky: '#ffd8e8', hemiGround: '#efd3c4', hemiI: 1.95, sun: '#ffcdb0', sunI: 1.7, sunOff: [-75, 55, -55],
         water: [0.46, 0.54, 0.88], dash: [1, 0.86, 0.93], shallow: [0.62, 0.79, 0.93], deep: [0.27, 0.40, 0.79], cloud: '#f7c2d6', hills: true },
};
function setAtmosphere(kind) {
  const A = ATMOS[kind] || ATMOS.day; World.atmos = A;
  const disp = (c, hex) => c.setStyle(hex, THREE.LinearSRGBColorSpace);
  disp(World.skyMat.uniforms.top.value, A.top); disp(World.skyMat.uniforms.mid.value, A.mid); disp(World.skyMat.uniforms.hor.value, A.hor);
  World.scene.fog.color.setStyle(A.fog); World.scene.fog.near = A.near; World.scene.fog.far = A.far;
  World.hemi.color.setStyle(A.hemiSky); World.hemi.groundColor.setStyle(A.hemiGround); World.hemi.intensity = A.hemiI;
  World.sun.color.setStyle(A.sun); World.sun.intensity = A.sunI;
  World.waterMat.uniforms.uBase.value.set(...A.water); World.waterMat.uniforms.uDash.value.set(...A.dash);
  World.deep.material.color.setRGB(Math.pow(A.deep[0], 2.2), Math.pow(A.deep[1], 2.2), Math.pow(A.deep[2], 2.2), THREE.LinearSRGBColorSpace);
  World.clouds.material.emissive.setStyle(A.cloud);
  World.hills.visible = A.hills;
}
function makeHills() {
  const g = new THREE.Group(); const rnd = mulberry32(512);
  const mat = new THREE.MeshBasicMaterial({ color: '#4a5596', fog: false });
  const mat2 = new THREE.MeshBasicMaterial({ color: '#6470ad', fog: false });
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2 + rnd() * 0.4, R = 1150 + rnd() * 250;
    const w = 160 + rnd() * 260, h = 22 + rnd() * 48;
    const geo = new THREE.ConeGeometry(1, 1, 7, 1); geo.translate(0, 0.5, 0);
    const m = new THREE.Mesh(geo, i % 3 === 0 ? mat2 : mat);
    m.scale.set(w, h, w * 0.35); m.position.set(Math.cos(a) * R, WATER_Y - 1, Math.sin(a) * R); m.rotation.y = -a + Math.PI / 2;
    g.add(m);
    if (rnd() < 0.7) { const m2 = m.clone(); m2.scale.set(w * 0.6, h * (0.55 + rnd() * 0.5), w * 0.25); m2.position.x += Math.cos(a + 1.57) * w * 0.55; m2.position.z += Math.sin(a + 1.57) * w * 0.55; g.add(m2); }
  }
  g.visible = false;
  return g;
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  World.renderer.setSize(w, h, false);
  World.camera.aspect = w / h;
  World.camera.fov = w / h < 1 ? 68 : 55;
  World.camera.updateProjectionMatrix();
}

// ---------- geometry helpers ----------
function colorize(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const c = new THREE.Color(color);
  const n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
function part(geo, color, pos, rot, scl) {
  const g = colorize(geo, color);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0));
  m.compose(new THREE.Vector3(...(pos || [0, 0, 0])), q, new THREE.Vector3(...(scl || [1, 1, 1])));
  g.applyMatrix4(m);
  return g;
}
function mergeGeos(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}
function jitterGeo(geo, amt, seed) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const p = g.attributes.position; const rnd = mulberry32(seed);
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    if (!map.has(k)) map.set(k, [(rnd() - 0.5) * amt, (rnd() - 0.5) * amt, (rnd() - 0.5) * amt]);
    const j = map.get(k);
    p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]);
  }
  g.computeVertexNormals();
  return g;
}
function leafGeo(L, W, droop) {
  const pos = [];
  const steps = 7; const prev = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = 0.55 * t - droop * t * t;
    const z = t * L;
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.8) * W + 0.02;
    prev.push([[-w, y - 0.05 * w, z], [0, y + 0.12 * W, z], [w, y - 0.05 * w, z]]);
  }
  for (let i = 0; i < steps; i++) {
    const a = prev[i], b = prev[i + 1];
    for (let s = 0; s < 2; s++) {
      const a0 = a[s], a1 = a[s + 1], b0 = b[s], b1 = b[s + 1];
      pos.push(...a0, ...b0, ...a1, ...a1, ...b0, ...b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- tree / prop prototypes (built once) ----------
const PROTO = {};
function buildPrototypes() {
  if (PROTO.palm) return;
  // palm: curved trunk + fronds
  {
    const parts = []; const n = 8, segH = 1.0, lean = 1.4;
    let px = 0, py = 0;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const x0 = lean * t0 * t0, x1 = lean * t1 * t1;
      const y1 = py + segH;
      const ang = Math.atan2(x1 - x0, segH);
      const r0 = 0.34 - 0.12 * t0, r1 = 0.34 - 0.12 * t1;
      parts.push(part(new THREE.CylinderGeometry(r1, r0, segH * 1.04, 7), i % 2 ? '#b98a5c' : '#a77751', [(x0 + x1) / 2, py + segH / 2, 0], [0, 0, -ang]));
      px = x1; py = y1;
    }
    const top = [px, py, 0];
    const leafCols = ['#4fae4b', '#62bf55', '#45a146'];
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + (k % 2) * 0.2;
      const L = 3.6 + (k % 3) * 0.4;
      const g = leafGeo(L, 0.62, 1.7 + (k % 2) * 0.4);
      parts.push(part(g, leafCols[k % 3], top, [-0.12, a, 0]));
    }
    for (let k = 0; k < 3; k++) {
      const a = k / 3 * Math.PI * 2;
      parts.push(part(new THREE.IcosahedronGeometry(0.2, 0), '#7a5532', [top[0] + Math.cos(a) * 0.28, top[1] - 0.28, Math.sin(a) * 0.28]));
    }
    PROTO.palm = { geo: mergeGeos(parts), canopy: { x: top[0], y: top[1] - 0.2, r: 2.6 }, trunk: { r: 0.36, h: top[1] - 0.6 } };
  }
  // round broccoli tree
  {
    const parts = [];
    parts.push(part(new THREE.CylinderGeometry(0.26, 0.38, 3.4, 7), '#8a6141', [0, 1.7, 0]));
    const blobs = [[0, 4.6, 0, 2.3, '#5cb04a'], [1.3, 4.0, 0.5, 1.5, '#4e9f42'], [-1.2, 4.1, -0.4, 1.6, '#66bb52'], [0.2, 5.6, -0.3, 1.5, '#6cc257']];
    blobs.forEach((b, i) => parts.push(part(jitterGeo(new THREE.IcosahedronGeometry(b[3], 1), 0.25, 30 + i), b[4], [b[0], b[1], b[2]], null, [1, 0.9, 1])));
    PROTO.round = { geo: mergeGeos(parts), canopy: { x: 0, y: 4.7, r: 2.9 }, trunk: { r: 0.42, h: 3.4 } };
  }
  // cypress / cone tree
  {
    const parts = [];
    parts.push(part(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 6), '#7d5638', [0, 0.8, 0]));
    parts.push(part(new THREE.ConeGeometry(1.45, 4.6, 7), '#3f925a', [0, 3.6, 0]));
    parts.push(part(new THREE.ConeGeometry(1.05, 3.3, 7), '#4ba566', [0, 5.9, 0]));
    PROTO.cone = { geo: mergeGeos(parts), canopy: { x: 0, y: 4.2, r: 1.7 }, trunk: { r: 0.3, h: 1.6 } };
  }
  // bush
  {
    const parts = [];
    [[0, 0.5, 0, 0.85, '#5aa94a'], [0.7, 0.4, 0.2, 0.6, '#4f9c42'], [-0.6, 0.4, -0.1, 0.65, '#66b653']].forEach((b, i) =>
      parts.push(part(jitterGeo(new THREE.IcosahedronGeometry(b[3], 0), 0.15, 50 + i), b[4], [b[0], b[1], b[2]])));
    PROTO.bush = { geo: mergeGeos(parts), canopy: { x: 0, y: 0.5, r: 1.1 }, trunk: null };
  }
  // rock
  {
    PROTO.rock = { geo: colorize(jitterGeo(new THREE.IcosahedronGeometry(1, 0), 0.35, 77), '#ffffff') };
  }
}

function makeClouds() {
  const parts = []; const rnd = mulberry32(99);
  for (let c = 0; c < 14; c++) {
    const a = rnd() * Math.PI * 2, r = 700 + rnd() * 500, y = 130 + rnd() * 120;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, s = 18 + rnd() * 16;
    for (let k = 0; k < 5; k++) {
      const ox = (k - 2) * s * 0.75 + (rnd() - 0.5) * s * 0.4, oy = (rnd() * 0.5) * s, rr = s * (0.6 + rnd() * 0.5) * (k === 2 ? 1.3 : 1);
      parts.push(part(new THREE.IcosahedronGeometry(rr, 1), '#ffffff', [cx + ox * Math.cos(a + 1.57), y + oy, cz + ox * Math.sin(a + 1.57)], null, [1, 0.62, 1]));
    }
  }
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false, emissive: 0xbfd8e6, emissiveIntensity: 0.55 });
  return new THREE.Mesh(mergeGeos(parts), mat);
}

// ---------- ground material ----------
const GROUND_GLSL = `
uniform vec4 uPts[16]; uniform int uNPts;
uniform vec4 uGreen; uniform float uGreenRot;
uniform vec4 uBunk[8]; uniform float uBunkRot[8]; uniform int uNBunk;
uniform vec4 uTee; uniform float uTeeRot;
uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep;
varying vec3 vWPos;
float gHash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float gNoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(gHash(i),gHash(i+vec2(1.0,0.0)),u.x), mix(gHash(i+vec2(0.0,1.0)),gHash(i+vec2(1.0,1.0)),u.x), u.y); }
float gWob(float s){ return 1.6*sin(s*0.071) + 1.1*sin(s*0.173+1.3); }
vec2 gLocal(vec2 p, vec2 c, float rot){ vec2 d=p-c; float cs=cos(rot), sn=sin(rot); return vec2(cs*d.x+sn*d.y, -sn*d.x+cs*d.y); }
float gEllK(vec2 p, vec4 e, float rot){ return length(gLocal(p,e.xy,rot)/e.zw); }
float gSq(float x){ return clamp(0.5 + sin(x)/(2.0*max(fwidth(x),0.0001)), 0.0, 1.0); }
vec2 gFairway(vec2 p){
  float best=1e9; float bs=0.0;
  for(int i=0;i<15;i++){
    if(i>=uNPts-1) break;
    vec4 a=uPts[i]; vec4 b=uPts[i+1];
    vec2 ab=b.xy-a.xy; float t=clamp(dot(p-a.xy,ab)/dot(ab,ab),0.0,1.0);
    float d=length(p-(a.xy+ab*t)); float s=mix(a.w,b.w,t);
    float sd=d-(mix(a.z,b.z,t)+gWob(s));
    if(sd<best){best=sd;bs=s;}
  }
  return vec2(best,bs);
}
vec3 groundColor(vec2 p, float h){
  float n1 = gNoise(p*0.35), n2 = gNoise(p*2.3);
  vec3 col = vec3(0.945,0.875,0.71) * (0.95 + 0.07*n1 + 0.03*n2);
  vec2 fw = gFairway(p); float sd = fw.x;
  float aa = max(fwidth(sd), 0.015);
  float rw = 7.0 + 1.4*sin(fw.y*0.05 + 0.7);
  col *= 1.0 - 0.07*(1.0-smoothstep(0.0,1.8,sd-rw));
  vec3 rough = vec3(0.40,0.66,0.27) * (0.88 + 0.16*n2 + 0.08*n1);
  rough *= 1.0 - 0.08*smoothstep(rw-1.6, rw, sd);
  col = mix(col, rough, 1.0 - smoothstep(rw-aa, rw+aa, sd));
  float band = gSq(fw.y*6.2832/9.0);
  vec3 fwc = mix(vec3(0.47,0.75,0.31), vec3(0.55,0.81,0.37), band) * (0.97 + 0.05*n1);
  fwc *= 1.0 - 0.06*(1.0 - smoothstep(-1.6, -0.3, sd));
  col = mix(col, fwc, 1.0 - smoothstep(-aa, aa, sd));
  vec2 tq = gLocal(p, uTee.xy, uTeeRot); vec2 td = abs(tq) - uTee.zw;
  float tsd = length(max(td,0.0)) + min(max(td.x,td.y),0.0); float taa = max(fwidth(tsd),0.015);
  vec3 teec = mix(vec3(0.57,0.84,0.40), vec3(0.64,0.89,0.46), gSq(tq.x*6.2832/2.4));
  col = mix(col, teec, 1.0 - smoothstep(-taa, taa, tsd));
  float gk = gEllK(p, uGreen, uGreenRot); float gaa = max(fwidth(gk), 0.002);
  vec2 gq = gLocal(p, uGreen.xy, uGreenRot);
  vec3 grc = mix(vec3(0.60,0.86,0.42), vec3(0.67,0.905,0.49), gSq(gq.x*6.2832/3.0));
  grc *= 1.0 - 0.09*smoothstep(0.9, 1.0, gk);
  col = mix(col, grc, 1.0 - smoothstep(1.0-gaa, 1.0+gaa, gk));
  for(int i=0;i<8;i++){
    if(i>=uNBunk) break;
    float k = gEllK(p, uBunk[i], uBunkRot[i]); float kaa = max(fwidth(k), 0.002);
    col *= 1.0 - 0.13*(smoothstep(0.99,1.02,k)*(1.0-smoothstep(1.02,1.15,k)));
    vec3 bc = vec3(0.985,0.935,0.80) * (0.94 + 0.05*n2 + 0.04*n1);
    bc *= 1.0 - 0.17*smoothstep(0.75,1.0,k);
    col = mix(col, bc, 1.0 - smoothstep(1.0-kaa, 1.0+kaa, k));
  }
  float depth = ${WATER_Y.toFixed(3)} - h;
  col *= 1.0 - 0.12*smoothstep(-0.35, 0.0, depth)*(1.0 - smoothstep(0.0, 0.05, depth));
  vec3 wcol = mix(uShallow, uDeep, smoothstep(0.25, 3.8, depth));
  col = mix(col, wcol, smoothstep(-0.02, 0.32, depth));
  float fz = depth + 0.035*sin(uTime*1.3 + p.x*0.21 + p.y*0.17);
  float foam = (1.0 - smoothstep(0.0, 0.06, abs(fz - 0.035))) * (0.5 + 0.5*gNoise(p*0.7 + uTime*0.25));
  col = mix(col, vec3(1.0), foam*0.9);
  return col;
}
`;

function makeGroundMaterial(H) {
  const u = {
    uPts: { value: Array.from({ length: 16 }, () => new THREE.Vector4()) }, uNPts: { value: H.pts.length },
    uGreen: { value: new THREE.Vector4(H.green.x, H.green.z, H.green.rx, H.green.rz) }, uGreenRot: { value: H.green.rot },
    uBunk: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, 1, 1)) }, uBunkRot: { value: new Array(8).fill(0) }, uNBunk: { value: H.bunkers.length },
    uTee: { value: new THREE.Vector4(H.tee.x, H.tee.z, H.tee.hw, H.tee.hl) }, uTeeRot: { value: H.tee.rot },
    uTime: { value: 0 },
    uShallow: { value: new THREE.Vector3(...(World.atmos || ATMOS.day).shallow) }, uDeep: { value: new THREE.Vector3(...(World.atmos || ATMOS.day).deep) },
  };
  H.pts.forEach((p, i) => u.uPts.value[i].set(p.x, p.z, p.hw, p.s));
  H.bunkers.forEach((b, i) => { u.uBunk.value[i].set(b.x, b.z, b.rx, b.rz); u.uBunkRot.value[i] = b.rot; });
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = 'varying vec3 vWPos;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = GROUND_GLSL + shader.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );',
      'vec4 diffuseColor = vec4( pow(groundColor(vWPos.xz, vWPos.y), vec3(2.2)), opacity );');
  };
  mat.customProgramCacheKey = () => 'ground-v2';
  mat.userData.u = u;
  return mat;
}

// ---------- per-hole build ----------
function buildHoleWorld(H) {
  buildPrototypes();
  if (World.holeGroup) { disposeGroup(World.holeGroup); World.scene.remove(World.holeGroup); }
  const G = new THREE.Group(); World.holeGroup = G; World.scene.add(G);
  setAtmosphere(H.sky);
  const rnd = mulberry32(H.seed * 7919);

  // terrain grid
  const b = H.bounds, M = 115;
  const minX = b.minX - M, maxX = b.maxX + M, minZ = b.minZ - M, maxZ = b.maxZ + M;
  H.terrainBounds = { minX, maxX, minZ, maxZ };
  const step = 2.0;
  const nx = Math.ceil((maxX - minX) / step), nz = Math.ceil((maxZ - minZ) / step);
  const geo = new THREE.PlaneGeometry(maxX - minX, maxZ - minZ, nx, nz);
  geo.rotateX(-Math.PI / 2);
  geo.translate((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  const pa = geo.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const x = pa.getX(i), z = pa.getZ(i);
    const edge = Math.min(x - minX, maxX - x, z - minZ, maxZ - z);
    let y = heightAt(H, x, z);
    if (edge < 30) y = lerp(-7.2, y, smoothstep(0, 30, edge));
    pa.setY(i, y);
  }
  geo.computeVertexNormals();
  World.groundMat = makeGroundMaterial(H);
  const ground = new THREE.Mesh(geo, World.groundMat);
  ground.receiveShadow = true;
  G.add(ground);

  // colliders + instances
  H.trees = []; H.rocks = [];
  const inst = { palm: [], round: [], cone: [], bush: [] };
  const rockInst = [];
  const addTree = (type, x, z, scale, rotY, collide = true) => {
    const y = heightAt(H, x, z) - 0.15;
    inst[type].push({ x, y, z, s: scale, r: rotY });
    const P = PROTO[type];
    if (!collide) return;
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const cxl = P.canopy.x * scale;
    H.trees.push({
      x, z,
      trunkR: P.trunk ? P.trunk.r * scale : 0, trunkH: P.trunk ? y + P.trunk.h * scale : 0,
      cx: x + cxl * c, cy: y + P.canopy.y * scale, cz: z - cxl * s, cr: P.canopy.r * scale,
    });
  };
  const addRock = (x, z, s, tint) => {
    const y = heightAt(H, x, z);
    rockInst.push({ x, y: y + s * 0.15, z, s, r: rnd() * 6.28, tint });
    H.rocks.push({ x, y: y + s * 0.2, z, r: s * 0.92 });
  };
  for (const t of H.treeDefs) {
    if (t.type === 'rock') addRock(t.x, t.z, t.scale * 1.3, '#d6cdbb');
    else addTree(t.type, t.x, t.z, t.scale, rnd() * 6.28);
  }
  const nearFinaleBridge = (x, z, pad) => H.fb && inRect(x, z, H.fb, H.fb.len / 2 + pad, H.fb.wid / 2 + pad);
  if (H.isle) {
    const I = H.isle, away = Math.atan2(-H.fb.dir.z, -H.fb.dir.x);
    [[1.2, 9, 1.05], [2.0, 10, 0.95], [2.9, 8.5, 1.1], [-1.4, 9.5, 1.0], [-2.3, 8, 0.9]].forEach(([a, r, sc]) => {
      const ang = away + a; addTree(a > 2.5 ? 'round' : 'palm', I.x + Math.cos(ang) * r, I.z + Math.sin(ang) * r, sc, rnd() * 6.28);
    });
  }
  // decor: sample the shore band
  const spots = [];
  const farFrom = (x, z, d) => spots.every(p => (p.x - x) ** 2 + (p.z - z) ** 2 > d * d);
  const tooCloseToPlay = (x, z) => {
    // keep decor off the line between tee and cup and away from cup/tee
    if (dist2d(x, z, H.cup.x, H.cup.z) < 26 || dist2d(x, z, H.tee.x, H.tee.z) < 14) return true;
    return false;
  };
  for (const t of H.treeDefs) spots.push({ x: t.x, z: t.z });
  let tries = 0, palms = 0;
  const targetPalms = Math.round(H.len / 7);
  while (palms < targetPalms && tries++ < 6000) {
    const x = lerp(minX + 20, maxX - 20, rnd()), z = lerp(minZ + 20, maxZ - 20, rnd());
    const sd = courseSD(H, x, z);
    if (sd < 3.5 || sd > 15) continue;
    if (heightAt(H, x, z) < WATER_Y + 0.25) continue;
    if (tooCloseToPlay(x, z) || !farFrom(x, z, 8)) continue;
    spots.push({ x, z });
    const r = rnd();
    addTree(r < 0.72 ? 'palm' : r < 0.9 ? 'round' : 'bush', x, z, 0.8 + rnd() * 0.45, rnd() * 6.28, true);
    palms++;
  }
  tries = 0; let rocks = 0; const targetRocks = Math.round(H.len / 5);
  while (rocks < targetRocks && tries++ < 8000) {
    const x = lerp(minX + 15, maxX - 15, rnd()), z = lerp(minZ + 15, maxZ - 15, rnd());
    const h = heightAt(H, x, z);
    if (h > -0.05 || h < -1.0) continue;
    if (courseSD(H, x, z) < 6 || !farFrom(x, z, 4.5) || nearFinaleBridge(x, z, 4)) continue;
    spots.push({ x, z });
    addRock(x, z, 0.9 + rnd() * 2.4, rnd() < 0.55 ? '#e6d8bb' : '#c9cfd2');
    rocks++;
  }
  // little islets out at sea
  const islets = [];
  for (let k = 0; k < 7; k++) {
    for (let t = 0; t < 60; t++) {
      const x = lerp(minX + 30, maxX - 30, rnd()), z = lerp(minZ + 30, maxZ - 30, rnd());
      const sd = courseSD(H, x, z);
      if (sd < 55 || sd > 105) continue;
      if (islets.some(i => dist2d(i.x, i.z, x, z) < 50)) continue;
      if (H.isle && dist2d(H.isle.x, H.isle.z, x, z) < 55) continue;
      const r = 6 + rnd() * 7; islets.push({ x, z, r });
      const n = 1 + Math.floor(rnd() * 3);
      for (let j = 0; j < n; j++) {
        const a = rnd() * 6.28, d = rnd() * r * 0.35;
        inst.palm.push({ x: x + Math.cos(a) * d, y: 0.5, z: z + Math.sin(a) * d, s: 0.75 + rnd() * 0.4, r: rnd() * 6.28 });
      }
      break;
    }
  }
  if (islets.length) {
    const parts = islets.map((i, k) => part(jitterGeo(new THREE.IcosahedronGeometry(i.r, 1), i.r * 0.12, 200 + k), '#ecd7aa', [i.x, -0.75, i.z], null, [1, 0.2, 1]));
    const m = new THREE.Mesh(mergeGeos(parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    m.receiveShadow = true; G.add(m);
  }

  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const dummy = new THREE.Object3D();
  for (const type of Object.keys(inst)) {
    const list = inst[type]; if (!list.length) continue;
    const im = new THREE.InstancedMesh(PROTO[type].geo, treeMat, list.length);
    list.forEach((t, i) => { dummy.position.set(t.x, t.y, t.z); dummy.rotation.set(0, t.r, 0); dummy.scale.setScalar(t.s); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
    im.castShadow = true; im.receiveShadow = false;
    G.add(im);
  }
  if (rockInst.length) {
    const rm = new THREE.InstancedMesh(PROTO.rock.geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), rockInst.length);
    const col = new THREE.Color();
    rockInst.forEach((t, i) => { dummy.position.set(t.x, t.y, t.z); dummy.rotation.set(0.3, t.r, 0.1); dummy.scale.set(t.s, t.s * 0.72, t.s * 0.9); dummy.updateMatrix(); rm.setMatrixAt(i, dummy.matrix); rm.setColorAt(i, col.set(t.tint)); });
    rm.castShadow = true; rm.receiveShadow = true;
    G.add(rm);
  }

  // OB stakes along the course edge
  const stakes = [];
  for (let x = minX + 10; x < maxX - 10; x += 2) for (let z = minZ + 10; z < maxZ - 10; z += 2) {
    const sd = courseSD(H, x, z);
    if (sd > 1.2 && sd < 3.2 && heightAt(H, x, z) > WATER_Y + 0.1 && stakes.every(s => (s.x - x) ** 2 + (s.z - z) ** 2 > 110)) {
      let skip = false;
      for (const b of H.bunkers) if (ellK(x, z, b) < 1.3) skip = true;
      if (H.bridge && onBridge(H, x, z, 3)) skip = true;
      if (nearFinaleBridge(x, z, 3)) skip = true;
      if (!skip) stakes.push({ x, z });
    }
  }
  if (stakes.length) {
    const sg = mergeGeos([part(new THREE.CylinderGeometry(0.06, 0.07, 1.0, 6), '#ffffff', [0, 0.5, 0]), part(new THREE.CylinderGeometry(0.075, 0.075, 0.12, 6), '#2c3a44', [0, 0.04, 0])]);
    const sm = new THREE.InstancedMesh(sg, new THREE.MeshLambertMaterial({ vertexColors: true }), stakes.length);
    stakes.forEach((s, i) => { dummy.position.set(s.x, heightAt(H, s.x, s.z) - 0.05, s.z); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); sm.setMatrixAt(i, dummy.matrix); });
    sm.castShadow = true; G.add(sm);
  }
  H.stakes = stakes;

  // tee markers
  {
    const d = H.teeDir, r = { x: -d.z, z: d.x };
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshLambertMaterial({ color: side < 0 ? '#f0705c' : '#ffffff' }));
      m.position.set(H.tee.x + r.x * side * 4.2 + d.x * 3.2, 0.2, H.tee.z + r.z * side * 4.2 + d.z * 3.2);
      m.castShadow = true; G.add(m);
    }
  }

  // bridge
  if (H.bridge) {
    const B = H.bridge; const bg = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: '#b98457', flatShading: true });
    const dark = new THREE.MeshLambertMaterial({ color: '#8d603c', flatShading: true });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(B.len, 0.2, B.wid), wood); deck.position.y = 0.2; bg.add(deck);
    for (let i = 0; i < 9; i++) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, B.wid + 0.02), dark); pl.position.set(-B.len / 2 + (i + 0.5) * B.len / 9, 0.21, 0); bg.add(pl);
    }
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(B.len, 0.12, 0.12), dark); rail.position.set(0, 1.0, side * (B.wid / 2 - 0.05)); bg.add(rail);
      for (let i = 0; i <= 4; i++) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.0, 0.16), wood); post.position.set(-B.len / 2 + i * B.len / 4, 0.55, side * (B.wid / 2 - 0.05)); bg.add(post); }
    }
    bg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    bg.position.set(B.x, 0, B.z); bg.rotation.y = -B.rot;
    G.add(bg);
  }

  // cup + flag
  {
    const gy = heightAt(H, H.cup.x, H.cup.z);
    const fg = new THREE.Group(); fg.position.set(H.cup.x, gy, H.cup.z);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(CUP_R, 28), new THREE.MeshBasicMaterial({ color: '#1d2a22', polygonOffset: true, polygonOffsetFactor: -2 }));
    hole.rotation.x = -Math.PI / 2; hole.position.y = 0.012; fg.add(hole);
    const rim = new THREE.Mesh(new THREE.RingGeometry(CUP_R, CUP_R + 0.05, 28), new THREE.MeshBasicMaterial({ color: '#ffffff', polygonOffset: true, polygonOffsetFactor: -2 }));
    rim.rotation.x = -Math.PI / 2; rim.position.y = 0.013; fg.add(rim);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), new THREE.MeshLambertMaterial({ color: '#fbfbf7' }));
    pole.position.y = 1.3; pole.castShadow = true; fg.add(pole);
    const flagGeo = new THREE.PlaneGeometry(0.95, 0.6, 10, 4); flagGeo.translate(0.475, 0, 0);
    const flag = new THREE.Mesh(flagGeo, new THREE.MeshLambertMaterial({ color: '#f0624c', side: THREE.DoubleSide }));
    flag.position.y = 2.25; flag.castShadow = true; fg.add(flag);
    flag.userData.base = flagGeo.attributes.position.array.slice();
    G.add(fg);
    World.flag = flag; World.flagGroup = fg; H.flagTopY = gy + 2.6;
  }
  World.slopeArrows = makeSlopeArrows(H); G.add(World.slopeArrows);
  World.fin = H.isle ? buildFinale(H, G) : null;
  return G;
}

// downhill chevrons on the green, shown while putting
function makeSlopeArrows(H) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.32, -0.1); shape.lineTo(0, 0.22); shape.lineTo(0.32, -0.1); shape.lineTo(0.2, -0.1); shape.lineTo(0, 0.08); shape.lineTo(-0.2, -0.1); shape.closePath();
  const geo = new THREE.ShapeGeometry(shape); geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI);
  const pts = [];
  const g = H.green, R = Math.max(g.rx, g.rz) + 2;
  for (let x = g.x - R; x <= g.x + R; x += 1.7) for (let z = g.z - R; z <= g.z + R; z += 1.7) {
    if (ellK(x, z, g) > 0.97) continue;
    if (Math.hypot(x - H.cup.x, z - H.cup.z) < 1.2) continue;
    const e = 0.2, gx = (heightAt(H, x + e, z) - heightAt(H, x - e, z)) / (2 * e), gz = (heightAt(H, x, z + e) - heightAt(H, x, z - e)) / (2 * e);
    const m = Math.hypot(gx, gz); if (m < 0.006) continue;
    pts.push({ x, z, y: heightAt(H, x, z) + 0.035, yaw: Math.atan2(-gx, -gz), s: 0.55 + Math.min(1, m / 0.07) * 0.7 });
  }
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide }), Math.max(1, pts.length));
  const d = new THREE.Object3D();
  pts.forEach((p, i) => { d.position.set(p.x, p.y, p.z); d.rotation.set(0, p.yaw, 0); d.scale.setScalar(p.s); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.count = pts.length; im.visible = false; im.renderOrder = 4; im.userData.pts = pts;
  return im;
}

// ---------- birthday finale props (hole 3) ----------
function buildFinale(H, G) {
  const F = { segs: [], balloons: [], t: 0 };
  const C = H.chest, cy = heightAt(H, C.x, C.z);
  // chest
  const chest = new THREE.Group(); chest.position.set(C.x, cy, C.z); chest.rotation.y = C.yaw;
  const wood = new THREE.MeshLambertMaterial({ color: '#9b6234' }), woodD = new THREE.MeshLambertMaterial({ color: '#7a4a25' });
  const gold = new THREE.MeshLambertMaterial({ color: '#f1c24e', emissive: '#6b4a00', emissiveIntensity: 0.25 });
  const W = 1.4, Dp = 0.9, Hh = 0.72;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, Dp), wood); base.position.y = Hh / 2; chest.add(base);
  const inner = new THREE.Mesh(new THREE.BoxGeometry(W - 0.12, 0.05, Dp - 0.12), new THREE.MeshBasicMaterial({ color: '#3a2412' })); inner.position.y = Hh - 0.02; chest.add(inner);
  for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) { const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, Hh + 0.02, Dp + 0.03), gold); band.position.set(x, Hh / 2, 0); chest.add(band); }
  const lidPivot = new THREE.Group(); lidPivot.position.set(0, Hh, -Dp / 2); chest.add(lidPivot);
  const lidGeo = new THREE.CylinderGeometry(Dp / 2, Dp / 2, W, 20, 1, false, 0, Math.PI); lidGeo.rotateZ(Math.PI / 2);
  const lid = new THREE.Mesh(lidGeo, wood); lid.position.set(0, 0, Dp / 2); lidPivot.add(lid);
  for (const x of [-W / 2 + 0.12, W / 2 - 0.12]) { const b2 = new THREE.Mesh(new THREE.CylinderGeometry(Dp / 2 + 0.02, Dp / 2 + 0.02, 0.1, 20, 1, false, 0, Math.PI), gold); b2.geometry.rotateZ(Math.PI / 2); b2.position.set(x, 0, Dp / 2); lidPivot.add(b2); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.26, 0.06), gold); lock.position.set(0, Hh - 0.05, Dp / 2 + 0.02); chest.add(lock);
  const heartShape = new THREE.Shape(); heartShape.moveTo(0, -0.06); heartShape.bezierCurveTo(0.1, 0.02, 0.07, 0.11, 0, 0.06); heartShape.bezierCurveTo(-0.07, 0.11, -0.1, 0.02, 0, -0.06);
  const lockHeart = new THREE.Mesh(new THREE.ShapeGeometry(heartShape), new THREE.MeshBasicMaterial({ color: '#e5484d' })); lockHeart.position.set(0, Hh - 0.05, Dp / 2 + 0.056); chest.add(lockHeart);
  chest.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  G.add(chest);
  // envelope
  const env = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.6), new THREE.MeshLambertMaterial({ color: '#fff3f5', emissive: '#ffd9e4', emissiveIntensity: 0.35 }));
  env.add(paper);
  const flapShape = new THREE.Shape(); flapShape.moveTo(-0.45, 0); flapShape.lineTo(0.45, 0); flapShape.lineTo(0, -0.32); flapShape.closePath();
  const flap = new THREE.Mesh(new THREE.ShapeGeometry(flapShape), new THREE.MeshLambertMaterial({ color: '#f7b2c6', emissive: '#f7b2c6', emissiveIntensity: 0.25, side: THREE.DoubleSide }));
  flap.rotation.x = -Math.PI / 2; flap.position.set(0, 0.019, -0.3); env.add(flap);
  const seal = new THREE.Mesh(new THREE.ShapeGeometry(heartShape), new THREE.MeshBasicMaterial({ color: '#e5484d', side: THREE.DoubleSide })); seal.rotation.x = -Math.PI / 2; seal.scale.setScalar(1.3); seal.position.set(0, 0.022, -0.02); env.add(seal);
  env.position.set(0, Hh - 0.2, 0); env.rotation.x = -0.15;
  env.traverse(o => { if (o.isMesh) o.castShadow = true; });
  chest.add(env);
  // glow sprite + light
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; const gx = gc.getContext('2d');
  const grad = gx.createRadialGradient(64, 64, 0, 64, 64, 64); grad.addColorStop(0, 'rgba(255,240,200,1)'); grad.addColorStop(0.35, 'rgba(255,190,210,0.55)'); grad.addColorStop(1, 'rgba(255,180,210,0)');
  gx.fillStyle = grad; gx.fillRect(0, 0, 128, 128);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
  glow.scale.setScalar(3.4); glow.position.set(0, Hh + 0.4, 0); chest.add(glow);
  const light = new THREE.PointLight('#ffd6a8', 0, 14, 1.6); light.position.set(0, Hh + 0.8, 0.4); chest.add(light);
  // hidden bridge (rises from the water when hole 3 is done)
  const B = H.fb, N = Math.max(6, Math.round(B.len / 2.3)), segLen = B.len / N;
  const plank = new THREE.MeshLambertMaterial({ color: '#c58e5d' }), plankD = new THREE.MeshLambertMaterial({ color: '#94623a' });
  const rope = new THREE.MeshLambertMaterial({ color: '#efe1c3' });
  for (let i = 0; i < N; i++) {
    const seg = new THREE.Group();
    const along = -B.len / 2 + (i + 0.5) * segLen;
    seg.position.set(B.x + B.dir.x * along, -2.4, B.z + B.dir.z * along); seg.rotation.y = -B.rot;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(segLen * 0.96, 0.18, B.wid), i % 2 ? plank : plankD); seg.add(deck);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 6), plankD); post.position.set(-segLen / 2 + 0.1, 0.5, side * (B.wid / 2 - 0.08)); seg.add(post);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, segLen, 5), rope); r.rotation.z = Math.PI / 2; r.position.set(0, 1.0, side * (B.wid / 2 - 0.08)); seg.add(r);
    }
    seg.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    seg.visible = false; G.add(seg); F.segs.push(seg);
  }
  // shore lanterns
  F.lanterns = [];
  for (const side of [-1, 1]) {
    const lp = new THREE.Group(); const sx = B.start.x - B.dir.z * side * 2.3, sz = B.start.z + B.dir.x * side * 2.3;
    lp.position.set(sx, heightAt(H, sx, sz), sz);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.6, 6), plankD); pole.position.y = 0.8; lp.add(pole);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshLambertMaterial({ color: '#ffe7b0', emissive: '#ffb347', emissiveIntensity: 0.15 })); bulb.position.y = 1.72; lp.add(bulb);
    lp.traverse(o => { if (o.isMesh) o.castShadow = true; });
    G.add(lp); F.lanterns.push(bulb);
  }
  // balloons
  const cols = ['#ff7a7a', '#ffb3c7', '#c7a8ff', '#ffd66b', '#8fe0c4', '#8cc8ff', '#ffffff', '#ff9e5e'];
  const bgeo = new THREE.SphereGeometry(0.5, 18, 14); bgeo.scale(1, 1.18, 1);
  const knot = new THREE.ConeGeometry(0.08, 0.14, 8);
  const rnd = mulberry32(77);
  for (let i = 0; i < 18; i++) {
    const tied = i < 6;
    const grp = new THREE.Group();
    const m = new THREE.Mesh(bgeo, new THREE.MeshLambertMaterial({ color: cols[i % cols.length], emissive: cols[i % cols.length], emissiveIntensity: 0.18 }));
    grp.add(m);
    const k = new THREE.Mesh(knot, m.material); k.position.y = -0.62; k.rotation.x = Math.PI; grp.add(k);
    const strLen = tied ? 2.6 + rnd() * 0.8 : 1.6;
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, strLen, 3), new THREE.MeshBasicMaterial({ color: '#ffffff' })); str.position.y = -0.62 - strLen / 2; grp.add(str);
    const ang = rnd() * Math.PI * 2, rad = tied ? 1.1 + rnd() * 0.5 : 3 + rnd() * 9;
    const ox = Math.cos(ang) * rad, oz = Math.sin(ang) * rad;
    grp.userData = { tied, ox, oz, base: tied ? cy + 2.4 + strLen : cy + rnd() * 30, speed: 1.2 + rnd() * 1.4, ph: rnd() * 6.28, strLen };
    grp.position.set(C.x + ox, grp.userData.base, C.z + oz);
    grp.visible = false; G.add(grp); F.balloons.push(grp);
  }
  Object.assign(F, { chest, lidPivot, env, glow, light, chestY: cy, H });
  return F;
}

// ---------- 3D fireworks ----------
const FW = { shells: [], parts: [], max: 2400 };
function initFireworks() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FW.max * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(FW.max * 3), 3));
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.85)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const mat = new THREE.PointsMaterial({ size: 1.9, map: new THREE.CanvasTexture(c), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  FW.points = new THREE.Points(geo, mat); FW.points.frustumCulled = false; FW.points.renderOrder = 8;
  World.scene.add(FW.points);
}
const FW_COLS = ['#ffd36b', '#ff8fb1', '#ff6b6b', '#c3a6ff', '#7fe3c8', '#ffffff', '#8fd0ff', '#ffb070'];
function launchFirework(x, y, z) {
  FW.shells.push({ x: x + (Math.random() - 0.5) * 30, y, z: z + (Math.random() - 0.5) * 30, vx: (Math.random() - 0.5) * 3, vy: 30 + Math.random() * 10, vz: (Math.random() - 0.5) * 3, fuse: 1.0 + Math.random() * 0.5, c: new THREE.Color(FW_COLS[Math.floor(Math.random() * FW_COLS.length)]), c2: new THREE.Color(FW_COLS[Math.floor(Math.random() * FW_COLS.length)]) });
  Sound.play('launch');
}
function updateFireworks(dt) {
  for (let i = FW.shells.length - 1; i >= 0; i--) {
    const s = FW.shells[i]; s.fuse -= dt; s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    if (FW.parts.length < FW.max) FW.parts.push({ x: s.x, y: s.y, z: s.z, vx: 0, vy: -1, vz: 0, life: 0.35, max: 0.35, c: new THREE.Color('#ffe2b0') });
    if (s.fuse <= 0) {
      FW.shells.splice(i, 1);
      const n = 90 + Math.floor(Math.random() * 40), sp = 10 + Math.random() * 5;
      for (let k = 0; k < n && FW.parts.length < FW.max; k++) {
        const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u), v = sp * (0.85 + Math.random() * 0.25);
        const life = 1.4 + Math.random() * 0.8;
        FW.parts.push({ x: s.x, y: s.y, z: s.z, vx: r * Math.cos(th) * v, vy: u * v, vz: r * Math.sin(th) * v, life, max: life, c: k % 3 ? s.c : s.c2 });
      }
      Sound.play('boom');
    }
  }
  const pa = FW.points.geometry.attributes.position, ca = FW.points.geometry.attributes.color;
  let n = 0;
  for (let i = FW.parts.length - 1; i >= 0; i--) {
    const p = FW.parts[i]; p.life -= dt;
    if (p.life <= 0) { FW.parts.splice(i, 1); continue; }
    p.vx *= 0.985; p.vy = p.vy * 0.985 - 4.5 * dt; p.vz *= 0.985;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  for (const p of FW.parts) {
    const f = Math.min(1, p.life / p.max * 1.6) * (0.75 + 0.25 * Math.random());
    pa.setXYZ(n, p.x, p.y, p.z); ca.setXYZ(n, p.c.r * f, p.c.g * f, p.c.b * f); n++;
  }
  FW.points.geometry.setDrawRange(0, n); pa.needsUpdate = true; ca.needsUpdate = true;
}

function animateWorld(dt) {
  World.time += dt;
  const t = World.time;
  if (World.groundMat) World.groundMat.userData.u.uTime.value = t;
  World.waterMat.uniforms.uTime.value = t;
  if (World.flag) {
    const p = World.flag.geometry.attributes.position, base = World.flag.userData.base;
    const w = (typeof Game !== 'undefined' && Game.wind) ? Game.wind : { dir: 0, speed: 3 };
    World.flag.rotation.y += angDiff(World.flag.rotation.y, w.dir - Math.PI / 2) * Math.min(1, dt * 3);
    const amp = 0.4 + Math.min(1.2, w.speed / 8);
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3];
      p.setZ(i, (Math.sin(x * 5 - t * (4 + w.speed * 0.5)) * 0.07 * x + Math.sin(x * 3 - t * 3.3) * 0.04 * x) * amp);
    }
    p.needsUpdate = true;
    World.flag.geometry.computeVertexNormals();
  }
  if (World.clouds) World.clouds.rotation.y = t * 0.002;
  updateFireworks(dt);
}

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry && !Object.values(PROTO).some(p => p.geo === o.geometry)) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}

// ---------- fx: particles & trail ----------
const FX = { parts: [], trail: null, trailPts: [], dots: null, ring: null, partMesh: null };
function initFX() {
  const max = 260;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  const mat = new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false });
  FX.partMesh = new THREE.Points(geo, mat); FX.partMesh.frustumCulled = false;
  World.scene.add(FX.partMesh);
  FX.max = max;

  // tracer ribbon
  const tmax = 600;
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tmax * 2 * 3), 3));
  tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(tmax * 2 * 4), 4));
  const idx = []; for (let i = 0; i < tmax - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  tg.setIndex(idx);
  FX.trail = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  FX.trail.frustumCulled = false; FX.trail.renderOrder = 5; FX.tmax = tmax;
  World.scene.add(FX.trail);

  // aim dots + landing ring
  const dg = new THREE.SphereGeometry(1, 8, 6);
  FX.dots = new THREE.InstancedMesh(dg, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }), 60);
  FX.dots.frustumCulled = false; FX.dots.count = 0; FX.dots.renderOrder = 6;
  World.scene.add(FX.dots);
  FX.ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.05, 40), new THREE.MeshBasicMaterial({ color: '#ff7a5c', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));
  FX.ring.rotation.x = -Math.PI / 2; FX.ring.visible = false; FX.ring.renderOrder = 6;
  World.scene.add(FX.ring);
}
function burst(x, y, z, color, n, speed, up) {
  const c = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    if (FX.parts.length >= FX.max) FX.parts.shift();
    const a = Math.random() * Math.PI * 2, s = speed * (0.4 + Math.random() * 0.6);
    FX.parts.push({ x, y, z, vx: Math.cos(a) * s, vy: up * (0.5 + Math.random() * 0.7), vz: Math.sin(a) * s, life: 0.7 + Math.random() * 0.5, c });
  }
}
function updateFX(dt) {
  const pos = FX.partMesh.geometry.attributes.position, col = FX.partMesh.geometry.attributes.color;
  let n = 0;
  for (let i = FX.parts.length - 1; i >= 0; i--) {
    const p = FX.parts[i]; p.life -= dt;
    if (p.life <= 0) { FX.parts.splice(i, 1); continue; }
    p.vy -= GRAV * 0.8 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  for (const p of FX.parts) { pos.setXYZ(n, p.x, p.y, p.z); col.setXYZ(n, p.c.r, p.c.g, p.c.b); n++; }
  FX.partMesh.geometry.setDrawRange(0, n);
  pos.needsUpdate = true; col.needsUpdate = true;
}
function trailReset() { FX.trailPts.length = 0; FX.trail.geometry.setDrawRange(0, 0); }
function trailPush(p) { if (FX.trailPts.length < FX.tmax) FX.trailPts.push(p.clone()); }
function trailUpdate(cam) {
  const pts = FX.trailPts, n = pts.length;
  const g = FX.trail.geometry, pa = g.attributes.position, ca = g.attributes.color;
  if (n < 2) { g.setDrawRange(0, 0); return; }
  const v = new THREE.Vector3(), side = new THREE.Vector3(), toCam = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
    v.subVectors(q, o).normalize();
    toCam.subVectors(cam.position, p);
    const d = toCam.length(); toCam.normalize();
    side.crossVectors(v, toCam).normalize();
    const w = Math.max(0.05, d * 0.0035);
    pa.setXYZ(i * 2, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
    pa.setXYZ(i * 2 + 1, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w);
    const a = 0.25 + 0.7 * (i / (n - 1));
    ca.setXYZW(i * 2, 1, 1, 1, a); ca.setXYZW(i * 2 + 1, 1, 1, 1, a);
  }
  pa.needsUpdate = true; ca.needsUpdate = true;
  g.setDrawRange(0, (n - 1) * 6);
}
