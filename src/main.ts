import * as THREE from 'three';
import { AsciiPass } from './ascii';
import { buildWorld, MAP_W, MAP_H } from './scene';
import { loadHumanFactory, loadRobotFactory, stepUnit, Unit } from './units';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: CAPTURE });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const { heights } = buildWorld(scene);
const ascii = new AsciiPass(renderer);
ascii.setCellSize(Number(params.get('cell')) || 10);

// ---- isometric orthographic camera with orbit
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const target = new THREE.Vector3((MAP_W - 1) / 2, 0.4, (MAP_H - 1) / 2);
const cam = { az: Math.PI / 4, el: Math.atan(1 / Math.SQRT2) /* 35.264° classic iso */, zoom: Number(params.get('zoom')) || 1.35, orbit: !params.has('still') };
function placeCamera() {
  const r = 40;
  camera.position.set(
    target.x + r * Math.cos(cam.el) * Math.sin(cam.az),
    target.y + r * Math.sin(cam.el),
    target.z + r * Math.cos(cam.el) * Math.cos(cam.az),
  );
  camera.lookAt(target);
  const aspect = innerWidth / innerHeight;
  const half = 7.6 / cam.zoom;
  camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
  camera.updateProjectionMatrix();
}

function resize() {
  const pr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pr);
  renderer.setSize(innerWidth, innerHeight);
  ascii.setSize(innerWidth, innerHeight, pr);
  placeCamera();
}
addEventListener('resize', resize);
resize();

// ---- units
const units: Unit[] = [];
const ground = (x: number, z: number) => heights[Math.round(z)]?.[Math.round(x)] ?? 0;
const v = (x: number, z: number) => new THREE.Vector2(x, z);
function addUnit(name: string, obj: { root: THREE.Object3D; animate: Unit['animate'] }, path: THREE.Vector2[], speed: number, phase = 0) {
  scene.add(obj.root);
  // team-coloured base ring (environment-tagged, so it reads as a tile marker, not part of the unit)
  const team = name === 'Hunter' || name === 'Sentinel' ? 0xff2a2a : 0x20e8ff;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.36, 0.46, 24), new THREE.MeshBasicMaterial({ color: team }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015;
  ring.scale.setScalar(1 / obj.root.scale.x);
  obj.root.add(ring);
  const u: Unit = { name, root: obj.root, animate: obj.animate, path, speed, baseY: ground, seg: 0, dir: 1, t: 0, pause: phase };
  units.push(u);
  return u;
}
const hud = document.getElementById('hud')!;
let ready = false;
let partyReady = false;
let machinesReady = false;
function markReady() {
  ready = partyReady && machinesReady;
}
loadHumanFactory('models/Human.glb').then((makeParty) => {
  addUnit('Runner', makeParty(0x30f0ff, 1.3), [v(2, 4), v(5, 4), v(5, 7)], 1.6);
  addUnit('Hacker', makeParty(0x70ffc0, 1.3), [v(3, 8), v(4, 8), v(4, 10)], 1.0, 0.8);
  partyReady = true;
  markReady();
}).catch(() => {});
loadRobotFactory('models/RobotExpressive.glb').then((makeRobot) => {
  addUnit('Hunter', makeRobot(0xff3030, 1.35), [v(10, 6), v(6, 6)], 1.2, 0.4);
  addUnit('Sentinel', makeRobot(0xff6a20, 1.7), [v(10, 10)], 0);
  units[units.length - 1].root.rotation.y = -2.3;
  machinesReady = true;
  markReady();
}).catch(() => {});

// ---- input
const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.key);
  if (e.key === '+' || e.key === '=') ascii.setCellSize(ascii.cellSize + 1);
  if (e.key === '-' || e.key === '_') ascii.setCellSize(ascii.cellSize - 1);
  if (e.key === 'o' || e.key === 'O') cam.orbit = !cam.orbit;
  if (e.key === 'g' || e.key === 'G') { const u = ascii.analyse.uniforms.glitchAmt; u.value = u.value > 0 ? 0 : 0.35; }
  if (e.key === 'r' || e.key === 'R') { const u = ascii.analyse.uniforms.rainAmt; u.value = u.value > 0 ? 0 : 0.6; }
  if (e.key === 'e' || e.key === 'E') { const u = ascii.analyse.uniforms.edgeOn; u.value = 1 - u.value; }
  if (e.key === 'h' || e.key === 'H') hud.style.display = hud.style.display === 'none' ? '' : 'none';
});
addEventListener('keyup', (e) => keys.delete(e.key));
let drag: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY }; cam.orbit = false; });
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.az -= (e.clientX - drag.x) * 0.006;
  cam.el = THREE.MathUtils.clamp(cam.el + (e.clientY - drag.y) * 0.004, 0.25, 1.2);
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('wheel', (e) => { cam.zoom = THREE.MathUtils.clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 3); });

if (params.has('hidehud')) hud.style.display = 'none';
function updateHud() {
  const u = ascii.analyse.uniforms;
  hud.textContent =
    `ASCII SIMULATION // render test\n` +
    `cell ${ascii.cellSize}px  grid ${ascii.grid.x}x${ascii.grid.y}\n` +
    `[+/-] cell size  [drag/←→↑↓] orbit  [wheel] zoom\n` +
    `[O] auto-orbit ${cam.orbit ? 'on' : 'off'}  [G] glitch ${u.glitchAmt.value ? 'on' : 'off'}  [R] rain ${u.rainAmt.value ? 'on' : 'off'}  [E] edges ${u.edgeOn.value ? 'on' : 'off'}  [H] hud`;
}

// ---- loop
let time = 0;
function step(dt: number) {
  time += dt;
  if (cam.orbit) cam.az += dt * 0.12;
  if (keys.has('ArrowLeft')) cam.az += dt * 1.2;
  if (keys.has('ArrowRight')) cam.az -= dt * 1.2;
  if (keys.has('ArrowUp')) cam.el = Math.min(1.2, cam.el + dt * 0.8);
  if (keys.has('ArrowDown')) cam.el = Math.max(0.25, cam.el - dt * 0.8);
  placeCamera();
  for (const u of units) stepUnit(u, dt, time);
  ascii.render(scene, camera, time);
  updateHud();
}

declare global { interface Window { __step: (dt: number, n?: number) => void; __ready: () => boolean; __set: (k: string, v: number) => void } }
window.__ready = () => ready;
window.__step = (dt, n = 1) => { for (let i = 0; i < n; i++) step(dt); };
window.__set = (k, val) => {
  if (k === 'cell') ascii.setCellSize(val);
  else if (k === 'az') cam.az = val;
  else if (k === 'zoom') cam.zoom = val;
  else if (k === 'orbit') cam.orbit = !!val;
  else if (k in ascii.analyse.uniforms) ascii.analyse.uniforms[k].value = val;
  placeCamera();
};

if (!CAPTURE) {
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => step(Math.min(clock.getDelta(), 0.05)));
}
