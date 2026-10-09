import * as THREE from 'three';
import { createBattle } from '../core';
import type { BattleState, Cell, Command, Coord } from '../core';
import { AsciiPass } from '../ascii';
import { tagUnit } from '../scene';
import { makeHuman, loadRobotFactory } from '../units';
import { firstEncounter } from '../tactics/encounter';
import { pointerGesture } from '../tactics/gesture';
import {
  activeUnit,
  moveHighlights,
  planMove,
  planStrike,
  strikeHighlights,
} from '../tactics/plan';
import { runCommands, settleMachines } from './turn';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

const created = createBattle(firstEncounter);
if (!created.ok) throw new Error(created.error);
let state: BattleState = created.state;

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
const floorMeshes: THREE.Mesh[] = [];

function cellAt(x: number, y: number): Cell {
  return state.map.cells[y * MAP_W + x];
}

function floorYAt(x: number, y: number): number {
  return cellAt(x, y).height * 0.45 - 0.11;
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
    floorMeshes.push(floor);
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

const highlightGroup = new THREE.Group();
world.add(highlightGroup);
const highlightPieces: THREE.Mesh[] = [];

function disposeHighlights() {
  for (const mesh of highlightPieces) {
    highlightGroup.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  highlightPieces.length = 0;
}

function addHighlight(coord: Coord, color: number) {
  // Opaque and unit-tagged so the ASCII pass keeps the highlight hue.
  // A transparent blend with the floor falls under the environment grade and disappears.
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.82, 0.06, 0.82),
    tagUnit(new THREE.MeshBasicMaterial({ color })),
  );
  mesh.position.set(coord.x, floorYAt(coord.x, coord.y) + 0.14, coord.y);
  mesh.raycast = () => {};
  highlightGroup.add(mesh);
  highlightPieces.push(mesh);
}

function pathCells(): Set<string> {
  const path = new Set<string>();
  if (selection?.kind === 'move') {
    for (const cmd of planMove(state, { x: selection.x, y: selection.y })) {
      if (cmd.type === 'move') path.add(`${cmd.to.x},${cmd.to.y}`);
    }
  } else if (selection?.kind === 'strike') {
    for (const cmd of planStrike(state, selection.id)) {
      if (cmd.type === 'move') path.add(`${cmd.to.x},${cmd.to.y}`);
    }
  }
  return path;
}

