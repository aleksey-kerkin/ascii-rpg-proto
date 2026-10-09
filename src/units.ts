import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { tagUnit } from './scene';

export interface Unit {
  name: string;
  root: THREE.Object3D;
  path: THREE.Vector2[];
  speed: number;
  baseY: (x: number, z: number) => number;
  // runtime
  seg: number; dir: number; t: number; pause: number;
  animate(dt: number, moving: boolean, time: number): void;
}

const unitMat = (color: number, emissive: number, ei = 0.35) =>
  tagUnit(new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: ei, roughness: 0.6, metalness: 0.1, flatShading: true }));

/** Low-poly human built from primitives, with a procedural walk cycle. */
export function makeHuman(color: number, opts: { coat?: boolean; visor?: number; bulk?: number } = {}) {
  const bulk = opts.bulk ?? 1;
  const body = unitMat(color, color, 0.25);
  const dark = unitMat(new THREE.Color(color).multiplyScalar(0.45).getHex(), color, 0.08);
  const visor = unitMat(opts.visor ?? 0xffffff, opts.visor ?? 0xffffff, 1.2);
  const root = new THREE.Group();
  const rig = new THREE.Group();
  root.add(rig);
  const box = (w: number, h: number, d: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d); const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; return mesh;
  };
  const limb = (w: number, h: number, m: THREE.Material, x: number, y: number) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const mesh = box(w, h, w, m); mesh.position.y = -h / 2; pivot.add(mesh); rig.add(pivot); return pivot;
  };
  const legL = limb(0.13 * bulk, 0.42, dark, -0.08 * bulk, 0.44);
  const legR = limb(0.13 * bulk, 0.42, dark, 0.08 * bulk, 0.44);
  const torso = box(0.32 * bulk, 0.36, 0.2 * bulk, body); torso.position.y = 0.62; rig.add(torso);
  if (opts.coat) { const c = box(0.36 * bulk, 0.26, 0.24 * bulk, dark); c.position.y = 0.42; rig.add(c); }
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), body); head.position.y = 0.92; head.castShadow = true; rig.add(head);
  const v = box(0.2, 0.05, 0.06, visor); v.position.set(0, 0.94, 0.11); rig.add(v);
  const armL = limb(0.1 * bulk, 0.38, body, -0.22 * bulk, 0.78);
  const armR = limb(0.1 * bulk, 0.38, body, 0.22 * bulk, 0.78);
  const gun = box(0.07, 0.07, 0.36, dark); gun.position.set(0, -0.36, 0.14); armR.add(gun);
  root.scale.setScalar(1.25);

  let phase = 0;
  const animate = (dt: number, moving: boolean, time: number, strike?: boolean) => {
    phase += dt * (moving ? 9 : 0);
    const s = moving ? Math.sin(phase) : 0;
    legL.rotation.x = s * 0.7; legR.rotation.x = -s * 0.7;
    armL.rotation.x = -s * 0.6;
    armR.rotation.x = strike === true ? -1.6 : moving ? s * 0.3 - 0.4 : -0.9 + Math.sin(time * 1.3) * 0.05;
    rig.position.y = moving ? Math.abs(Math.cos(phase)) * 0.04 : Math.sin(time * 2) * 0.01;
    torso.rotation.y = moving ? s * 0.1 : 0;
  };
  return { root, animate };
}

/** RobotExpressive (Quaternius, CC0) re-skinned as a hostile machine program. */
export async function loadRobotFactory(url: string) {
  const gltf = await new GLTFLoader().loadAsync(url);
  return (color: number, height: number) => {
    const model = SkeletonUtils.clone(gltf.scene) as THREE.Object3D;
    const mats = new Map<THREE.Material, THREE.Material>();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!mats.has(src)) {
        // keep the original shading contrast but push it into the machine palette
        const lum = src.color ? src.color.r * 0.3 + src.color.g * 0.59 + src.color.b * 0.11 : 0.5;
        const c = new THREE.Color(color).multiplyScalar(0.35 + lum * 0.9);
        const isEye = (src.name || '').toLowerCase().includes('black') ? false : lum < 0.12;
        mats.set(src, unitMat(c.getHex(), isEye ? 0xffffff : color, isEye ? 0.9 : 0.3));
      }
      mesh.material = mats.get(src)!;
    });
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const s = height / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    const root = new THREE.Group();
    root.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const clip = (n: string) => mixer.clipAction(THREE.AnimationClip.findByName(gltf.animations, n)!);
    const idle = clip('Idle'), walk = clip('Walking'), punch = clip('Punch');
    punch.setLoop(THREE.LoopOnce, 1); punch.clampWhenFinished = false;
    idle.play(); walk.play(); walk.setEffectiveWeight(0);
    let w = 0; let nextPunch = 3 + Math.random() * 3;
    let striking = false;
    const animate = (dt: number, moving: boolean, time: number, strike?: boolean) => {
      w += ((moving ? 1 : 0) - w) * Math.min(1, dt * 6);
      walk.setEffectiveWeight(w); idle.setEffectiveWeight(1 - w);
      if (strike === true) {
        if (!striking) { punch.reset().play(); striking = true; }
      } else {
        striking = false;
        if (strike === undefined && !moving && time > nextPunch) {
          punch.reset().play();
          nextPunch = time + 4 + Math.random() * 3;
        }
      }
      mixer.update(dt);
    };
    return { root, animate };
  };
}

export function stepUnit(u: Unit, dt: number, time: number) {
  let moving = false;
  if (u.path.length > 1) {
    if (u.pause > 0) { u.pause -= dt; }
    else {
      const a = u.path[u.seg], b = u.path[u.seg + u.dir];
      const len = a.distanceTo(b);
      u.t += (dt * u.speed) / len;
      moving = true;
      if (u.t >= 1) {
        u.t = 0; u.seg += u.dir;
        if (u.seg + u.dir < 0 || u.seg + u.dir >= u.path.length) { u.dir *= -1; u.pause = 1.4; }
      }
    }
  }
  const a = u.path[u.seg], b = u.path[Math.max(0, Math.min(u.path.length - 1, u.seg + u.dir))];
  const x = a.x + (b.x - a.x) * u.t, z = a.y + (b.y - a.y) * u.t;
  u.root.position.set(x, u.baseY(x, z), z);
  if (b.distanceTo(a) > 0.01 && (moving || u.pause > 0)) {
    const target = Math.atan2(b.x - a.x, b.y - a.y);
    let d = target - u.root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    u.root.rotation.y += d * Math.min(1, dt * 8);
  }
  u.animate(dt, moving, time);
}
