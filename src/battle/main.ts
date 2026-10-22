import * as THREE from 'three';
import { createBattle } from '../core';
import type { BattleState, Cell, Command, Coord } from '../core';
import { AsciiPass } from '../ascii';
import { tagUnit } from '../scene';
import { makeHuman, loadRobotFactory } from '../units';
import { patchEllipse, pxToCells } from '../pixels';
import { firstEncounter } from '../tactics/encounter';
import { pointerGesture } from '../tactics/gesture';
import {
  activeUnit,
  moveHighlights,
  planMove,
  planStrike,
  strikeHighlights,
} from '../tactics/plan';
import { scriptCommands, scriptSettle, type Beat } from './turn';
import { spawnBeats } from './spawn';
import { captionFrame } from './caption';

const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');

const created = createBattle(firstEncounter);
if (!created.ok) throw new Error(created.error);
let state: BattleState = created.state;

const MAP_W = state.map.width;
const MAP_H = state.map.height;

const STEP_S = 0.32;
const STRIKE_POSE_S = 0.4;

type Phase = 'loading' | 'spawn' | 'live' | 'failed';
let phase: Phase = 'loading';

type Runner = { beats: Beat[]; index: number; elapsed: number; from: THREE.Vector3 | null };
let runner: Runner | null = null;

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: CAPTURE });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const world = new THREE.Group();
scene.add(world);

const captionCanvas = document.createElement('canvas');
captionCanvas.width = 256;
captionCanvas.height = 64;
const captionTex = new THREE.CanvasTexture(captionCanvas);
captionTex.magFilter = THREE.LinearFilter;
const caption = new THREE.Mesh(
  new THREE.PlaneGeometry(1.4, 0.35),
  tagUnit(new THREE.MeshBasicMaterial({ map: captionTex, transparent: true, depthWrite: false })),
);
caption.visible = false;
caption.raycast = () => {};
scene.add(caption);

function paintCaption(text: string, color: number, alpha: number) {
  const ctx = captionCanvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, 256, 64);
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.font = '48px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 32);
  captionTex.needsUpdate = true;
  caption.visible = alpha > 0 && text.length > 0;
}

function teamColor(team: string): number {
  return team === 'party' ? 0x20e8ff : 0xff2a2a;
}

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
  animate: (dt: number, moving: boolean, time: number, strike?: boolean) => void;
  ring?: THREE.Mesh;
};

function face(fig: Figure, to: { x: number; y: number }) {
  const dx = to.x - fig.root.position.x;
  const dz = to.y - fig.root.position.z;
  if (dx * dx + dz * dz < 1e-6) return;
  fig.root.rotation.y = Math.atan2(dx, dz);
}

function markRing(unitId: string) {
  for (const unit of state.units) {
    const fig = figuresById.get(unit.id);
    if (!fig) continue;
    setRing(fig, unit.team, unit.id === unitId);
  }
}
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

function patchAt(fig: Figure) {
  const box = new THREE.Box3().setFromObject(fig.root);
  if (box.isEmpty()) {
    ascii.setPatch(null);
    return;
  }
  const xs = [box.min.x, box.max.x];
  const ys = [box.min.y, box.max.y];
  const zs = [box.min.z, box.max.z];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const x of xs) {
    for (const y of ys) {
      for (const z of zs) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        const px = (p.x * 0.5 + 0.5) * ascii.analyse.uniforms.res.value.x;
        const py = (p.y * 0.5 + 0.5) * ascii.analyse.uniforms.res.value.y;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
    }
  }
  const w = maxX - minX;
  const h = maxY - minY;
  if (!(w > 0) || !(h > 0)) {
    ascii.setPatch(null);
    return;
  }
  const ellipse = patchEllipse({ x: minX, y: minY, w, h });
  const cell = ascii.analyse.uniforms.cellPx.value;
  ascii.setPatch({
    centerX: pxToCells(ellipse.centerX, cell.x),
    centerY: pxToCells(ellipse.centerY, cell.y),
    halfW: pxToCells(ellipse.halfW, cell.x),
    halfH: pxToCells(ellipse.halfH, cell.y),
  });
}

