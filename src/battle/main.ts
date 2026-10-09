import * as THREE from 'three';
import { createBattle } from '../core';
import type { BattleState, Cell } from '../core';
import { AsciiPass } from '../ascii';
import { makeHuman, loadRobotFactory } from '../units';
import { firstEncounter } from '../tactics/encounter';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

const created = createBattle(firstEncounter);
if (!created.ok) throw new Error(created.error);
const state: BattleState = created.state;

const MAP_W = state.map.width;
const MAP_H = state.map.height;

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: CAPTURE });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);

const std = (color: number, emissive = 0x000000, ei = 0) =>
  new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.9, metalness: 0.05, flatShading: true });

scene.add(new THREE.HemisphereLight(0xbfffd0, 0x0a2010, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 2.4);
key.position.set(-6, 14, 4);
key.target.position.set(6, 0, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
key.shadow.bias = -0.002;
scene.add(key, key.target);

const tileGeo = new THREE.BoxGeometry(0.9, 0.22, 0.9);
const tileMats = [std(0x30493a), std(0x2a4232), std(0x36503e)];
const wallMat = std(0x8aa890);
const coverMat = std(0x7c9a6a);

function cellAt(x: number, y: number): Cell {
  return state.map.cells[y * MAP_W + x];
}

for (let y = 0; y < MAP_H; y++) {
  for (let x = 0; x < MAP_W; x++) {
    const cell = cellAt(x, y);
    const floorY = cell.height * 0.45 - 0.11;
    const floor = new THREE.Mesh(tileGeo, tileMats[(x * 7 + y * 3) % 3]);
    floor.position.set(x, floorY, y);
    floor.receiveShadow = true;
    floor.userData = { x, y };
    world.add(floor);
    if (cell.wall) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.96, 1.6, 0.96), wallMat);
      wall.position.set(x, cell.height * 0.45 + 0.8, y);
      wall.castShadow = wall.receiveShadow = true;
      world.add(wall);
    }
    if (cell.cover > 0) {
      const cover = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), coverMat);
      cover.position.set(x, cell.height * 0.45 + 0.225, y);
      cover.castShadow = cover.receiveShadow = true;
      world.add(cover);
    }
  }
}

const ascii = new AsciiPass(renderer);
ascii.setCellSize(Number(params.get('cell')) || 10);

const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
const target = new THREE.Vector3((MAP_W - 1) / 2, 0.4, (MAP_H - 1) / 2);
const cam = { az: Math.PI / 4, el: Math.atan(1 / Math.SQRT2), zoom: Number(params.get('zoom')) || 1.35, orbit: !params.has('still') };

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
  camera.left = -half * aspect;
  camera.right = half * aspect;
  camera.top = half;
  camera.bottom = -half;
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

type Figure = { root: THREE.Object3D; animate: (dt: number, moving: boolean, time: number) => void };
const figures: Figure[] = [];
const activeId = state.queue[state.activeIndex];

function addRing(obj: { root: THREE.Object3D }, team: string, unitId: string) {
  const teamColor = team === 'party' ? 0x20e8ff : 0xff2a2a;
  const active = unitId === activeId;
  const inner = active ? 0.3 : 0.36;
  const outer = active ? 0.58 : 0.46;
  const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 24), new THREE.MeshBasicMaterial({ color: teamColor }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  ring.scale.setScalar(1 / obj.root.scale.x);
  obj.root.add(ring);
}

function placeFigure(unitId: string, obj: Figure, team: string) {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) throw new Error(`missing unit ${unitId}`);
  const cell = cellAt(unit.pos.x, unit.pos.y);
  obj.root.position.set(unit.pos.x, cell.height * 0.45, unit.pos.y);
  scene.add(obj.root);
  addRing(obj, team, unitId);
  figures.push(obj);
}

placeFigure('a', makeHuman(0x30f0ff), 'party');
placeFigure('b', makeHuman(0x70ffc0, { coat: true, visor: 0x30f0ff }), 'party');

