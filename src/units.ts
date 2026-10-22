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

function requireClip(animations: THREE.AnimationClip[], name: string) {
  const clip = THREE.AnimationClip.findByName(animations, name);
  if (!clip) throw new Error(`missing clip ${name}`);
  return clip;
}

function assertCloneable(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.Material | THREE.Material[] | null;
    if (!src || Array.isArray(src) || !('color' in src)) throw new Error('material cannot be cloned');
  });
}

async function loadClipFactory(url: string, idleName: string, walkName: string, punchName: string) {
  const gltf = await new GLTFLoader().loadAsync(url);
  requireClip(gltf.animations, idleName);
  requireClip(gltf.animations, walkName);
  requireClip(gltf.animations, punchName);
  assertCloneable(gltf.scene);
  return (color: number, height: number) => {
    const model = SkeletonUtils.clone(gltf.scene) as THREE.Object3D;
    const mats = new Map<THREE.Material, THREE.Material>();
    model.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!mats.has(src)) {
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
    const clip = (n: string) => mixer.clipAction(requireClip(gltf.animations, n));
    const idle = clip(idleName);
    const walk = clip(walkName);
    const punch = clip(punchName);
    punch.setLoop(THREE.LoopOnce, 1);
    punch.clampWhenFinished = false;
    idle.play();
    walk.play();
    walk.setEffectiveWeight(0);
    let w = 0;
    let nextPunch = 3 + Math.random() * 3;
    let striking = false;
    const animate = (dt: number, moving: boolean, time: number, strike?: boolean) => {
      w += ((moving ? 1 : 0) - w) * Math.min(1, dt * 6);
      walk.setEffectiveWeight(w);
      idle.setEffectiveWeight(1 - w);
      if (strike === true) {
        if (!striking) {
          punch.reset().play();
          striking = true;
        }
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

/** RobotExpressive (Quaternius, CC0) re-skinned as a hostile machine program. */
export function loadRobotFactory(url: string) {
  return loadClipFactory(url, 'Idle', 'Walking', 'Punch');
}

/** Baked Quaternius humanoid. Clips are Idle, Walking, and Punch. */
export function loadHumanFactory(url: string) {
  return loadClipFactory(url, 'Idle', 'Walking', 'Punch');
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