function registerFigure(unitId: string, team: string, obj: Figure) {
  obj.root.visible = false;
  scene.add(obj.root);
  figuresById.set(unitId, obj);
  setRing(obj, team, state.queue[state.activeIndex] === unitId);
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

function onDrained() {
  if (phase === 'spawn') {
    phase = 'live';
    const settled = scriptSettle(state);
    state = settled.state;
    remember(settled.log);
    startBeats(settled.beats);
    return;
  }
  runner = null;
  ascii.setPatch(null);
  caption.visible = false;
  placeFigures();
}

function startBeats(beats: Beat[]) {
  if (beats.length === 0) {
    onDrained();
    return;
  }
  runner = { beats, index: 0, elapsed: 0, from: null };
  beginBeat();
}

function beginBeat() {
  if (!runner) return;
  const beat = runner.beats[runner.index];
  const fig = figuresById.get(beat.unitId);
  runner.elapsed = 0;
  runner.from = null;
  if (!fig) {
    runner.index += 1;
    if (runner.index >= runner.beats.length) onDrained();
    else beginBeat();
    return;
  }
  markRing(beat.unitId);
  if (beat.kind === 'spawn') {
    const unit = state.units.find((candidate) => candidate.id === beat.unitId);
    if (!unit) return;
    const cell = cellAt(unit.pos.x, unit.pos.y);
    fig.root.position.set(unit.pos.x, cell.height * 0.45, unit.pos.y);
    fig.root.visible = true;
  }
  if (beat.kind === 'step') runner.from = fig.root.position.clone();
  if (beat.kind === 'strike') {
    const target = state.units.find((candidate) => candidate.id === beat.targetId);
    if (target) face(fig, target.pos);
  }
}

function finishBeat() {
  if (!runner) return;
  runner.index += 1;
  if (runner.index >= runner.beats.length) onDrained();
  else beginBeat();
}

function play(commands: Command[]) {
  if (phase !== 'live' || runner || state.status.kind === 'decided') return;
  const played = scriptCommands(state, commands);
  const settled = scriptSettle(played.state);
  state = settled.state;
  remember(played.log);
  remember(settled.log);
  selection = null;
  disposeHighlights();
  startBeats([...played.beats, ...settled.beats]);
}

const hud = document.getElementById('hud')!;
let ready = false;
loadRobotFactory('models/RobotExpressive.glb').then((makeRobot) => {
  registerFigure('c', 'machines', makeRobot(0xff3030, 1.35));
  registerFigure('d', 'machines', makeRobot(0xff6a20, 1.7));
  phase = 'spawn';
  startBeats(spawnBeats(['a', 'b', 'c', 'd'], ['c', 'd']));
  ready = true;
}).catch(() => { phase = 'failed'; });

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
  if (runner || phase !== 'live') return;
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
  if (runner || phase !== 'live') return;
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

let time = 0;
function step(dt: number) {
  time += dt;
  if (cam.orbit) cam.az += dt * 0.12;
  if (keys.has('ArrowLeft')) cam.az += dt * 1.2;
  if (keys.has('ArrowRight')) cam.az -= dt * 1.2;
  if (keys.has('ArrowUp')) cam.el = Math.min(1.2, cam.el + dt * 0.8);
  if (keys.has('ArrowDown')) cam.el = Math.max(0.25, cam.el - dt * 0.8);
  placeCamera();
  const beat = runner?.beats[runner.index];
  const actor = beat ? figuresById.get(beat.unitId) : undefined;
  if (runner && beat && actor) {
    runner.elapsed += dt;
    if (beat.kind === 'step' && runner.from) {
      const t = Math.min(1, runner.elapsed / STEP_S);
      const cell = cellAt(beat.to.x, beat.to.y);
      const dest = new THREE.Vector3(beat.to.x, cell.height * 0.45, beat.to.y);
      actor.root.position.lerpVectors(runner.from, dest, t);
      face(actor, beat.to);
      actor.animate(dt, true, time, false);
      if (t >= 1) finishBeat();
    } else if (beat.kind === 'strike' || beat.kind === 'spawn') {
      const lines = beat.kind === 'spawn' ? beat.lines : [beat.text];
      const frame = captionFrame(lines, runner.elapsed * 1000);
      const ownerId = beat.kind === 'strike' ? beat.targetId : beat.unitId;
      const owner = state.units.find((unit) => unit.id === ownerId);
      const ownerFig = figuresById.get(ownerId);
      if (owner && ownerFig) {
        paintCaption(frame.text, teamColor(owner.team), frame.alpha);
        caption.position.set(ownerFig.root.position.x, ownerFig.root.position.y + 1.45, ownerFig.root.position.z);
        caption.lookAt(camera.position);
        patchAt(ownerFig);
      }
      actor.animate(dt, false, time, beat.kind === 'strike' && runner.elapsed < STRIKE_POSE_S);
      if (frame.done) {
        if (beat.kind === 'strike') {
          const target = state.units.find((unit) => unit.id === beat.targetId);
          const targetFig = target ? figuresById.get(target.id) : undefined;
          if (target && targetFig && !target.alive) targetFig.root.visible = false;
        }
        ascii.setPatch(null);
        caption.visible = false;
        finishBeat();
      }
    }
  }
  for (const [id, fig] of figuresById) {
    if (actor && fig === actor) continue;
    fig.animate(dt, false, time, false);
  }
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