const hud = document.getElementById('hud')!;
let ready = false;
loadRobotFactory('models/RobotExpressive.glb').then((makeRobot) => {
  placeFigure('c', makeRobot(0xff3030, 1.35), 'machines');
  placeFigure('d', makeRobot(0xff6a20, 1.7), 'machines');
  ready = true;
});

const keys = new Set<string>();
addEventListener('keydown', (e) => {
  keys.add(e.key);
  if (e.key === '+' || e.key === '=') ascii.setCellSize(ascii.cellSize + 1);
  if (e.key === '-' || e.key === '_') ascii.setCellSize(ascii.cellSize - 1);
  if (e.key === 'o' || e.key === 'O') cam.orbit = !cam.orbit;
  if (e.key === 'g' || e.key === 'G') {
    const u = ascii.analyse.uniforms.glitchAmt;
    u.value = u.value > 0 ? 0 : 0.35;
  }
  if (e.key === 'r' || e.key === 'R') {
    const u = ascii.analyse.uniforms.rainAmt;
    u.value = u.value > 0 ? 0 : 0.6;
  }
  if (e.key === 'e' || e.key === 'E') {
    const u = ascii.analyse.uniforms.edgeOn;
    u.value = 1 - u.value;
  }
  if (e.key === 'h' || e.key === 'H') hud.style.display = hud.style.display === 'none' ? '' : 'none';
});
addEventListener('keyup', (e) => keys.delete(e.key));
let drag: { x: number; y: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY };
  cam.orbit = false;
});
addEventListener('pointerup', () => (drag = null));
addEventListener('pointermove', (e) => {
  if (!drag) return;
  cam.az -= (e.clientX - drag.x) * 0.006;
  cam.el = THREE.MathUtils.clamp(cam.el + (e.clientY - drag.y) * 0.004, 0.25, 1.2);
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('wheel', (e) => {
  cam.zoom = THREE.MathUtils.clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 3);
});

if (params.has('hidehud')) hud.style.display = 'none';

function updateHud() {
  const u = ascii.analyse.uniforms;
  const active = state.units.find((unit) => unit.id === activeId);
  const lines =
    `ASCII SIMULATION // render test\n` +
    `cell ${ascii.cellSize}px  grid ${ascii.grid.x}x${ascii.grid.y}\n` +
    `[+/-] cell size  [drag/←→↑↓] orbit  [wheel] zoom\n` +
    `[O] auto-orbit ${cam.orbit ? 'on' : 'off'}  [G] glitch ${u.glitchAmt.value ? 'on' : 'off'}  [R] rain ${u.rainAmt.value ? 'on' : 'off'}  [E] edges ${u.edgeOn.value ? 'on' : 'off'}  [H] hud\n` +
    `active ${activeId}  AP ${active?.ap ?? 0}\n`;
  const unitLines = state.units
    .filter((unit) => unit.alive)
    .map((unit) => `${unit.id} ${unit.hp}`)
    .join('\n');
  hud.textContent = lines + unitLines;
}

let time = 0;
function step(dt: number) {
  time += dt;
  if (cam.orbit) cam.az += dt * 0.12;
  if (keys.has('ArrowLeft')) cam.az += dt * 1.2;
  if (keys.has('ArrowRight')) cam.az -= dt * 1.2;
  if (keys.has('ArrowUp')) cam.el = Math.min(1.2, cam.el + dt * 0.8);
  if (keys.has('ArrowDown')) cam.el = Math.max(0.25, cam.el - dt * 0.8);
  placeCamera();
  for (const fig of figures) fig.animate(dt, false, time);
  ascii.render(scene, camera, time);
  updateHud();
}

declare global {
  interface Window {
    __step: (dt: number, n?: number) => void;
    __ready: () => boolean;
    __set: (k: string, v: number) => void;
  }
}
window.__ready = () => ready;
window.__step = (dt, n = 1) => {
  for (let i = 0; i < n; i++) step(dt);
};
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