function rebuildHighlights() {
  disposeHighlights();
  if (state.status.kind !== 'ongoing') return;
  const path = pathCells();
  const moves = moveHighlights(state);
  const strikes = strikeHighlights(state);
  const painted = new Set<string>();

  for (const coord of moves) {
    const key = `${coord.x},${coord.y}`;
    const strikeUnit = state.units.find(
      (unit) => unit.alive && unit.pos.x === coord.x && unit.pos.y === coord.y && strikes.includes(unit.id),
    );
    if (strikeUnit) {
      addHighlight(coord, 0xff3b5c);
      painted.add(key);
      continue;
    }
    if (path.has(key)) addHighlight(coord, 0xffe14a);
    else addHighlight(coord, 0x39ff9a);
    painted.add(key);
  }

  for (const id of strikes) {
    const unit = state.units.find((candidate) => candidate.id === id);
    if (!unit) continue;
    const key = `${unit.pos.x},${unit.pos.y}`;
    if (painted.has(key)) continue;
    addHighlight(unit.pos, 0xff3b5c);
    painted.add(key);
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

type Figure = {
  root: THREE.Object3D;
  animate: (dt: number, moving: boolean, time: number) => void;
  ring?: THREE.Mesh;
};
const figuresById = new Map<string, Figure>();

function setRing(fig: Figure, team: string, active: boolean) {
  if (fig.ring) {
    fig.root.remove(fig.ring);
    fig.ring.geometry.dispose();
    (fig.ring.material as THREE.Material).dispose();
    fig.ring = undefined;
  }
  const teamColor = team === 'party' ? 0x20e8ff : 0xff2a2a;
  const inner = active ? 0.22 : 0.28;
  const outer = active ? 0.64 : 0.52;
  const ring = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 24), new THREE.MeshBasicMaterial({ color: teamColor }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  ring.scale.setScalar(1 / fig.root.scale.x);
  fig.root.add(ring);
  fig.ring = ring;
}

function addGlow(root: THREE.Object3D, color: number) {
  const material = tagUnit(new THREE.MeshBasicMaterial({ color }));
  const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(Math.cos(angle) * 0.42, 0.72, Math.sin(angle) * 0.42);
    mesh.raycast = () => {};
    root.add(mesh);
  }
}

function registerFigure(unitId: string, team: string, obj: Figure) {
  scene.add(obj.root);
  figuresById.set(unitId, obj);
  setRing(obj, team, state.queue[state.activeIndex] === unitId);
  addGlow(obj.root, team === 'party' ? 0x20e8ff : 0xff2a2a);
}

function placeFigures() {
  const activeId = state.status.kind === 'ongoing' ? state.queue[state.activeIndex] : '';
  for (const unit of state.units) {
    const fig = figuresById.get(unit.id);
    if (!fig) continue;
    fig.root.visible = unit.alive;
    if (!unit.alive) continue;
    const cell = cellAt(unit.pos.x, unit.pos.y);
    fig.root.position.set(unit.pos.x, cell.height * 0.45, unit.pos.y);
    setRing(fig, unit.team, unit.id === activeId);
  }
  rebuildHighlights();
}

registerFigure('a', 'party', makeHuman(0x30f0ff));
registerFigure('b', 'party', makeHuman(0x70ffc0, { coat: true, visor: 0x30f0ff }));

type Selection = { kind: 'move'; x: number; y: number } | { kind: 'strike'; id: string } | null;
let selection: Selection = null;
let log = '';
let press: { downX: number; downY: number; x: number; y: number; az: number; el: number } | null = null;

function remember(nextLog: string) {
  if (nextLog) log = nextLog;
}

function play(commands: Command[]) {
  if (state.status.kind === 'decided') return;
  const played = runCommands(state, commands);
  state = played.state;
  remember(played.log);
  selection = null;
  const settled = settleMachines(state);
  state = settled.state;
  remember(settled.log);
  placeFigures();
}

play([]);

const hud = document.getElementById('hud')!;
let ready = false;
loadRobotFactory('models/RobotExpressive.glb').then((makeRobot) => {
  registerFigure('c', 'machines', makeRobot(0xff3030, 1.35));
  registerFigure('d', 'machines', makeRobot(0xff6a20, 1.7));
  placeFigures();
  ready = true;
});

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function unitIdOf(object: THREE.Object3D): string | undefined {
  let node: THREE.Object3D | null = object;
  while (node) {
    for (const [id, fig] of figuresById) {
      if (fig.root === node) return id;
    }
    node = node.parent;
  }
  return undefined;
}

function pickFloor(event: PointerEvent): { x: number; y: number } | null {
  const rect = renderer.domElement.getBoundingClientRect();
  ndc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(ndc, camera);
  const figures = [...figuresById.values()].filter((fig) => fig.root.visible).map((fig) => fig.root);
  const figureHit = raycaster.intersectObjects(figures, true)[0];
  if (figureHit) {
    const id = unitIdOf(figureHit.object);
    const unit = id ? state.units.find((candidate) => candidate.id === id && candidate.alive) : undefined;
    if (unit) return { x: unit.pos.x, y: unit.pos.y };
  }
  const hits = raycaster.intersectObjects(floorMeshes, false);
  if (hits.length === 0) return null;
  const data = hits[0].object.userData as { x: number; y: number };
  return { x: data.x, y: data.y };
}

function onPointerUp(event: PointerEvent) {
  if (!press) return;
  const gesture = pointerGesture({ x: press.downX, y: press.downY }, { x: event.clientX, y: event.clientY });
  const saved = { az: press.az, el: press.el };
  press = null;
  if (gesture === 'orbit') return;
  cam.az = saved.az;
  cam.el = saved.el;
  placeCamera();
  const active = activeUnit(state);
  if (state.status.kind === 'decided' || !active || active.team !== 'party') {
    selection = null;
    rebuildHighlights();
    return;
  }
  const tile = pickFloor(event);
  if (!tile) {
    selection = null;
    rebuildHighlights();
    return;
  }
  const strikeId = state.units.find(
    (unit) =>
      unit.alive &&
      unit.pos.x === tile.x &&
      unit.pos.y === tile.y &&
      strikeHighlights(state).includes(unit.id),
  )?.id;
  if (strikeId) {
    if (selection?.kind === 'strike' && selection.id === strikeId) play(planStrike(state, strikeId));
    else selection = { kind: 'strike', id: strikeId };
    rebuildHighlights();
    return;
  }
  const move = moveHighlights(state).find((coord) => coord.x === tile.x && coord.y === tile.y);
  if (move) {
    if (selection?.kind === 'move' && selection.x === move.x && selection.y === move.y) play(planMove(state, move));
    else selection = { kind: 'move', x: move.x, y: move.y };
    rebuildHighlights();
    return;
  }
  selection = null;
  rebuildHighlights();
}

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

renderer.domElement.addEventListener('pointerdown', (e) => {
  press = { downX: e.clientX, downY: e.clientY, x: e.clientX, y: e.clientY, az: cam.az, el: cam.el };
  cam.orbit = false;
});
addEventListener('pointerup', (e) => onPointerUp(e));
addEventListener('pointermove', (e) => {
  if (!press) return;
  cam.az -= (e.clientX - press.x) * 0.006;
  cam.el = THREE.MathUtils.clamp(cam.el + (e.clientY - press.y) * 0.004, 0.25, 1.2);
  press = { ...press, x: e.clientX, y: e.clientY };
});
addEventListener('wheel', (e) => {
  cam.zoom = THREE.MathUtils.clamp(cam.zoom * (e.deltaY > 0 ? 0.92 : 1.08), 0.5, 3);
});

document.getElementById('end-turn')!.addEventListener('click', () => {
  const active = activeUnit(state);
  if (active?.team === 'party') play([{ type: 'endTurn', unitId: active.id }]);
});

if (params.has('hidehud')) hud.style.display = 'none';

function updateHud() {
  const u = ascii.analyse.uniforms;
  const activeId = state.status.kind === 'ongoing' ? state.queue[state.activeIndex] : '—';
  const active = state.units.find((unit) => unit.id === activeId);
  let text =
    `ASCII SIMULATION // render test\n` +
    `cell ${ascii.cellSize}px  grid ${ascii.grid.x}x${ascii.grid.y}\n` +
    `[+/-] cell size  [drag/←→↑↓] orbit  [wheel] zoom\n` +
    `[O] auto-orbit ${cam.orbit ? 'on' : 'off'}  [G] glitch ${u.glitchAmt.value ? 'on' : 'off'}  [R] rain ${u.rainAmt.value ? 'on' : 'off'}  [E] edges ${u.edgeOn.value ? 'on' : 'off'}  [H] hud\n` +
    `active ${activeId}  AP ${active?.ap ?? 0}\n`;
  const unitLines = state.units
    .filter((unit) => unit.alive)
    .map((unit) => `${unit.id} ${unit.hp}`)
    .join('\n');
  text += unitLines;
  if (log) text += `\n${log}`;
  if (state.status.kind === 'decided') text += `\n${state.status.winner} wins`;
  hud.textContent = text;
}

placeFigures();

let time = 0;
function step(dt: number) {
  time += dt;
  if (cam.orbit) cam.az += dt * 0.12;
  if (keys.has('ArrowLeft')) cam.az += dt * 1.2;
  if (keys.has('ArrowRight')) cam.az -= dt * 1.2;
  if (keys.has('ArrowUp')) cam.el = Math.min(1.2, cam.el + dt * 0.8);
  if (keys.has('ArrowDown')) cam.el = Math.max(0.25, cam.el - dt * 0.8);
  placeCamera();
  for (const fig of figuresById.values()) fig.animate(dt, false, time);
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
